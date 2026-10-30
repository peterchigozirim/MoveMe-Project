import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "unit-test-secret";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.PAYSTACK_SECRET_KEY ||= "paystack-test-secret";
process.env.REDIS_HOST ||= "127.0.0.1";

const { default: prisma } = await import("../src/config/database.js");
const { default: redis } = await import("../src/config/redis.js");
const { default: departureQueue } =
	await import("../src/jobs/queue/departure.queue.js");
const { default: AuthService } =
	await import("../src/services/auth.service.js");
const authentication =
	await import("../src/services/authentication.service.js");
const { default: VehicleService } =
	await import("../src/services/vehicle.service.js");
const { default: NotificationService } =
	await import("../src/services/notification.service.js");
const issues = await import("../src/services/issues.service.js");
const adminAudit = await import("../src/services/admin/admin.audit.service.js");
const adminIssues =
	await import("../src/services/admin/admin.issue.service.js");
const { default: AdminDriversService } =
	await import("../src/services/admin/admin.drivers.service.js");
const { default: AdminUserService } =
	await import("../src/services/admin/user.service.js");
const { default: AdminRouteService } =
	await import("../src/services/admin/admin.route.service.js");
const adminService = await import("../src/services/admin/admin.service.js");
const passengerRides =
	await import("../src/services/passenger/rides.service.js");
const driverDepartures =
	await import("../src/services/driver/departure.service.js");
const rideService = await import("../src/services/ride.service.js");
const statusUpdates = await import("../src/services/statusUpdate.service.js");
const paystack = await import("../src/services/payment/paystack.service.js");
const { stub } = await import("./helpers.js");
const bcrypt = (await import("bcrypt")).default;
const jwt = (await import("jsonwebtoken")).default;

test.after(async () => {
	redis.disconnect();
	await departureQueue.close(true);
	await prisma.$disconnect();
});

function transaction(t, tx) {
	stub(t, prisma, "$transaction", async (callback) => callback(tx));
}

const noQuery = async () => [];
const emptyTx = () => ({
	$queryRaw: noQuery,
	auditLog: { create: async () => ({}) },
});

test("AuthService registers a passenger, issues tokens, and rejects duplicate users", async (t) => {
	const service = new AuthService();
	const user = {
		id: "user-1",
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		role: "PASSENGER",
	};
	stub(t, prisma.user, "findUnique", async () => null);
	stub(t, prisma.user, "create", async () => user);
	const registered = await service.registerUser({
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		password: "a-strong-password",
		phone: "123",
		role: "passenger",
	});
	assert.equal(registered.user, user);
	assert.equal(service.verifyToken(registered.token).userId, user.id);
	assert.equal(
		service.verifyToken(service.generateToken("id", "e", "n")).email,
		"e",
	);

	stub(t, prisma.user, "findUnique", async () => user);
	await assert.rejects(() => service.registerUser({ email: user.email }), {
		status: 409,
	});
});

test("AuthService logs in, retrieves profiles, updates users, and changes passwords", async (t) => {
	const service = new AuthService();
	const passwordHash = await bcrypt.hash("old-password", 4);
	const user = {
		id: "user-1",
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		passwordHash,
		role: "PASSENGER",
	};
	stub(t, prisma.user, "findUnique", async () => user);
	const login = await service.loginUser(user.email, "old-password");
	assert.equal(login.user.id, user.id);
	assert.equal(service.verifyToken(login.token).userId, user.id);
	assert.equal((await service.getProfile(user.id)).id, user.id);
	stub(t, prisma.user, "update", async ({ data }) => ({
		id: user.id,
		...data,
	}));
	assert.equal(
		(await service.updateUser(user.id, "Ada", user.email)).id,
		user.id,
	);
	assert.equal(
		(await service.changePassword(user.id, "old-password", "new-password"))
			.userId,
		user.id,
	);
	await assert.rejects(
		() => service.loginUser(user.email, "wrong-password"),
		{
			status: 401,
		},
	);
	stub(t, prisma.user, "findUnique", async () => null);
	await assert.rejects(() => service.getProfile(user.id), { status: 404 });
	await assert.rejects(
		() => service.changePassword(user.id, "old-password", "new-password"),
		{ status: 404 },
	);
});

test("authentication service registers safe users and verifies credentials", async (t) => {
	const user = {
		id: "user-1",
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		phone: "123",
		role: "PASSENGER",
		passwordHash: "hashed",
	};
	stub(t, prisma.user, "create", async () => user);
	const registered = await authentication.registerUser({
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ADA@example.com",
		password: "password",
		phone: "123",
	});
	assert.equal(registered.user, user);
	assert.ok(registered.token);
	stub(t, prisma.user, "findUnique", async () => user);
	stub(t, bcrypt, "compare", async () => true);
	const login = await authentication.loginUser("ADA@example.com", "password");
	assert.equal(login.user.id, user.id);
	assert.equal("passwordHash" in login.user, false);
	stub(t, prisma.user, "findUnique", async () => null);
	await assert.rejects(
		() => authentication.loginUser("missing@example.com", "password"),
		{ status: 401 },
	);
});

test("vehicle service enforces driver ownership and creates or fetches a vehicle", async (t) => {
	const service = new VehicleService();
	const vehicle = { id: "vehicle-1", driverId: "driver-1" };
	stub(t, prisma.user, "findUnique", async () => ({ role: "DRIVER" }));
	stub(t, prisma.vehicle, "findFirst", async () => null);
	stub(t, prisma.vehicle, "create", async () => vehicle);
	assert.equal(
		(
			await service.addVehicle(
				{
					registration: "ABC",
					make: "Toyota",
					model: "Yaris",
					color: "Blue",
					seats: 4,
				},
				"driver-1",
			)
		).id,
		vehicle.id,
	);
	stub(t, prisma.vehicle, "findFirst", async () => vehicle);
	assert.equal((await service.getVehicle("driver-1")).id, vehicle.id);
	stub(t, prisma.user, "findUnique", async () => null);
	await assert.rejects(() => VehicleService.getUser("missing"), {
		status: 404,
	});
	stub(t, prisma.user, "findUnique", async () => ({ role: "PASSENGER" }));
	await assert.rejects(
		() => service.addVehicle({ registration: "X" }, "user-1"),
		{ status: 400 },
	);
	stub(t, prisma.vehicle, "findFirst", async () => null);
	await assert.rejects(() => service.getVehicle("driver-1"), { status: 404 });
});

test("notification service lists user notifications and marks an item read", async (t) => {
	const service = new NotificationService();
	const note = { id: "note-1" };
	stub(t, prisma.notification, "findMany", async () => [note]);
	stub(t, prisma.notification, "update", async () => note);
	assert.deepEqual(await service.getNotifications("user-1"), [note]);
	assert.equal((await service.markAsRead(note.id)).id, note.id);
	stub(t, prisma.notification, "findMany", async () => []);
	await assert.rejects(() => service.getNotifications("user-1"), {
		status: 404,
	});
});

test("reporter issue service lists, scopes, creates, and handles missing issues", async (t) => {
	const issue = { id: "issue-1", reporterId: "user-1" };
	stub(t, prisma.operationalIssue, "findMany", async () => [issue]);
	stub(t, prisma.operationalIssue, "findUnique", async () => issue);
	stub(t, prisma.operationalIssue, "create", async () => issue);
	assert.deepEqual(await issues.getAllIssues("user-1"), [issue]);
	assert.equal((await issues.getIssueById(issue.id, "user-1")).id, issue.id);
	assert.equal(
		(await issues.createIssue({ title: "title" }, "user-1")).id,
		issue.id,
	);
	stub(t, prisma.operationalIssue, "findMany", async () => []);
	await assert.rejects(() => issues.getAllIssues("user-1"), { status: 404 });
	stub(t, prisma.operationalIssue, "findUnique", async () => null);
	await assert.rejects(() => issues.getIssueById(issue.id, "user-1"), {
		status: 404,
	});
});

test("audit service returns log entries and reports missing records", async (t) => {
	const record = { id: "audit-1" };
	stub(t, prisma.auditLog, "findMany", async () => [record]);
	stub(t, prisma.auditLog, "findUnique", async () => record);
	assert.deepEqual(await adminAudit.getAllAudits(), [record]);
	assert.equal((await adminAudit.getAuditById(record.id)).id, record.id);
	stub(t, prisma.auditLog, "findMany", async () => []);
	await assert.rejects(() => adminAudit.getAllAudits(), { status: 404 });
	stub(t, prisma.auditLog, "findUnique", async () => null);
	await assert.rejects(() => adminAudit.getAuditById(record.id), {
		status: 404,
	});
});

test("admin issue service supports CRUD and not-found paths", async (t) => {
	const issue = { id: "issue-1", reporterId: "user-1" };
	stub(t, prisma.operationalIssue, "findMany", async () => [issue]);
	stub(t, prisma.operationalIssue, "findUnique", async () => issue);
	stub(t, prisma.operationalIssue, "create", async () => issue);
	stub(t, prisma.operationalIssue, "update", async () => issue);
	stub(t, prisma.operationalIssue, "delete", async () => issue);
	assert.deepEqual(await adminIssues.getAllIssues(), [issue]);
	assert.equal((await adminIssues.getIssueById(issue.id)).id, issue.id);
	assert.equal(
		(await adminIssues.createIssue({ title: "x" }, "user-1")).id,
		issue.id,
	);
	assert.equal(
		(await adminIssues.updateIssue(issue.id, { status: "RESOLVED" })).id,
		issue.id,
	);
	assert.equal((await adminIssues.deleteIssue(issue.id)).id, issue.id);
	stub(t, prisma.operationalIssue, "findMany", async () => []);
	await assert.rejects(() => adminIssues.getAllIssues(), { status: 404 });
	stub(t, prisma.operationalIssue, "findUnique", async () => null);
	await assert.rejects(() => adminIssues.getIssueById(issue.id), {
		status: 404,
	});
});

test("admin driver service lists, retrieves, enables, disables, and rejects invalid drivers", async (t) => {
	const service = new AdminDriversService();
	const driver = { id: "driver-1", driverEnabled: false };
	stub(t, prisma.user, "findMany", async () => [driver]);
	stub(t, prisma.user, "findUnique", async ({ select }) =>
		Object.keys(select ?? {}).length === 1 && select?.driverEnabled
			? { driverEnabled: false }
			: driver,
	);
	stub(t, prisma.user, "update", async () => ({
		...driver,
		driverEnabled: true,
	}));
	assert.deepEqual(await service.listDrivers(), [driver]);
	assert.equal((await service.getDriverById(driver.id)).id, driver.id);
	assert.equal((await service.enableDriver(driver.id)).driverEnabled, true);
	stub(t, prisma.user, "findUnique", async () => ({ driverEnabled: true }));
	stub(t, prisma.user, "update", async () => ({
		...driver,
		driverEnabled: false,
	}));
	assert.equal((await service.disableDriver(driver.id)).driverEnabled, false);
	await assert.rejects(() => service.enableDriver(driver.id), {
		status: 400,
	});
	stub(t, prisma.user, "findUnique", async () => null);
	await assert.rejects(() => service.getDriverById(driver.id), {
		status: 404,
	});
});

test("admin user service supports CRUD and missing record errors", async (t) => {
	const service = new AdminUserService();
	const user = { id: "user-1" };
	stub(t, prisma.user, "findMany", async () => [user]);
	stub(t, prisma.user, "findUnique", async () => user);
	stub(t, prisma.user, "update", async () => user);
	stub(t, prisma.user, "delete", async () => user);
	assert.deepEqual(await service.listUsers(), [user]);
	assert.equal((await service.getUserById(user.id)).id, user.id);
	assert.equal(
		(await service.updateUserById(user.id, { firstName: "Ada" })).id,
		user.id,
	);
	assert.equal(
		(await service.deleteUserById(user.id)).message,
		"User deleted successfully",
	);
	stub(t, prisma.user, "findMany", async () => []);
	await assert.rejects(() => service.listUsers(), { status: 404 });
	stub(t, prisma.user, "findUnique", async () => null);
	await assert.rejects(() => service.getUserById(user.id), { status: 404 });
	await assert.rejects(() => service.deleteUserById(user.id), {
		status: 404,
	});
});

test("admin route service lists routes, creates, updates, deletes, and reports conflicts", async (t) => {
	const service = new AdminRouteService();
	const route = { id: "route-1", origin: "Lagos" };
	stub(t, prisma.route, "findMany", async () => [route]);
	stub(t, prisma.route, "findUnique", async () => route);
	stub(t, prisma.route, "findFirst", async () => null);
	transaction(t, {
		...emptyTx(),
		route: {
			create: async () => route,
			update: async () => route,
			delete: async () => route,
		},
	});
	assert.deepEqual(await service.listRoutes(), [route]);
	assert.deepEqual(await service.listAllRoutes(), [route]);
	assert.equal((await service.getRouteById(route.id)).id, route.id);
	assert.equal((await service.createRoute("admin-1", route)).id, route.id);
	assert.equal(
		(await service.updateRoute("admin-1", route.id, route)).id,
		route.id,
	);
	assert.equal((await service.deleteRoute("admin-1", route.id)).id, route.id);
	stub(t, prisma.route, "findFirst", async () => route);
	await assert.rejects(() => service.createRoute("admin-1", route), {
		status: 400,
	});
	stub(t, prisma.route, "findUnique", async () => null);
	await assert.rejects(() => service.getRouteById(route.id), { status: 404 });
});

test("legacy admin service queries and creates routes, vehicles, drivers, issues, and notifications", async (t) => {
	const route = { id: "route-1" };
	const vehicle = { id: "vehicle-1" };
	const driver = { id: "driver-1", role: "DRIVER" };
	const issue = { id: "issue-1", status: "OPEN" };
	const note = { id: "note-1", userId: "user-1" };
	stub(t, prisma.route, "findMany", async () => [route]);
	stub(t, prisma.vehicle, "findMany", async () => [vehicle]);
	stub(t, prisma.vehicle, "findFirst", async () => vehicle);
	stub(t, prisma.vehicle, "findUnique", async () => vehicle);
	stub(t, prisma.vehicle, "create", async () => vehicle);
	stub(t, prisma.vehicle, "update", async () => vehicle);
	stub(t, prisma.user, "findMany", async () => [driver]);
	stub(t, prisma.user, "findUnique", async () => driver);
	stub(t, prisma.notification, "findMany", async () => [note]);
	stub(t, prisma.notification, "updateMany", async () => ({ count: 1 }));
	stub(t, prisma.notification, "findFirst", async () => note);
	stub(t, prisma.notification, "findUnique", async () => note);
	stub(t, prisma.operationalIssue, "findMany", async () => [issue]);
	stub(t, prisma.operationalIssue, "findUnique", async () => issue);
	assert.deepEqual(await adminService.listRoutes(), [route]);
	assert.deepEqual(await adminService.listAllRoutes(), [route]);
	assert.equal(
		(await adminService.createVehicle("driver-1", {})).id,
		vehicle.id,
	);
	assert.deepEqual(await adminService.listVehicles("driver-1"), [vehicle]);
	assert.equal(
		(await adminService.updateVehicle("driver-1", vehicle.id, {})).id,
		vehicle.id,
	);
	assert.deepEqual(await adminService.listDrivers(), [driver]);
	assert.deepEqual(await adminService.listIssues(), [issue]);
	assert.deepEqual(await adminService.listNotifications("user-1"), [note]);
	assert.equal(
		(await adminService.markNotificationRead("user-1", note.id)).id,
		note.id,
	);
});

test("passenger ride service finds routes and retrieves reservations", async (t) => {
	const route = { id: "route-1", departures: [] };
	const ride = { id: "ride-1", passengerId: "passenger-1" };
	stub(t, prisma.route, "findMany", async () => [route]);
	stub(t, prisma.ride, "findMany", async () => [ride]);
	stub(t, prisma.ride, "findUnique", async () => ride);
	assert.deepEqual(await passengerRides.searchRoutes({ origin: " Lagos " }), [
		route,
	]);
	assert.deepEqual(await passengerRides.getRoute(), [route]);
	assert.deepEqual(
		await passengerRides.getAllReservations({ id: "passenger-1" }),
		[ride],
	);
	assert.equal(
		(await passengerRides.getReservation({ id: "passenger-1" }, ride.id))
			.id,
		ride.id,
	);
	stub(t, prisma.route, "findMany", async () => []);
	await assert.rejects(() => passengerRides.searchRoutes({}), {
		status: 404,
	});
});

test("passenger ride service places idempotent holds and cancels confirmed reservations", async (t) => {
	const passenger = { id: "passenger-1" };
	const ride = { id: "ride-1", passengerId: passenger.id };
	let currentRide;
	const tx = {
		...emptyTx(),
		ride: {
			findUnique: async ({ where }) =>
				where.idempotencyKey ? null : currentRide,
			findMany: async () => [],
			create: async () => ride,
			update: async () => ride,
		},
		departure: {
			findUnique: async () => ({
				id: "departure-1",
				driverId: "driver-1",
				status: "OPEN",
				departureTime: new Date(Date.now() + 3_600_000),
				mode: "POOL",
				totalSeats: 4,
				fare: 100,
				trip: { id: "trip-1", status: "NOT_STARTED" },
				rides: [],
			}),
		},
		payment: { update: async () => ({}) },
	};
	transaction(t, tx);
	assert.equal(
		(
			await passengerRides.createReservation(
				passenger,
				"departure-1",
				"key-1",
			)
		).id,
		ride.id,
	);
	currentRide = {
		...ride,
		status: "CONFIRMED",
		departureId: "departure-1",
		departure: {
			departureTime: new Date(Date.now() + 3_600_000),
			trip: { status: "NOT_STARTED" },
		},
		payment: { id: "payment-1", status: "SUCCESS" },
	};
	assert.deepEqual(
		await passengerRides.cancelReservation(passenger, ride.id),
		{ cancelled: true, refundIssued: true },
	);
	await assert.rejects(
		() => passengerRides.createReservation(passenger, "departure-1", ""),
		{ status: 400 },
	);
});

test("driver departure service publishes departures and queries owned resources", async (t) => {
	const route = {
		id: "route-1",
		isActive: true,
		durationMinutes: 30,
		soloFare: 10,
		pooledFare: 5,
	};
	const vehicle = { id: "vehicle-1", seats: 4 };
	const departure = { id: "departure-1", departureTime: new Date() };
	stub(t, departureQueue, "add", async () => ({}));
	transaction(t, {
		...emptyTx(),
		route: { findUnique: async () => route },
		vehicle: { findFirst: async () => vehicle },
		departure: {
			findMany: async () => [],
			create: async () => departure,
			findUnique: async () => ({
				...departure,
				driverId: "driver-1",
				trip: { id: "trip-1", status: "NOT_STARTED" },
				rides: [],
			}),
			findFirst: async () => departure,
			update: async () => departure,
		},
		trip: {
			findFirst: async () => null,
			update: async () => ({ id: "trip-1", status: "ARRIVED" }),
		},
		ride: {
			updateMany: async () => ({ count: 1 }),
			update: async () => ({}),
		},
		notification: { create: async () => ({}) },
		payment: { update: async () => ({}) },
	});
	const driver = { id: "driver-1" };
	assert.equal(
		(
			await driverDepartures.publishDeparture(driver, {
				routeId: route.id,
				departureTime: new Date(Date.now() + 3_600_000),
				mode: "SOLO",
			})
		).id,
		departure.id,
	);
	await assert.rejects(
		() =>
			driverDepartures.publishDeparture(driver, {
				routeId: route.id,
				departureTime: new Date(Date.now() - 1_000),
				mode: "SOLO",
			}),
		{ status: 400 },
	);
	stub(t, prisma.departure, "findMany", async () => [departure]);
	stub(t, prisma.departure, "findFirst", async () => departure);
	stub(t, prisma.route, "findMany", async () => [route]);
	assert.deepEqual(await driverDepartures.getAllDepartures(driver), [
		departure,
	]);
	assert.equal(
		(await driverDepartures.getOneDeparture(driver, departure.id)).id,
		departure.id,
	);
	assert.deepEqual(await driverDepartures.getAllRoutes(), [route]);
	assert.deepEqual(await driverDepartures.getDriverDepartures(driver.id), [
		departure,
	]);
	assert.equal(
		(await driverDepartures.cancelDeparture(driver, departure.id))
			.cancelled,
		true,
	);
	assert.equal(
		(await driverDepartures.updateTrip(driver, departure.id, "ARRIVED"))
			.status,
		"ARRIVED",
	);
});

test("legacy ride service searches and retrieves passenger and driver data", async (t) => {
	const departure = {
		id: "departure-1",
		totalSeats: 4,
		mode: "POOL",
		rides: [],
	};
	const ride = { id: "ride-1" };
	stub(t, prisma.departure, "findMany", async () => [departure]);
	stub(t, prisma.ride, "findMany", async () => [ride]);
	stub(t, prisma.ride, "findUnique", async () => ride);
	const search = await rideService.searchDepartures({
		routeId: "route-1",
		mode: "POOL",
		timing: "scheduled",
	});
	assert.equal(search.available, true);
	assert.equal(search.departures[0].availableSeats, 4);
	assert.deepEqual(await rideService.getPassengerRides("passenger-1"), [
		ride,
	]);
	assert.deepEqual(await rideService.getDriverDepartures("driver-1"), [
		departure,
	]);
});

test("legacy ride service publishes departures using route and vehicle snapshots", async (t) => {
	const route = {
		id: "route-1",
		isActive: true,
		durationMinutes: 45,
		soloFare: 50,
	};
	const vehicle = { id: "vehicle-1", seats: 4 };
	const departure = { id: "departure-1" };
	transaction(t, {
		...emptyTx(),
		route: { findUnique: async () => route },
		vehicle: { findFirst: async () => vehicle },
		departure: {
			findMany: async () => [],
			create: async () => departure,
		},
	});
	assert.equal(
		(
			await rideService.publishDeparture(
				{ id: "driver-1" },
				{
					routeId: route.id,
					vehicleId: vehicle.id,
					departureTime: new Date(Date.now() + 3_600_000),
					mode: "SOLO",
				},
			)
		).id,
		departure.id,
	);
});

test("legacy ride service creates reservations and settles simulated payments", async (t) => {
	const passenger = { id: "passenger-1" };
	const heldRide = { id: "ride-1", passengerId: passenger.id };
	const tx = {
		...emptyTx(),
		ride: {
			findUnique: async ({ where, include }) => {
				if (where.idempotencyKey) return null;
				if (include?.payment) {
					return {
						...heldRide,
						status: "CONFIRMED",
						departureId: "departure-1",
						departure: {
							departureTime: new Date(Date.now() + 3_600_000),
							trip: { status: "NOT_STARTED" },
						},
						payment: { id: "payment-1", status: "SUCCESS" },
					};
				}
				return {
					id: heldRide.id,
					passengerId: passenger.id,
					departureId: "departure-1",
				};
			},
			findMany: async () => [],
			create: async () => heldRide,
			update: async () => heldRide,
			updateMany: async () => ({ count: 1 }),
		},
		departure: {
			findUnique: async ({ include }) =>
				include?.rides
					? {
							id: "departure-1",
							driverId: "driver-1",
							status: "OPEN",
							trip: { id: "trip-1", status: "NOT_STARTED" },
							rides: [],
						}
					: {
							id: "departure-1",
							driverId: "driver-1",
							status: "OPEN",
							departureTime: new Date(Date.now() + 3_600_000),
							mode: "POOL",
							totalSeats: 4,
							fare: 100,
							trip: { id: "trip-1", status: "NOT_STARTED" },
						},
			update: async () => ({}),
		},
		payment: {
			findUnique: async () => ({
				id: "payment-1",
				passengerId: passenger.id,
				rideId: heldRide.id,
				status: "PENDING",
				expiresAt: new Date(Date.now() + 300_000),
				ride: { departure: { id: "departure-1" } },
			}),
			update: async () => ({ id: "payment-1", status: "SUCCESS" }),
		},
		trip: {
			findFirst: async () => null,
			update: async ({ data }) => ({ id: "trip-1", ...data }),
		},
		notification: { create: async () => ({}) },
	};
	transaction(t, tx);
	assert.equal(
		(await rideService.createReservation(passenger, "departure-1", "key-1"))
			.id,
		heldRide.id,
	);
	assert.equal(
		(await rideService.simulatePayment(passenger, "payment-1", "success"))
			.status,
		"SUCCESS",
	);
	await assert.rejects(
		() => rideService.simulatePayment(passenger, "payment-1", "unknown"),
		{ status: 400 },
	);
	assert.equal(
		(await rideService.cancelReservation(passenger, heldRide.id)).cancelled,
		true,
	);
	assert.equal(
		(await rideService.cancelDeparture({ id: "driver-1" }, "departure-1"))
			.cancelled,
		true,
	);
	assert.equal(
		(
			await rideService.updateTrip(
				{ id: "driver-1" },
				"departure-1",
				"ARRIVED",
			)
		).status,
		"ARRIVED",
	);
});

test("status update services close elapsed departures and expire pending payments", async (t) => {
	stub(t, prisma.departure, "updateMany", async () => ({ count: 2 }));
	const closed = await statusUpdates.updateDepartureStatus();
	assert.equal(closed.closedDepartures, 2);
	transaction(t, {
		payment: {
			findMany: async () => [
				{ rideId: "ride-1", passengerId: "passenger-1" },
			],
			updateMany: async () => ({ count: 1 }),
		},
		ride: { updateMany: async () => ({ count: 1 }) },
	});
	const updated = await statusUpdates.updateFailedPaymentsStatus();
	assert.equal(updated.failedPayments, 1);
	assert.equal(updated.cancelledRides, 1);
});

test("admin service transactions record route, driver, issue, and notification changes", async (t) => {
	const route = { id: "route-1" };
	const issue = { id: "issue-1", status: "OPEN" };
	const driver = { id: "driver-1", role: "DRIVER" };
	stub(t, prisma.route, "findUnique", async () => route);
	stub(t, prisma.vehicle, "findFirst", async () => ({ id: "vehicle-1" }));
	stub(t, prisma.vehicle, "create", async () => ({ id: "vehicle-1" }));
	stub(t, prisma.user, "findUnique", async () => driver);
	stub(t, prisma.operationalIssue, "findUnique", async () => issue);
	let readResult = { count: 1 };
	stub(t, prisma.notification, "updateMany", async () => readResult);
	stub(t, prisma.notification, "findFirst", async () => ({ id: "note-1" }));
	stub(t, prisma.notification, "findUnique", async () => ({ id: "note-1" }));
	const tx = {
		...emptyTx(),
		route: {
			create: async () => route,
			update: async () => route,
		},
		user: { update: async () => driver },
		operationalIssue: {
			create: async () => issue,
			update: async () => ({ ...issue, status: "RESOLVED" }),
		},
		auditLog: { create: async () => ({}) },
	};
	transaction(t, tx);
	assert.equal((await adminService.createRoute("admin-1", {})).id, route.id);
	assert.equal(
		(await adminService.updateRoute("admin-1", route.id, {})).id,
		route.id,
	);
	assert.equal(
		(await adminService.setDriverAccess("admin-1", driver.id, true)).id,
		driver.id,
	);
	assert.equal(
		(await adminService.createIssue("user-1", { title: "x" })).id,
		issue.id,
	);
	assert.equal(
		(await adminService.updateIssue("admin-1", issue.id, "RESOLVED"))
			.status,
		"RESOLVED",
	);
	assert.equal(
		(await adminService.markNotificationRead("user-1", "note-1")).id,
		"note-1",
	);
	readResult = { count: 0 };
	assert.equal(
		(await adminService.markNotificationRead("user-1", "note-1")).id,
		"note-1",
	);
	stub(t, prisma.user, "findUnique", async () => ({ role: "PASSENGER" }));
	await assert.rejects(
		() => adminService.setDriverAccess("admin-1", "user-1", true),
		{ status: 404 },
	);
});

test("JWT authentication service returns rejected credentials without leaking hashes", async (t) => {
	const user = {
		id: "user-1",
		email: "ada@example.com",
		role: "PASSENGER",
		passwordHash: "hash",
	};
	stub(t, prisma.user, "findUnique", async () => user);
	stub(t, bcrypt, "compare", async () => true);
	const result = await authentication.loginUser(user.email, "password");
	assert.equal(jwt.decode(result.token).sub, user.id);
	assert.equal(result.user.passwordHash, undefined);
});

test("Paystack payment initialization returns the gateway checkout information", async (t) => {
	const payment = {
		id: "96d2ac32-5bc5-4b2d-84dd-c99e3dce8f4e",
		passengerId: "passenger-1",
		rideId: "ride-1",
		amount: "25.50",
		currency: "NGN",
		status: "PENDING",
		expiresAt: new Date(Date.now() + 300_000),
	};
	stub(t, prisma.payment, "findUnique", async () => payment);
	let initializedRequest;
	stub(t, globalThis, "fetch", async (url, options) => {
		initializedRequest = { url, options };
		return {
			ok: true,
			json: async () => ({
				status: true,
				data: {
					authorization_url: "https://checkout.example",
					access_code: "access",
					reference: "reference",
				},
			}),
		};
	});
	const result = await paystack.initializePayment(
		{ id: payment.passengerId, email: "passenger@example.com" },
		payment.id,
	);
	assert.deepEqual(result, {
		authorizationUrl: "https://checkout.example",
		accessCode: "access",
		reference: "reference",
	});
	assert.equal(
		initializedRequest.url.endsWith("/transaction/initialize"),
		true,
	);
	assert.equal(JSON.parse(initializedRequest.options.body).amount, 2550);
});

test("Paystack verification verifies ownership and settles successful payments", async (t) => {
	const paymentId = "96d2ac32-5bc5-4b2d-84dd-c99e3dce8f4e";
	const payment = {
		id: paymentId,
		passengerId: "passenger-1",
		rideId: "ride-1",
		amount: "25.50",
		currency: "NGN",
		status: "PENDING",
		expiresAt: new Date(Date.now() + 300_000),
		ride: {
			departureId: "departure-1",
			departure: { driverId: "driver-1" },
		},
	};
	stub(t, prisma.payment, "findUnique", async () => ({
		passengerId: payment.passengerId,
		ride: { departure: { driverId: "driver-1" } },
	}));
	let transactionQuery = false;
	transaction(t, {
		...emptyTx(),
		$queryRaw: async () => {
			transactionQuery = true;
			return [];
		},
		payment: {
			findUnique: async ({ include }) => (include ? payment : payment),
			update: async () => ({ ...payment, status: "SUCCESS" }),
		},
		ride: {
			update: async () => ({ id: payment.rideId, status: "CONFIRMED" }),
		},
	});
	stub(t, globalThis, "fetch", async () => ({
		ok: true,
		json: async () => ({
			status: true,
			data: {
				status: "success",
				amount: 2550,
				currency: "NGN",
				reference: `${paymentId}-timestamp`,
			},
		}),
	}));
	const result = await paystack.verifyPayment(`${paymentId}-timestamp`, {
		id: payment.passengerId,
	});
	assert.equal(result.status, "SUCCESS");
	assert.equal(transactionQuery, true);

	await assert.rejects(
		() =>
			paystack.verifyPayment(`${paymentId}-timestamp`, {
				id: "someone-else",
			}),
		{ status: 404 },
	);
});

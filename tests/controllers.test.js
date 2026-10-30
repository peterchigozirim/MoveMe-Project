import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "unit-test-secret";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.REDIS_HOST ||= "127.0.0.1";

const { default: prisma } = await import("../src/config/database.js");
const { default: departureQueue } =
	await import("../src/jobs/queue/departure.queue.js");
const redis = (await import("../src/config/redis.js")).default;
const AuthService = (await import("../src/services/auth.service.js")).default;
const AdminDriversService = (
	await import("../src/services/admin/admin.drivers.service.js")
).default;
const NotificationService = (
	await import("../src/services/notification.service.js")
).default;
const AuthController = (
	await import("../src/controller/auth/auth.controller.js")
).default;
const AdminRoutesController = (
	await import("../src/controller/admin/admin.route.controller.js")
).default;
const AdminUsersController = (
	await import("../src/controller/admin/admin.users.controller.js")
).default;
const AdminDriverController = (
	await import("../src/controller/admin/admin.driver.controller.js")
).default;
const AdminIssueController = (
	await import("../src/controller/admin/admin.issue.controller.js")
).default;
const AdminAuditController = (
	await import("../src/controller/admin/admin.audit.controller.js")
).default;
const IssueController = (await import("../src/controller/issue.controller.js"))
	.default;
const BookRideController = (
	await import("../src/controller/passenger/bookRide.controller.js")
).default;
const NotificationController = (
	await import("../src/controller/notification/notification.controller.js")
).default;
const DepartureController = (
	await import("../src/controller/driver/departure.controller.js")
).default;
const VehicleController = (
	await import("../src/controller/driver/vehicle.controller.js")
).default;
const { response, stub } = await import("./helpers.js");

test.after(async () => {
	redis.disconnect();
	await departureQueue.close(true);
	await prisma.$disconnect();
});

function request({
	body = {},
	params = {},
	user = { id: "user-1" },
	get,
} = {}) {
	return {
		body,
		params,
		user,
		get: get ?? (() => "idempotency-key"),
	};
}

async function invoke(controller, method, req = request(), t) {
	const res = response();
	let error;
	await controller[method](req, res, (nextError) => {
		error = nextError;
	});
	return { res, error };
}

test("auth controller returns register, login, profile and password responses", async (t) => {
	stub(t, AuthService.prototype, "registerUser", async (input) => input);
	stub(t, AuthService.prototype, "loginUser", async () => ({
		token: "token",
	}));
	stub(t, AuthService.prototype, "getProfile", async () => ({
		id: "user-1",
	}));
	stub(t, AuthService.prototype, "changePassword", async () => ({}));

	const registration = await invoke(
		AuthController,
		"registerUser",
		request({ body: { email: "ada@example.com" } }),
		t,
	);
	assert.equal(registration.res.statusCode, 201);
	assert.deepEqual(registration.res.body.data, { email: "ada@example.com" });

	const login = await invoke(
		AuthController,
		"loginUser",
		request({ body: { email: "ada@example.com", password: "pass" } }),
		t,
	);
	assert.equal(login.res.statusCode, 200);
	assert.equal(login.res.body.data.token, "token");

	const profile = await invoke(AuthController, "getProfile");
	assert.equal(profile.res.body.data.id, "user-1");

	const changed = await invoke(
		AuthController,
		"changePassword",
		request({
			body: { oldPassword: "old-password", newPassword: "new-password" },
		}),
	);
	assert.equal(changed.res.body.message, "Password changed successfully");
	assert.equal(changed.res.body.data, undefined);
});

test("auth controller forwards service failures", async (t) => {
	const failure = new Error("registration failed");
	stub(t, AuthService.prototype, "registerUser", async () => {
		throw failure;
	});
	const result = await invoke(AuthController, "registerUser", request());
	assert.equal(result.error, failure);
});

test("admin route controller responds to list, lookup, create, update and delete", async (t) => {
	const routeRecord = { id: "route-1", origin: "Lagos" };
	stub(t, prisma.route, "findMany", async () => [routeRecord]);
	stub(t, prisma.route, "findUnique", async () => routeRecord);
	stub(t, prisma.route, "findFirst", async () => null);
	stub(t, prisma, "$transaction", async (callback) =>
		callback({
			route: {
				create: async () => routeRecord,
				update: async () => routeRecord,
				delete: async () => routeRecord,
			},
			auditLog: { create: async () => ({}) },
		}),
	);
	const controller = new AdminRoutesController();

	assert.equal(
		(await invoke(controller, "listRoutes")).res.body.data[0],
		routeRecord,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"getRouteById",
				request({ params: { id: "route-1" } }),
			)
		).res.body.data,
		routeRecord,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"createRoute",
				request({ body: { origin: "Lagos" } }),
			)
		).res.statusCode,
		201,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"updateRoute",
				request({ params: { id: "route-1" } }),
			)
		).res.body.data,
		routeRecord,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"deleteRoute",
				request({ params: { id: "route-1" } }),
			)
		).res.body.message,
		"Route deleted successfully",
	);
});

test("admin user controller handles list, get, update and delete", async (t) => {
	const userRecord = { id: "user-1" };
	stub(t, prisma.user, "findMany", async () => [userRecord]);
	stub(t, prisma.user, "findUnique", async () => userRecord);
	stub(t, prisma.user, "update", async () => userRecord);
	stub(t, prisma.user, "delete", async () => userRecord);
	const controller = new AdminUsersController();

	assert.equal(
		(await invoke(controller, "listUsers")).res.body.data[0],
		userRecord,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"getUserById",
				request({ params: { id: "user-1" } }),
			)
		).res.body.data,
		userRecord,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"updateUserById",
				request({ params: { id: "user-1" } }),
			)
		).res.body.data,
		userRecord,
	);
	assert.deepEqual(
		(
			await invoke(
				controller,
				"deleteUserById",
				request({ params: { id: "user-1" } }),
			)
		).res.body.data,
		{ message: "User deleted successfully" },
	);
});

test("admin driver controller handles list, get, enable and disable", async (t) => {
	const driver = { id: "driver-1", driverEnabled: true };
	for (const method of [
		"listDrivers",
		"getDriverById",
		"enableDriver",
		"disableDriver",
	]) {
		stub(t, AdminDriversService.prototype, method, async () => driver);
	}
	const controller = new AdminDriverController();
	for (const method of [
		"listDrivers",
		"getDriverById",
		"enableDriver",
		"disableDriver",
	]) {
		const result = await invoke(
			controller,
			method,
			request({ params: { id: "driver-1" } }),
		);
		assert.equal(result.res.body.data, driver);
	}
});

test("admin issue controller returns values for all issue operations", async (t) => {
	const issue = { id: "issue-1", status: "OPEN" };
	stub(t, prisma.operationalIssue, "findMany", async () => [issue]);
	stub(t, prisma.operationalIssue, "findUnique", async () => issue);
	stub(t, prisma.operationalIssue, "create", async () => issue);
	stub(t, prisma.operationalIssue, "update", async () => issue);
	stub(t, prisma.operationalIssue, "delete", async () => issue);
	const controller = new AdminIssueController();

	assert.deepEqual((await invoke(controller, "listIssues")).res.body, [
		issue,
	]);
	assert.deepEqual(
		(
			await invoke(
				controller,
				"getIssueById",
				request({ params: { id: "issue-1" } }),
			)
		).res.body,
		issue,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"createNewIssue",
				request({ body: { title: "title" } }),
			)
		).res.statusCode,
		201,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"update",
				request({ params: { id: "issue-1" } }),
			)
		).res.body.data,
		issue,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"delete",
				request({ params: { id: "issue-1" } }),
			)
		).res.body.data,
		issue,
	);
});

test("admin audit controller returns audit data and maps service failures", async (t) => {
	const auditRecord = { id: "audit-1" };
	stub(t, prisma.auditLog, "findMany", async () => [auditRecord]);
	stub(t, prisma.auditLog, "findUnique", async () => auditRecord);
	assert.deepEqual(
		(await invoke(AdminAuditController, "getAudits")).res.body.data,
		[auditRecord],
	);
	assert.equal(
		(
			await invoke(
				AdminAuditController,
				"getOneAuditById",
				request({ params: { id: "audit-1" } }),
			)
		).res.body.data,
		auditRecord,
	);

	const failure = new Error("audit unavailable");
	stub(t, prisma.auditLog, "findMany", async () => {
		throw failure;
	});
	const failed = await invoke(AdminAuditController, "getAudits");
	assert.equal(failed.res.statusCode, 500);
	assert.equal(failed.res.body.error, failure.message);
});

test("issue controller handles reporter list, lookup, create, and errors", async (t) => {
	const issueRecord = { id: "issue-1" };
	stub(t, prisma.operationalIssue, "findMany", async () => [issueRecord]);
	stub(t, prisma.operationalIssue, "findUnique", async () => issueRecord);
	stub(t, prisma.operationalIssue, "create", async () => issueRecord);
	const controller = new IssueController();

	assert.deepEqual((await invoke(controller, "listIssues")).res.body, [
		issueRecord,
	]);
	assert.equal(
		(
			await invoke(
				controller,
				"getIssueById",
				request({ params: { id: "issue-1" } }),
			)
		).res.body,
		issueRecord,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"createNewIssue",
				request({ body: { title: "x" } }),
			)
		).res.statusCode,
		201,
	);
	const failure = new Error("issue service failed");
	stub(t, prisma.operationalIssue, "findMany", async () => {
		throw failure;
	});
	assert.equal((await invoke(controller, "listIssues")).error, failure);
});

test("passenger ride controller handles missing input and delegates reservation operations", async (t) => {
	stub(t, prisma.route, "findMany", async () => [{ id: "route-1" }]);
	stub(t, prisma.ride, "findMany", async () => [{ id: "ride-1" }]);
	stub(t, prisma.ride, "findUnique", async () => ({ id: "ride-1" }));
	stub(t, prisma, "$transaction", async (callback) =>
		callback({
			ride: {
				findUnique: async () => null,
				findMany: async () => [],
				create: async () => ({ id: "ride-1" }),
				update: async () => ({ id: "ride-1" }),
			},
			departure: {
				findUnique: async () => ({
					id: "departure-1",
					status: "OPEN",
					departureTime: new Date(Date.now() + 60_000),
					mode: "POOL",
					totalSeats: 2,
					fare: 100,
				}),
			},
			auditLog: { create: async () => ({}) },
			$queryRaw: async () => [],
		}),
	);
	const controller = new BookRideController();
	assert.equal(
		(await invoke(controller, "searchRide")).res.body.status,
		true,
	);
	assert.equal(
		(await invoke(controller, "getAllRoute")).res.body.status,
		true,
	);
	assert.equal(
		(await invoke(controller, "handleGetAllReservations")).res.body.status,
		true,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"handleGetReservation",
				request({ params: { rideId: "ride-1" } }),
			)
		).res.body.status,
		true,
	);
	assert.equal(
		(await invoke(controller, "handleCreateReservation", request())).res
			.statusCode,
		400,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"handleCreateReservation",
				request({ body: { departureId: "departure-1" } }),
			)
		).res.statusCode,
		201,
	);
	assert.equal(
		(await invoke(controller, "handleCancelReservation", request())).res
			.statusCode,
		422,
	);
});

test("notification controller handles list, mark-as-read, and errors", async (t) => {
	stub(t, NotificationService.prototype, "getNotifications", async () => [
		{ id: "notification-1" },
	]);
	stub(t, NotificationService.prototype, "markAsRead", async () => ({
		id: "notification-1",
		readAt: new Date(),
	}));
	const controller = new NotificationController();
	assert.equal(
		(await invoke(controller, "getNotifications")).res.body.length,
		1,
	);
	assert.ok(
		(
			await invoke(
				controller,
				"markAsRead",
				request({ params: { id: "notification-1" } }),
			)
		).res.body.readAt,
	);
	const failure = new Error("notification service failed");
	stub(t, NotificationService.prototype, "getNotifications", async () => {
		throw failure;
	});
	assert.equal((await invoke(controller, "getNotifications")).error, failure);
});

test("driver departure controller handles successful reads and missing cancellation input", async (t) => {
	const departure = {
		id: "departure-1",
		departureTime: new Date(Date.now() + 60_000),
	};
	stub(t, prisma.route, "findMany", async () => [{ id: "route-1" }]);
	stub(t, prisma.departure, "findMany", async () => [departure]);
	stub(t, prisma.departure, "findFirst", async () => departure);
	stub(t, prisma, "$transaction", async (callback) =>
		callback({
			$queryRaw: async () => [],
			route: {
				findUnique: async () => ({
					id: "route-1",
					isActive: true,
					durationMinutes: 30,
					soloFare: 10,
				}),
			},
			vehicle: { findFirst: async () => ({ id: "vehicle-1", seats: 4 }) },
			departure: {
				findMany: async () => [],
				findUnique: async () => ({
					id: "departure-1",
					driverId: "user-1",
					status: "OPEN",
					trip: { id: "trip-1", status: "NOT_STARTED" },
					rides: [],
				}),
				create: async () => departure,
				update: async () => departure,
			},
			trip: {
				findFirst: async () => null,
				update: async () => ({ id: "trip-1", status: "ARRIVED" }),
			},
			ride: {
				update: async () => departure,
				updateMany: async () => ({ count: 0 }),
			},
			notification: { create: async () => ({}) },
			auditLog: { create: async () => ({}) },
		}),
	);
	const controller = new DepartureController();
	assert.equal(
		(await invoke(controller, "handleGetAllRoutes")).res.body.success,
		true,
	);
	assert.equal(
		(await invoke(controller, "handleGetAllDepartures")).res.body.success,
		true,
	);
	assert.equal(
		(await invoke(controller, "handleDriverDeparture")).res.body.success,
		true,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"handleGetOneDeparture",
				request({ params: { id: "departure-1" } }),
			)
		).res.body.success,
		true,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"handlePublishDeparture",
				request({
					body: {
						routeId: "route-1",
						departureTime: new Date(
							Date.now() + 3_600_000,
						).toISOString(),
						mode: "SOLO",
					},
				}),
			)
		).res.body.success,
		true,
	);
	assert.equal(
		(await invoke(controller, "handleCancelDeparture", request())).res
			.statusCode,
		422,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"handleCancelDeparture",
				request({
					body: { departureId: "departure-1" },
				}),
			)
		).res.body.success,
		true,
	);
	assert.equal(
		(
			await invoke(
				controller,
				"handleUpdateTrip",
				request({
					body: { departureId: "departure-1", status: "ARRIVED" },
				}),
			)
		).res.body.success,
		true,
	);
});

test("vehicle controller adds and lists vehicles", async (t) => {
	stub(t, prisma.user, "findUnique", async () => ({
		id: "user-1",
		role: "DRIVER",
	}));
	stub(t, prisma.vehicle, "findFirst", async () => null);
	stub(t, prisma.vehicle, "create", async () => ({ id: "vehicle-1" }));
	const added = await invoke(
		VehicleController,
		"addVehicle",
		request({
			body: {
				registration: "ABC",
				make: "Toyota",
				model: "Yaris",
				color: "Blue",
				seats: 4,
			},
		}),
	);
	assert.equal(added.res.statusCode, 201);
	stub(t, prisma.vehicle, "findFirst", async () => ({ id: "vehicle-1" }));
	const listed = await invoke(VehicleController, "getVehicle");
	assert.equal(listed.res.body.data.id, "vehicle-1");
});

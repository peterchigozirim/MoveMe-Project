import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "unit-test-secret";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";

const jwt = (await import("jsonwebtoken")).default;
const { default: prisma } = await import("../src/config/database.js");
const { default: env } = await import("../src/config/env.js");
const { authenticate: sessionAuthenticate } =
	await import("../src/middlewares/session.middleware.js");
const authMiddleware = await import("../src/middlewares/auth.middleware.js");
const roles = await import("../src/middlewares/role.middleware.js");
const { errorHandler } = await import("../src/middlewares/error.middleware.js");
const { asyncHandler, validateRequest } =
	await import("../src/middlewares/request.middleware.js");
const { validateVehicle } =
	await import("../src/middlewares/vehicle.middleware.js");
const issue = await import("../src/middlewares/issue.middleware.js");
const route =
	await import("../src/middlewares/admin/admin.route.middleware.js");
const user = await import("../src/middlewares/admin/admin.user.middleware.js");
const SearchRideMiddleware = (
	await import("../src/middlewares/passenger/passenger.ride.middleware.js")
).default;
const DepartureMiddleware = (
	await import("../src/middlewares/driver/departure.middleware.js")
).default;
const { response, stub } = await import("./helpers.js");
const { z } = await import("zod");

function runMiddleware(middleware, req) {
	const res = response();
	let error;
	let continued = false;
	middleware(req, res, (nextError) => {
		continued = true;
		error = nextError;
	});
	return { res, continued, error };
}

async function runAsyncMiddleware(middleware, req) {
	const res = response();
	let error;
	let continued = false;
	await middleware(req, res, (nextError) => {
		continued = true;
		error = nextError;
	});
	return { res, continued, error };
}

test("session authentication rejects missing, malformed, and unknown sessions", async (t) => {
	for (const authorization of [undefined, "Basic token", "Bearer invalid"]) {
		const { res, continued } = await runAsyncMiddleware(
			sessionAuthenticate,
			{ get: () => authorization },
		);
		assert.equal(continued, false);
		assert.equal(res.statusCode, 401);
	}

	const token = jwt.sign({ userId: "unknown" }, env.jwtSecret);
	stub(t, prisma.user, "findUnique", async () => null);
	const { res, continued } = await runAsyncMiddleware(sessionAuthenticate, {
		get: () => `Bearer ${token}`,
	});
	assert.equal(continued, false);
	assert.equal(res.body.message, "Invalid session");
});

test("session authentication attaches the database user and forwards database errors", async (t) => {
	const token = jwt.sign({ userId: "user-1" }, env.jwtSecret);
	const currentUser = { id: "user-1", role: "PASSENGER" };
	stub(t, prisma.user, "findUnique", async () => currentUser);
	const req = { get: () => `Bearer ${token}` };
	const { continued } = await runAsyncMiddleware(sessionAuthenticate, req);
	assert.equal(continued, true);
	assert.equal(req.user, currentUser);

	const dbError = new Error("database down");
	stub(t, prisma.user, "findUnique", async () => {
		throw dbError;
	});
	const result = await runAsyncMiddleware(sessionAuthenticate, {
		get: () => `Bearer ${token}`,
	});
	assert.equal(result.error, dbError);
});

test("auth middleware validates required user data and credentials", () => {
	for (const middleware of [
		authMiddleware.registerInput,
		authMiddleware.loginInput,
		authMiddleware.changePasswordInput,
	]) {
		const { res, continued } = runMiddleware(middleware, {});
		assert.equal(continued, false);
		assert.equal(res.statusCode, 400);
	}

	const register = {
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		password: "password",
		phone: "123",
		role: "passenger",
	};
	const validRegister = runMiddleware(authMiddleware.registerInput, {
		body: { ...register },
	});
	assert.equal(validRegister.continued, true);
	assert.equal(validRegister.res.statusCode, 200);

	for (const [middleware, body] of [
		[authMiddleware.registerInput, { ...register, email: "bad" }],
		[authMiddleware.loginInput, { email: "bad", password: "" }],
		[
			authMiddleware.changePasswordInput,
			{ oldPassword: "short", newPassword: "short" },
		],
	]) {
		const result = runMiddleware(middleware, { body });
		assert.equal(result.continued, false);
		assert.equal(result.res.statusCode, 400);
		assert.ok(result.res.body.errors.length > 0);
	}

	assert.equal(
		runMiddleware(authMiddleware.authenticate, { user: { id: "1" } })
			.continued,
		true,
	);
	assert.equal(
		runMiddleware(authMiddleware.authenticate, {}).res.statusCode,
		401,
	);
});

test("role middleware allows and rejects each role gate", () => {
	const cases = [
		[roles.authorize("ADMIN"), { role: "ADMIN" }, true],
		[roles.authorize("ADMIN"), { role: "PASSENGER" }, false],
		[roles.checkPassenger, { role: "PASSENGER" }, true],
		[roles.checkPassenger, { role: "DRIVER" }, false],
		[roles.checkDriver, { role: "DRIVER" }, true],
		[roles.checkDriver, { role: "ADMIN" }, false],
		[roles.checkAdmin, { role: "ADMIN" }, true],
		[roles.checkAdmin, undefined, false],
		[
			roles.requireEnabledDriver,
			{ role: "DRIVER", driverEnabled: true },
			true,
		],
		[
			roles.requireEnabledDriver,
			{ role: "DRIVER", driverEnabled: false },
			false,
		],
	];
	for (const [middleware, currentUser, allowed] of cases) {
		const result = runMiddleware(middleware, { user: currentUser });
		assert.equal(result.continued, allowed);
		if (!allowed) assert.equal(result.res.statusCode, 403);
	}
});

test("request validation keeps parsed values and forwards structured errors", () => {
	const req = { body: { count: "3", ignored: true } };
	const valid = runMiddleware(
		validateRequest(z.object({ count: z.coerce.number() })),
		req,
	);
	assert.equal(valid.continued, true);
	assert.deepEqual(req.validated, { count: 3 });

	const invalid = runMiddleware(
		validateRequest(z.object({ count: z.number().positive() })),
		{ body: { count: -1 } },
	);
	assert.equal(invalid.error.status, 400);
	assert.ok(invalid.error.details.length > 0);
});

test("async handler forwards rejected handler promises", async () => {
	const failure = new Error("handler failed");
	let forwarded;
	await asyncHandler(async () => {
		throw failure;
	})({}, {}, (error) => {
		forwarded = error;
	});
	assert.equal(forwarded, failure);
});

test("error handler maps database errors and hides server details", () => {
	for (const [code, status, message] of [
		["P2002", 409, "A record with these details already exists"],
		["P2025", 404, "Record not found"],
		["P2034", 409, "This request conflicted with another update; retry it"],
	]) {
		const res = response();
		errorHandler({ code, message: "private database detail" }, {}, res);
		assert.equal(res.statusCode, status);
		assert.equal(res.body.message, message);
	}
	const res = response();
	errorHandler(
		{ status: 500, message: "secret", details: [{ path: "x" }] },
		{},
		res,
	);
	assert.deepEqual(res.body, {
		message: "Internal server error",
		errors: [{ path: "x" }],
	});
});

test("vehicle and issue middleware accept valid payloads and reject invalid ones", () => {
	const vehicle = {
		registration: "ABC123",
		make: "Toyota",
		model: "Corolla",
		color: "Blue",
		seats: 4,
	};
	assert.equal(
		runMiddleware(validateVehicle, { body: vehicle }).continued,
		true,
	);
	assert.throws(() => validateVehicle({ body: {} }, response(), () => {}), {
		status: 400,
	});

	assert.equal(
		runMiddleware(issue.createIssueSchema, {
			body: { title: "Issue", description: "Details" },
		}).continued,
		true,
	);
	assert.equal(
		runMiddleware(issue.createIssueSchema, { body: {} }).res.statusCode,
		400,
	);
	for (const status of ["OPEN", "IN_PROGRESS", "RESOLVED"]) {
		assert.equal(
			runMiddleware(issue.updateIssueSchema, { body: { status } })
				.continued,
			true,
		);
	}
	assert.equal(
		runMiddleware(issue.updateIssueSchema, { body: { status: "INVALID" } })
			.res.statusCode,
		400,
	);
});

test("admin route and user validators cover missing, invalid, and valid input", () => {
	assert.equal(
		runMiddleware(route.validateRouteInput, {
			body: {
				origin: "Lagos",
				destination: "Abuja",
				durationMinutes: 60,
				soloFare: 10,
				pooledFare: 5,
			},
		}).continued,
		true,
	);
	assert.equal(
		runMiddleware(route.validateRouteInput, {}).res.statusCode,
		400,
	);
	assert.equal(
		runMiddleware(route.validateRouteInput, { body: {} }).res.statusCode,
		400,
	);

	const id = "96d2ac32-5bc5-4b2d-84dd-c99e3dce8f4e";
	assert.equal(
		runMiddleware(user.validateUserId, {
			body: {},
			params: { id },
		}).continued,
		true,
	);
	assert.equal(
		runMiddleware(user.validateUserId, {
			body: {},
			params: { id: "bad" },
		}).res.statusCode,
		400,
	);
	assert.equal(
		runMiddleware(user.validateUserUpdate, {
			body: { email: "ada@example.com" },
		}).continued,
		true,
	);
	assert.equal(
		runMiddleware(user.validateUserUpdate, {}).res.statusCode,
		400,
	);
});

test("passenger ride and departure middlewares validate payloads", () => {
	const search = new SearchRideMiddleware();
	assert.equal(
		runMiddleware(search.searchRideInput, {
			body: { origin: "Lagos", destination: "Abuja" },
		}).continued,
		true,
	);
	assert.equal(
		runMiddleware(search.searchRideInput, {
			body: { origin: 123 },
		}).res.statusCode,
		400,
	);

	const departure = new DepartureMiddleware();
	const cases = [
		[
			departure.validatePublishDeparture.bind(departure),
			{ routeId: "route", departureTime: "2030-01-01", mode: "SOLO" },
		],
		[
			departure.validateCancelDeparture.bind(departure),
			{ departureId: "departure" },
		],
		[
			departure.validateUpdateTrip.bind(departure),
			{ departureId: "departure", status: "COMPLETED" },
		],
	];
	for (const [middleware, body] of cases) {
		assert.equal(runMiddleware(middleware, { body }).continued, true);
		assert.equal(
			runMiddleware(middleware, { body: {} }).res.statusCode,
			400,
		);
	}
});

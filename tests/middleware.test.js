import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
	authorize,
	requireEnabledDriver,
} from "../src/middlewares/role.middleware.js";
import { validateRequest } from "../src/middlewares/request.middleware.js";

function response() {
	return {
		statusCode: 200,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(body) {
			this.body = body;
			return this;
		},
	};
}

test("validation middleware exposes only parsed request values", () => {
	const req = { body: { seats: "3", extra: "discarded" } };
	let forwarded;
	validateRequest(z.object({ seats: z.coerce.number().int().positive() }))(
		req,
		response(),
		(error) => {
			forwarded = error;
		},
	);
	assert.equal(forwarded, undefined);
	assert.deepEqual(req.validated, { seats: 3 });
});

test("validation middleware forwards a structured client error", () => {
	const req = { body: { seats: 0 } };
	let forwarded;
	validateRequest(z.object({ seats: z.number().positive() }))(
		req,
		response(),
		(error) => {
			forwarded = error;
		},
	);
	assert.equal(forwarded.status, 400);
	assert.ok(forwarded.details.length > 0);
});

test("role middleware rejects users outside the allowed role", () => {
	const res = response();
	let continued = false;
	authorize("ADMIN")({ user: { role: "PASSENGER" } }, res, () => {
		continued = true;
	});
	assert.equal(continued, false);
	assert.equal(res.statusCode, 403);
});

test("departure publishing requires an enabled driver account", () => {
	const middleware = requireEnabledDriver;
	for (const user of [
		{ role: "DRIVER", driverEnabled: false },
		{ role: "PASSENGER", driverEnabled: true },
	]) {
		const res = response();
		let continued = false;
		middleware({ user }, res, () => {
			continued = true;
		});
		assert.equal(continued, false);
		assert.equal(res.statusCode, 403);
	}
});

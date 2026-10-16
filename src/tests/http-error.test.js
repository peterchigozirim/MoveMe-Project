import test from "node:test";
import assert from "node:assert/strict";
import { httpError } from "../utils/http-error.js";

test("httpError defaults to 400", () => {
	const err = httpError("bad");
	assert.ok(err instanceof Error);
	assert.equal(err.message, "bad");
	assert.equal(err.status, 400);
});

test("httpError uses the given status", () => {
	assert.equal(httpError("nope", 404).status, 404);
});

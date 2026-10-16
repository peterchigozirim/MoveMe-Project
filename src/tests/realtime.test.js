import test from "node:test";
import assert from "node:assert/strict";
import { emitToUser, emitToUsers, setIO } from "../websocket/realtime.js";

function fakeIO() {
	const calls = [];
	return {
		calls,
		to(room) {
			return { emit: (event, payload) => calls.push({ room, event, payload }) };
		},
	};
}

test("emitToUser targets the user's private room", () => {
	const io = fakeIO();
	setIO(io);
	emitToUser("u1", "payment:completed", { a: 1 });
	assert.deepEqual(io.calls, [
		{ room: "user:u1", event: "payment:completed", payload: { a: 1 } },
	]);
});

test("emitToUsers de-duplicates recipients", () => {
	const io = fakeIO();
	setIO(io);
	emitToUsers(["u1", "u2", "u1"], "trip:updated", { s: "ARRIVED" });
	assert.deepEqual(
		io.calls.map((c) => c.room),
		["user:u1", "user:u2"],
	);
});

test("emitting without an io instance is a no-op", () => {
	setIO(null);
	assert.doesNotThrow(() => emitToUser("u1", "x", {}));
	assert.doesNotThrow(() => emitToUsers([], "x", {}));
});

import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "test-secret";
process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5432/db";

const { default: jwt } = await import("jsonwebtoken");
const { default: initSockets } = await import("../websocket/index.js");

function setup() {
	let middleware;
	let onConnection;
	const io = {
		use: (fn) => (middleware = fn),
		on: (event, fn) => event === "connection" && (onConnection = fn),
		to: () => ({ emit() {} }),
	};
	initSockets(io);
	return { middleware, onConnection };
}

const run = (middleware, socket) =>
	new Promise((resolve) => middleware(socket, resolve));

test("rejects connections without a token", async () => {
	const { middleware } = setup();
	const err = await run(middleware, { handshake: { auth: {} } });
	assert.equal(err.message, "Authentication required");
});

test("rejects invalid tokens", async () => {
	const { middleware } = setup();
	const err = await run(middleware, { handshake: { auth: { token: "bad" } } });
	assert.equal(err.message, "Invalid or expired token");
});

test("accepts a valid token and sets socket.user", async () => {
	const { middleware } = setup();
	const token = jwt.sign(
		{ userId: "u1", email: "a@b.c", name: "A" },
		process.env.JWT_SECRET,
	);
	const socket = { handshake: { auth: { token } } };
	const err = await run(middleware, socket);
	assert.equal(err, undefined);
	assert.equal(socket.user.id, "u1");
});

test("connected sockets join their private user room and channels", async () => {
	const { onConnection } = setup();
	const joined = [];
	const handlers = {};
	const socket = {
		user: { id: "u1" },
		join: (r) => joined.push(r),
		leave: (r) => joined.splice(joined.indexOf(r), 1),
		on: (e, fn) => (handlers[e] = fn),
	};
	onConnection(socket);
	assert.deepEqual(joined, ["user:u1"]);
	let ack;
	await handlers["channel:join"]("c1", (a) => (ack = a));
	assert.deepEqual(ack, { ok: true });
	assert.ok(joined.includes("channel:c1"));
	handlers["channel:leave"]("c1");
	assert.ok(!joined.includes("channel:c1"));
});

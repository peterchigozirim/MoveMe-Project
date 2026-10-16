import test from "node:test";
import assert from "node:assert/strict";
import {
	availableSeats,
	intervalsOverlap,
	reservationIsActive,
} from "../utils/availability.js";

const now = new Date("2026-01-01T10:00:00Z");
const future = new Date("2026-01-01T10:10:00Z");
const past = new Date("2026-01-01T09:50:00Z");

test("intervalsOverlap detects overlap, containment and touching edges", () => {
	assert.equal(intervalsOverlap(1, 5, 3, 8), true);
	assert.equal(intervalsOverlap(1, 10, 3, 4), true);
	assert.equal(intervalsOverlap(1, 5, 5, 8), false);
	assert.equal(intervalsOverlap(1, 2, 3, 4), false);
});

test("reservationIsActive", () => {
	assert.equal(reservationIsActive({ status: "CONFIRMED" }, now), true);
	assert.equal(reservationIsActive({ status: "CANCELLED" }, now), false);
	assert.equal(reservationIsActive({ status: "COMPLETED" }, now), false);
	const held = (status, expiresAt) => ({
		status: "PENDING_PAYMENT",
		payment: { status, expiresAt },
	});
	assert.equal(reservationIsActive(held("PENDING", future), now), true);
	assert.equal(reservationIsActive(held("PENDING", past), now), false);
	assert.equal(reservationIsActive(held("FAILED", future), now), false);
	assert.equal(reservationIsActive({ status: "PENDING_PAYMENT" }, now), false);
});

test("availableSeats for shared departures", () => {
	const dep = { mode: "SHARED", totalSeats: 4 };
	const rides = [
		{ status: "CONFIRMED", seats: 2 },
		{ status: "CANCELLED", seats: 1 },
		{
			status: "PENDING_PAYMENT",
			seats: 1,
			payment: { status: "PENDING", expiresAt: future },
		},
	];
	assert.equal(availableSeats(dep, rides, now), 1);
	assert.equal(availableSeats(dep, [], now), 4);
});

test("availableSeats never goes negative", () => {
	const dep = { mode: "SHARED", totalSeats: 2 };
	assert.equal(availableSeats(dep, [{ status: "CONFIRMED", seats: 5 }], now), 0);
});

test("availableSeats for solo departures is 1 or 0", () => {
	const dep = { mode: "SOLO", totalSeats: 4 };
	assert.equal(availableSeats(dep, [], now), 1);
	assert.equal(availableSeats(dep, [{ status: "CONFIRMED", seats: 1 }], now), 0);
	assert.equal(availableSeats(dep, [{ status: "CANCELLED", seats: 1 }], now), 1);
});

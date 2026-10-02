import test from "node:test";
import assert from "node:assert/strict";
import {
	availableSeats,
	intervalsOverlap,
	reservationIsActive,
} from "../src/utils/availability.js";

test("adjacent departure intervals may meet at a boundary", () => {
	assert.equal(
		intervalsOverlap(
			new Date("2026-10-02T10:00:00Z"),
			new Date("2026-10-02T11:00:00Z"),
			new Date("2026-10-02T11:00:00Z"),
			new Date("2026-10-02T12:00:00Z"),
		),
		false,
	);
	assert.equal(
		intervalsOverlap(
			new Date("2026-10-02T10:00:00Z"),
			new Date("2026-10-02T11:00:00Z"),
			new Date("2026-10-02T10:59:00Z"),
			new Date("2026-10-02T12:00:00Z"),
		),
		true,
	);
});

test("expired and failed holds do not consume pooled seats", () => {
	const now = new Date("2026-10-02T10:00:00Z");
	const rides = [
		{
			status: "PENDING_PAYMENT",
			seats: 1,
			payment: {
				status: "PENDING",
				expiresAt: new Date("2026-10-02T10:01:00Z"),
			},
		},
		{
			status: "PENDING_PAYMENT",
			seats: 1,
			payment: {
				status: "PENDING",
				expiresAt: new Date("2026-10-02T09:59:00Z"),
			},
		},
		{
			status: "CANCELLED",
			seats: 1,
			payment: { status: "FAILED", expiresAt: null },
		},
	];
	assert.equal(availableSeats({ mode: "POOL", totalSeats: 2 }, rides, now), 1);
	assert.equal(reservationIsActive(rides[0], now), true);
	assert.equal(reservationIsActive(rides[1], now), false);
});

test("a solo departure has exclusive availability", () => {
	const now = new Date("2026-10-02T10:00:00Z");
	const heldRide = {
		status: "CONFIRMED",
		seats: 1,
		payment: { status: "SUCCESS" },
	};
	assert.equal(availableSeats({ mode: "SOLO", totalSeats: 4 }, [], now), 1);
	assert.equal(
		availableSeats({ mode: "SOLO", totalSeats: 4 }, [heldRide], now),
		0,
	);
});

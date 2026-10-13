import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";
import {
	availableSeats,
	intervalsOverlap,
	reservationIsActive,
} from "../../utils/availability.js";

const activeRideStatuses = ["PENDING_PAYMENT", "CONFIRMED"];

async function audit(tx, actorId, entityType, entityId, action, details) {
	await tx.auditLog.create({
		data: { actorId, entityType, entityId, action, details },
	});
}

async function activeReservations(tx, departureId, now) {
	const rides = await tx.ride.findMany({
		where: { departureId, status: { in: activeRideStatuses } },
		include: { payment: true },
	});
	const active = rides.filter((ride) => reservationIsActive(ride, now));
	const expired = rides.filter(
		(ride) =>
			ride.status === "PENDING_PAYMENT" &&
			ride.payment?.status === "PENDING" &&
			ride.payment.expiresAt <= now,
	);
	for (const ride of expired) {
		await tx.ride.update({
			where: { id: ride.id },
			data: { status: "CANCELLED" },
		});
		await tx.payment.update({
			where: { id: ride.payment.id },
			data: { status: "EXPIRED" },
		});
		await audit(tx, null, "Ride", ride.id, "PAYMENT_HOLD_EXPIRED", {});
		await audit(tx, null, "Payment", ride.payment.id, "EXPIRED", {});
	}
	return active;
}

// route search and departure publishing services for passengers

export async function searchRoutes({ destination = null, origin = null }) {
	const normalizedDestination = destination?.trim();
	const normalizedOrigin = origin?.trim();

	const routes = await prisma.route.findMany({
		where: {
			isActive: true,
			...(normalizedDestination
				? {
						destination: { equals: normalizedDestination, mode: "insensitive" },
					}
				: {}),
			...(normalizedOrigin
				? { origin: { equals: normalizedOrigin, mode: "insensitive" } }
				: {}),
		},
	});
	if (!routes.length) {
		throw httpError("Destination or origin not found", 404);
	}
	return routes;
}

export async function publishDeparture(driver, input) {
	const departureTime = new Date(input.departureTime);
	if (
		!Number.isFinite(departureTime.getTime()) ||
		departureTime <= new Date()
	) {
		throw httpError("Departure time must be in the future");
	}
	return prisma.$transaction(
		async (tx) => {
			await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${driver.id} FOR UPDATE`;
			const [route, vehicle] = await Promise.all([
				tx.route.findUnique({ where: { id: input.routeId } }),
				tx.vehicle.findFirst({
					where: { id: input.vehicleId, driverId: driver.id, isActive: true },
				}),
			]);
			if (!route?.isActive) throw httpError("Route not found or inactive", 404);
			if (!vehicle)
				throw httpError("Active vehicle not found for this driver", 404);

			const end = new Date(
				departureTime.getTime() + route.durationMinutes * 60_000,
			);
			const existing = await tx.departure.findMany({
				where: {
					status: { not: "CANCELLED" },
					departureTime: { lt: end },
					OR: [{ driverId: driver.id }, { vehicleId: vehicle.id }],
				},
				select: { id: true, departureTime: true, durationMinutes: true },
			});
			if (
				existing.some((item) =>
					intervalsOverlap(
						departureTime,
						end,
						item.departureTime,
						new Date(
							item.departureTime.getTime() + item.durationMinutes * 60_000,
						),
					),
				)
			) {
				throw httpError(
					"Departure overlaps an existing driver or vehicle assignment",
					409,
				);
			}

			const fare = input.mode === "SOLO" ? route.soloFare : route.pooledFare;
			const departure = await tx.departure.create({
				data: {
					driverId: driver.id,
					vehicleId: vehicle.id,
					routeId: route.id,
					departureTime,
					durationMinutes: route.durationMinutes,
					mode: input.mode,
					fare,
					totalSeats: vehicle.seats,
					trip: { create: {} },
				},
				include: { route: true, vehicle: true },
			});
			await audit(tx, driver.id, "Departure", departure.id, "PUBLISHED", {
				routeId: route.id,
				departureTime: departureTime.toISOString(),
				mode: input.mode,
				fare: fare.toString(),
			});
			return departure;
		},
		{ isolationLevel: "ReadCommitted" },
	);
}

export async function searchDepartures({
	destination = null,
	route = null,
	mode,
	timing = "scheduled",
}) {
	const now = new Date();
	const cutoff = new Date(now.getTime() + 15 * 60_000);
	const timeFilter =
		timing === "immediate" ? { gte: now, lte: cutoff } : { gt: cutoff };
	const routeFilter =
		destination || origin
			? {
					OR: [
						...(destination ? [{ destination: { destination } }] : []),
						...(origin
							? [{ origin: { origin } }, { destination: { origin } }]
							: []),
					],
				}
			: {};
	const departures = await prisma.departure.findMany({
		where: {
			...routeFilter,
			mode,
			status: "OPEN",
			departureTime: timeFilter,
			trip: { is: { status: "NOT_STARTED" } },
			driver: { driverEnabled: true },
			vehicle: { isActive: true },
		},
		include: {
			route: { select: { id: true, origin: true, destination: true } },
			driver: { select: { id: true, firstName: true, lastName: true } },
			vehicle: { select: { make: true, model: true, color: true } },
			rides: {
				where: { status: { in: activeRideStatuses } },
				include: { payment: { select: { status: true, expiresAt: true } } },
			},
		},
		orderBy: { departureTime: "asc" },
		take: 100,
	});
	if (!departures.length) {
		return {
			available: false,
			message: "No matching departures are currently available",
			departures: [],
		};
	}
	const results = departures
		.map(({ rides, ...departure }) => {
			return {
				...departure,
				availableSeats: availableSeats(departure, rides, now),
			};
		})
		.filter((departure) => departure.availableSeats > 0);
	return {
		available: results.length > 0,
		message: results.length
			? undefined
			: "No matching departures are currently available",
		departures: results,
	};
}

export async function createReservation(
	passenger,
	departureId,
	idempotencyKey,
) {
	if (!idempotencyKey || idempotencyKey.length > 120) {
		throw httpError("A valid Idempotency-Key header is required", 400);
	}
	try {
		return await prisma.$transaction(
			async (tx) => {
				const previous = await tx.ride.findUnique({
					where: { idempotencyKey },
					include: { payment: true },
				});
				if (previous) {
					if (
						previous.passengerId !== passenger.id ||
						previous.departureId !== departureId
					) {
						throw httpError(
							"Idempotency key was already used for another request",
							409,
						);
					}
					return previous;
				}
				await tx.$queryRaw`SELECT id FROM "Departure" WHERE id = ${departureId} FOR UPDATE`;
				const departure = await tx.departure.findUnique({
					where: { id: departureId },
					include: { trip: true },
				});
				if (!departure || departure.status !== "OPEN")
					throw httpError("Departure is not available", 404);
				const now = new Date();
				if (
					departure.departureTime <= now ||
					["ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(
						departure.trip?.status,
					)
				) {
					throw httpError("Reservations are closed for this departure", 409);
				}
				const reservations = await activeReservations(tx, departure.id, now);
				if (reservations.some((ride) => ride.passengerId === passenger.id)) {
					throw httpError(
						"You already have an active reservation for this departure",
						409,
					);
				}
				if (departure.mode === "SOLO" && reservations.length) {
					throw httpError("This solo departure is already reserved", 409);
				}
				const occupiedSeats = reservations.reduce(
					(total, ride) => total + ride.seats,
					0,
				);
				if (
					departure.mode === "POOL" &&
					occupiedSeats >= departure.totalSeats
				) {
					throw httpError("No seats remain on this departure", 409);
				}
				const expiresAt = new Date(now.getTime() + 5 * 60_000);
				const ride = await tx.ride.create({
					data: {
						idempotencyKey,
						passengerId: passenger.id,
						departureId,
						type: departure.mode,
						seats: 1,
						fare: departure.fare,
						payment: {
							create: {
								passengerId: passenger.id,
								amount: departure.fare,
								expiresAt,
							},
						},
					},
					include: { payment: true, departure: { include: { route: true } } },
				});
				await audit(tx, passenger.id, "Ride", ride.id, "RESERVATION_HELD", {
					expiresAt: expiresAt.toISOString(),
				});
				return ride;
			},
			{ isolationLevel: "ReadCommitted" },
		);
	} catch (error) {
		if (error.code === "P2002") {
			const existing = await prisma.ride.findUnique({
				where: { idempotencyKey },
				include: { payment: true },
			});
			if (
				existing?.passengerId === passenger.id &&
				existing.departureId === departureId
			)
				return existing;
		}
		throw error;
	}
}

export async function simulatePayment(passenger, paymentId, outcome) {
	if (!["success", "failure"].includes(outcome))
		throw httpError("Outcome must be success or failure");
	const result = await prisma.$transaction(
		async (tx) => {
			const payment = await tx.payment.findUnique({
				where: { id: paymentId },
				include: { ride: { include: { departure: true } } },
			});
			if (!payment || payment.passengerId !== passenger.id)
				throw httpError("Payment not found", 404);
			await tx.$queryRaw`SELECT id FROM "Departure" WHERE id = ${payment.ride.departureId} FOR UPDATE`;
			const current = await tx.payment.findUnique({ where: { id: paymentId } });
			if (current.status === "SUCCESS" && outcome === "success") return current;
			if (current.status !== "PENDING")
				throw httpError("Payment is no longer pending", 409);
			const now = new Date();
			if (!current.expiresAt || current.expiresAt <= now) {
				await tx.payment.update({
					where: { id: paymentId },
					data: { status: "EXPIRED" },
				});
				await tx.ride.update({
					where: { id: current.rideId },
					data: { status: "CANCELLED" },
				});
				await audit(tx, passenger.id, "Payment", paymentId, "EXPIRED", {});
				await audit(
					tx,
					passenger.id,
					"Ride",
					current.rideId,
					"PAYMENT_HOLD_EXPIRED",
					{},
				);
				return { expired: true };
			}
			const success = outcome === "success";
			const updated = await tx.payment.update({
				where: { id: paymentId },
				data: {
					status: success ? "SUCCESS" : "FAILED",
					paidAt: success ? now : null,
				},
			});
			await tx.ride.update({
				where: { id: current.rideId },
				data: { status: success ? "CONFIRMED" : "CANCELLED" },
			});
			await audit(
				tx,
				passenger.id,
				"Payment",
				paymentId,
				success ? "SUCCEEDED" : "FAILED",
				{},
			);
			return { expired: false, payment: updated };
		},
		{ isolationLevel: "ReadCommitted" },
	);
	if (result.expired) throw httpError("Payment hold expired", 409);
	return result.payment;
}

export async function cancelReservation(passenger, rideId) {
	return prisma.$transaction(
		async (tx) => {
			const snapshot = await tx.ride.findUnique({ where: { id: rideId } });
			if (!snapshot || snapshot.passengerId !== passenger.id)
				throw httpError("Reservation not found", 404);
			await tx.$queryRaw`SELECT id FROM "Departure" WHERE id = ${snapshot.departureId} FOR UPDATE`;
			const ride = await tx.ride.findUnique({
				where: { id: rideId },
				include: { payment: true, departure: { include: { trip: true } } },
			});
			if (!ride || ride.passengerId !== passenger.id)
				throw httpError("Reservation not found", 404);
			if (
				ride.status !== "CONFIRMED" ||
				ride.departure.departureTime <= new Date() ||
				["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(
					ride.departure.trip?.status,
				)
			) {
				throw httpError("This reservation can no longer be cancelled", 409);
			}
			await tx.ride.update({
				where: { id: ride.id },
				data: { status: "CANCELLED" },
			});
			if (ride.payment?.status === "SUCCESS") {
				await tx.payment.update({
					where: { id: ride.payment.id },
					data: { status: "REFUNDED" },
				});
				await audit(tx, passenger.id, "Payment", ride.payment.id, "REFUNDED", {
					simulated: true,
				});
			}
			await audit(tx, passenger.id, "Ride", ride.id, "CANCELLED_BY_PASSENGER", {
				refundIssued: ride.payment?.status === "SUCCESS",
			});
			return {
				cancelled: true,
				refundIssued: ride.payment?.status === "SUCCESS",
			};
		},
		{ isolationLevel: "ReadCommitted" },
	);
}

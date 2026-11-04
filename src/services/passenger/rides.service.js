import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";
import {
	availableSeats,
	intervalsOverlap,
	reservationIsActive,
} from "../../utils/availability.js";
import { emitToUser } from "../../websocket/realtime.js";

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
		include: {
			departures: {
				where: { status: { not: "CANCELLED" } },
				select: {
					id: true,
					departureTime: true,
					durationMinutes: true,
					mode: true,
					totalSeats: true,
					status: true,
					vehicle: true,
					driver: true,
				},
			},
		},
	});
	if (!routes.length) {
		throw httpError("Destination or origin not found", 404);
	}
	return routes;
}

export async function getRoute() {
	const route = await prisma.route.findMany({
		where: {
			isActive: true,
			departures: { some: { status: { not: "CANCELLED" } } },
		},
		orderBy: { createdAt: "desc" },
		include: {
			departures: {
				where: { status: { not: "CANCELLED" } },
				orderBy: { createdAt: "desc" },
				select: {
					id: true,
					departureTime: true,
					durationMinutes: true,
					mode: true,
					totalSeats: true,
					status: true,
					vehicle: true,
				},
			},
		},
	});
	if (!route.length) {
		throw httpError("Route not found", 404);
	}
	return route;
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

export async function getAllReservations(passenger) {
	return prisma.ride.findMany({
		where: { passengerId: passenger.id },
		include: {
			payment: {
				select: {
					id: true,
					amount: true,
					currency: true,
					status: true,
					expiresAt: true,
					paidAt: true,
				},
			},
			departure: {
				include: {
					route: { select: { origin: true, destination: true } },
					driver: { select: { firstName: true, lastName: true } },
					trip: {
						select: {
							status: true,
							arrivedAt: true,
							startedAt: true,
							completedAt: true,
						},
					},
				},
			},
		},
		orderBy: { createdAt: "desc" },
	});
}

export async function getReservation(passenger, rideId) {
	const reservation = await prisma.ride.findUnique({
		where: { id: rideId, passengerId: passenger.id },
		include: {
			payment: true,
			departure: { include: { route: true, driver: true, trip: true } },
		},
	});
	if (!reservation) {
		throw httpError("Reservation not found", 404);
	}
	return reservation;
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
			const driverId = ride.departure?.driverId;

			emitToUser(driverId, "departure_updated", {
				rideId: ride.id,
				message: "Your reservation has been cancelled.",
			});
			await tx.notification.create({
				data: {
					userId: driverId,
					type: "Departure Cancelled",
					message: "Your departure was cancelled by the passenger.",
				},
			});
			return {
				cancelled: true,
				refundIssued: ride.payment?.status === "SUCCESS",
			};
		},
		{ isolationLevel: "ReadCommitted" },
	);
}

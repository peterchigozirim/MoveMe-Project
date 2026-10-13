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
					where: { driverId: driver.id, isActive: true },
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

export async function getAllDepartures(driver) {
	const departures = await prisma.departure.findMany({
		where: { driverId: driver.id },
		include: { route: true, vehicle: true },
	});
	if (!departures.length) {
		throw httpError("No active departures found", 404);
	}
	return departures;
}

export async function getAllRoutes() {
	const routes = await prisma.route.findMany({
		where: { isActive: true },
		select: {
			id: true,
			origin: true,
			destination: true,
			soloFare: true,
			pooledFare: true,
			durationMinutes: true,
		},
	});
	if (!routes.length) {
		throw httpError("No active routes found", 404);
	}
	return routes;
}

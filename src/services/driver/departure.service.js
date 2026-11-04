import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";
import { emitToUsers } from "../../websocket/realtime.js";
import {
	availableSeats,
	intervalsOverlap,
	reservationIsActive,
} from "../../utils/availability.js";
import departureQueue from "../../jobs/queue/departure.queue.js";

const activeRideStatuses = ["PENDING_PAYMENT", "CONFIRMED"];

async function audit(tx, actorId, entityType, entityId, action, details) {
	await tx.auditLog.create({
		data: { actorId, entityType, entityId, action, details },
	});
}

export async function publishDeparture(driver, input) {
	const departureTime = new Date(input.departureTime);
	if (
		!Number.isFinite(departureTime.getTime()) ||
		departureTime <= new Date()
	) {
		throw httpError("Departure time must be in the future");
	}
	if (driver.driverEnabled === false) {
		throw httpError("Admin has not enabled your driver account", 403);
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
			await departureQueue.add(
				"activate-departure",
				{ departureId: departure.id },
				{
					attempts: 3,
					backoff: {
						type: "exponential",
						delay: 2000,
					},
				},
			);
			return departure;
		},
		{ isolationLevel: "ReadCommitted" },
	);
}

export async function getAllDepartures(driver) {
	const departures = await prisma.departure.findMany({
		where: { driverId: driver.id },
		orderBy: { createdAt: "desc" },
		include: { route: true, vehicle: true },
	});
	if (!departures.length) {
		throw httpError("No active departures found", 404);
	}
	return departures;
}

export async function getOneDeparture(driver, departureId) {
	const departure = await prisma.departure.findFirst({
		where: { id: departureId, driverId: driver.id },
		include: {
			route: true,
			vehicle: true,
			trip: true,
			rides: { where: { status: "CONFIRMED" }, include: { passenger: true } },
		},
	});
	if (!departure) {
		throw httpError("Departure not found", 404);
	}

	return departure;
}

export async function getAllRoutes() {
	const routes = await prisma.route.findMany({
		where: { isActive: true },
		orderBy: { createdAt: "desc" },
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

export async function getDriverDepartures(driverId) {
	return prisma.departure.findMany({
		where: { driverId },
		include: {
			route: { select: { origin: true, destination: true } },
			vehicle: {
				select: { make: true, model: true, registration: true, seats: true },
			},
			trip: true,
			rides: {
				where: { status: "CONFIRMED" },
				select: {
					id: true,
					passenger: {
						select: { id: true, firstName: true, lastName: true, phone: true },
					},
				},
			},
		},
		orderBy: { departureTime: "desc" },
	});
}

export async function cancelDeparture(driver, departureId) {
	return prisma.$transaction(
		async (tx) => {
			await tx.$queryRaw`SELECT id FROM "Departure" WHERE id = ${departureId} FOR UPDATE`;
			const departure = await tx.departure.findUnique({
				where: { id: departureId },
				include: {
					trip: true,
					rides: {
						where: { status: { in: activeRideStatuses } },
						include: { payment: true },
					},
				},
			});
			if (!departure || departure.driverId !== driver.id)
				throw httpError("Departure not found", 404);
			if (
				departure.status === "CANCELLED" ||
				["IN_PROGRESS", "COMPLETED"].includes(departure.trip?.status)
			) {
				throw httpError("This departure can no longer be cancelled", 409);
			}
			const now = new Date();
			for (const ride of departure.rides) {
				await tx.ride.update({
					where: { id: ride.id },
					data: { status: "CANCELLED" },
				});
				let refundIssued = false;
				if (ride.payment?.status === "SUCCESS") {
					await tx.payment.update({
						where: { id: ride.payment.id },
						data: { status: "REFUNDED" },
					});
					await audit(tx, driver.id, "Payment", ride.payment.id, "REFUNDED", {
						simulated: true,
					});
					refundIssued = true;
				} else if (ride.payment?.status === "PENDING") {
					await tx.payment.update({
						where: { id: ride.payment.id },
						data: { status: "EXPIRED" },
					});
					await audit(
						tx,
						driver.id,
						"Payment",
						ride.payment.id,
						"CANCELLED_WITH_DEPARTURE",
						{},
					);
				}
				await tx.notification.create({
					data: {
						userId: ride.passengerId,
						type: "Departure Cancelled",
						message: "Your departure was cancelled by the driver.",
					},
				});
				await audit(tx, driver.id, "Ride", ride.id, "CANCELLED_BY_DRIVER", {
					refundIssued,
				});
				emitToUsers(ride.passengerId, "notification", {
					type: "Departure Cancelled",
					message: "Your departure was cancelled by the driver.",
				});
			}
			await tx.departure.update({
				where: { id: departureId },
				data: { status: "CANCELLED" },
			});
			if (departure.trip)
				await tx.trip.update({
					where: { id: departure.trip.id },
					data: { status: "CANCELLED" },
				});
			await audit(
				tx,
				driver.id,
				"Departure",
				departureId,
				"CANCELLED_BY_DRIVER",
				{},
			);
			return { cancelled: true, affectedPassengers: departure.rides.length };
		},
		{ isolationLevel: "ReadCommitted" },
	);
}

export async function updateTrip(driver, departureId, nextStatus) {
	let passengerIds = [];
	const trip = await prisma.$transaction(
		async (tx) => {
			await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${driver.id} FOR UPDATE`;
			const departure = await tx.departure.findUnique({
				where: { id: departureId },
				include: { trip: true, rides: { where: { status: "CONFIRMED" } } },
			});
			if (!departure || departure.driverId !== driver.id || !departure.trip)
				throw httpError("Trip not found", 404);
			const transitions = {
				ARRIVED: "NOT_STARTED",
				IN_PROGRESS: "ARRIVED",
				COMPLETED: "IN_PROGRESS",
			};
			if (departure.trip.status !== transitions[nextStatus])
				throw httpError(
					`Cannot change trip from ${departure.trip.status} to ${nextStatus}`,
					409,
				);
			if (nextStatus === "IN_PROGRESS") {
				const inProgress = await tx.trip.findFirst({
					where: {
						status: "IN_PROGRESS",
						departure: { is: { driverId: driver.id } },
					},
				});
				if (inProgress)
					throw httpError(
						"Complete the active trip before starting another",
						409,
					);
			}
			const now = new Date();
			const data =
				nextStatus === "ARRIVED"
					? { status: nextStatus, arrivedAt: now }
					: nextStatus === "IN_PROGRESS"
						? { status: nextStatus, startedAt: now }
						: { status: nextStatus, completedAt: now };
			const trip = await tx.trip.update({
				where: { id: departure.trip.id },
				data,
			});
			if (nextStatus === "IN_PROGRESS") {
				await tx.departure.update({
					where: { id: departureId },
					data: { status: "CLOSED" },
				});
			}
			if (nextStatus === "COMPLETED") {
				await tx.ride.updateMany({
					where: { departureId, status: "CONFIRMED" },
					data: { status: "COMPLETED" },
				});
			}

			const notificationType =
				nextStatus === "ARRIVED"
					? "Driver Arrived"
					: nextStatus === "IN_PROGRESS"
						? "Trip In Progress"
						: "Trip Completed";
			const notificationMessage =
				nextStatus === "ARRIVED"
					? "Driver has arrived."
					: nextStatus === "IN_PROGRESS"
						? "Your trip is now in progress."
						: "Your trip has been completed successfully.";
			await Promise.all(
				departure.rides.map(async (ride) => {
					await tx.notification.create({
						data: {
							userId: ride.passengerId,
							type: notificationType,
							message: notificationMessage,
						},
					});
					emitToUsers([ride.passengerId], "notification", {
						type: nextStatus,
						message: notificationMessage,
					});
					emitToUsers([ride.passengerId], "departure_updated", {
						type: nextStatus,
						message: notificationMessage,
					});
				}),
			);

			await audit(tx, driver.id, "Trip", trip.id, nextStatus, {});
			passengerIds = departure.rides.map((ride) => ride.passengerId);
			return trip;
		},
		{ isolationLevel: "ReadCommitted" },
	);
	return trip;
}

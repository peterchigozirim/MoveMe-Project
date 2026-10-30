import prisma from "../config/database.js";
import { emitToGeneral, emitToUsers } from "../websocket/realtime.js";

export const updateDepartureStatus = async () => {
	const now = new Date();
	const result = await prisma.departure.updateMany({
		where: {
			status: "OPEN",
			departureTime: { lt: now },
		},
		data: { status: "CLOSED" },
	});
	emitToGeneral("departure_updated", {
		type: "Departure Status Updated",
		message: `departures have been closed.`,
	});

	return { closedDepartures: result.count, processedAt: now };
};

export const updateFailedPaymentsStatus = async () => {
	const now = new Date();
	try {
		return await prisma.$transaction(async (tx) => {
			const expiredPayments = await tx.payment.findMany({
				where: {
					status: "PENDING",
					expiresAt: { lt: now },
				},
				select: { rideId: true },
			});
			const rideIds = [
				...new Set(expiredPayments.map(({ rideId }) => rideId).filter(Boolean)),
			];

			const result = await tx.payment.updateMany({
				where: {
					status: "PENDING",
					expiresAt: { lt: now },
				},
				data: { status: "FAILED" },
			});

			const failedRides = rideIds.length
				? await tx.ride.updateMany({
						where: { id: { in: rideIds } },
						data: { status: "CANCELLED" },
					})
				: { count: 0 };
			emitToUsers(
				expiredPayments.map(({ passengerId }) => passengerId),
				"failed_payments_updated",
				{
					type: "Failed Payments Status Updated",
					message: `Failed payments have been updated.`,
				},
			);
			return {
				failedPayments: result.count,
				cancelledRides: failedRides.count,
				processedAt: now,
			};
		});
	} catch (error) {
		console.error("Failed to update failed payments status:", error);
		throw error;
	}
};

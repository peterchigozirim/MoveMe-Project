import prisma from "../config/database.js";

export const updateDepartureStatus = async () => {
	const now = new Date();
	const result = await prisma.departure.updateMany({
		where: {
			status: "OPEN",
			departureTime: { lt: now },
		},
		data: { status: "CLOSED" },
	});
	return { closedDepartures: result.count, processedAt: now };
};

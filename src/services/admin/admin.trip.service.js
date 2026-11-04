import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";

class AdminTripService {
	constructor() {}

	async getAllTrips() {
		const trips = await prisma.trip.findMany({
			orderBy: { createdAt: "desc" },
			include: {
				departure: {
					include: {
						driver: true,
						vehicle: true,
						route: true,
						rides: {
							where: { status: "COMPLETED" },
							select: { passenger: true, payment: true },
						},
					},
				},
			},
		});
		if (trips.length === 0) {
			throw httpError("No trips found", 404);
		}
		return trips.map(({ departure: { rides, ...departure }, ...trip }) => ({
			...trip,
			departure,
			passengers: rides.map((ride) => ride.passenger),
			payments: rides.map((ride) => ride.payment),
			refunds: rides
				.map((ride) => ride.payment)
				.filter((payment) => payment?.status === "REFUNDED"),
		}));
	}

	async getTripById(id) {
		const trip = await prisma.trip.findUnique({
			where: { id },
			include: {
				departure: {
					include: {
						driver: true,
						vehicle: true,
						route: true,
						rides: {
							include: {
								payment: {
									include: {
										passenger: true,
									},
								},
							},
						},
					},
				},
			},
		});
		if (!trip) {
			throw httpError("Trip not found", 404);
		}
		const {
			departure: { rides, ...departure },
		} = trip;
		const payments = rides.map((ride) =>
			["SUCCESS", "REFUNDED"].includes(ride.payment?.status)
				? ride.payment
				: null,
		);
		return {
			...trip,
			departure,
			rides,
			passengers: rides.map((ride) => ride.payment?.passenger),
			payments,
			refunds: payments.filter((payment) => payment?.status === "REFUNDED"),
		};
	}
}

export default new AdminTripService();

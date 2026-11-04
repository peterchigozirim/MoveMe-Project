import {
	searchRoutes,
	createReservation,
	cancelReservation,
	getAllReservations,
	getReservation,
	getRoute,
} from "../../services/passenger/rides.service.js";

// Corrected the class name from BoolRideController to BookRideController
class BookRideController {
	searchRide = async (req, res, next) => {
		const { destination, origin } = req.body;
		console.log({ destination, origin });
		try {
			const departures = await searchRoutes({
				destination,
				origin,
			});
			res.json({
				data: departures,
				status: true,
			});
		} catch (error) {
			next(error);
		}
	};

	getAllRoute = async (req, res, next) => {
		try {
			const route = await getRoute();
			res.json({
				data: route,
				status: true,
			});
		} catch (error) {
			next(error);
		}
	};

	async handleGetAllReservations(req, res, next) {
		const passenger = req.user; // Assuming the authenticated passenger is available on req.user
		try {
			const reservations = await getAllReservations(passenger);
			res.status(200).json({
				data: reservations,
				status: true,
			});
		} catch (error) {
			next(error);
		}
	}

	async handleGetReservation(req, res, next) {
		const { rideId } = req.params;
		const passenger = req.user; // Assuming the authenticated passenger is available on req.user
		try {
			const reservation = await getReservation(passenger, rideId);
			res.status(200).json({
				data: reservation,
				status: true,
			});
		} catch (error) {
			next(error);
		}
	}

	async handleCreateReservation(req, res, next) {
		const { departureId } = req.body;
		if (!departureId) {
			return res.status(400).json({
				message: "Route departure is required",
				status: false,
			});
		}
		const passenger = req.user; // Assuming the authenticated passenger is available on req.user
		try {
			const reservation = await createReservation(
				passenger,
				departureId,
				req.get("Idempotency-Key"),
			);
			res.status(201).json({
				data: reservation,
				status: true,
			});
		} catch (error) {
			next(error);
		}
	}

	async handleCancelReservation(req, res, next) {
		const { reservationId } = req.params;
		if (!reservationId) {
			return res.status(422).json({
				message: "Reservation ID is required",
				status: false,
			});
		}
		const passenger = req.user; // Assuming the authenticated passenger is available on req.user
		try {
			// Assuming there is a cancelReservation service function
			const result = await cancelReservation(passenger, reservationId);
			res.status(200).json({
				data: result,
				status: true,
			});
		} catch (error) {
			next(error);
		}
	}
}

export default BookRideController;

import { searchRoutes } from "../../services/passenger/rides.service.js";

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
}

export default BookRideController;

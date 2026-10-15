import {
	getAllRoutes,
	publishDeparture,
	getAllDepartures,
	getDriverDepartures,
	cancelDeparture,
	updateTrip,
} from "../../services/driver/departure.service.js";

class DepartureController {
	async handleGetAllRoutes(req, res, next) {
		try {
			const routes = await getAllRoutes();
			res.json({ success: true, data: routes });
		} catch (error) {
			next(error);
		}
	}

	async handlePublishDeparture(req, res, next) {
		try {
			const { routeId, departureTime, mode } = req.body;
			const input = { routeId, departureTime, mode };
			const departure = await publishDeparture(req.user, input);
			res.json({
				success: true,
				message: "Departure published successfully",
				data: departure,
			});
		} catch (error) {
			next(error);
		}
	}

	async handleGetAllDepartures(req, res, next) {
		try {
			const departures = await getAllDepartures(req.user);
			res.json({ success: true, data: departures });
		} catch (error) {
			next(error);
		}
	}

	async handleDriverDeparture(req, res, next) {
		try {
			const driverId = req.user.id;
			const departure = await getDriverDepartures(driverId);
			res.json({ success: true, data: departure });
		} catch (error) {
			next(error);
		}
	}

	async handleCancelDeparture(req, res, next) {
		try {
			const { departureId } = req.body;
			if (!departureId)
				return res
					.status(422)
					.json({ success: false, message: "Departure ID is required" });
			const result = await cancelDeparture(req.user, departureId);
			res.json({ success: true, data: result });
		} catch (error) {
			next(error);
		}
	}

	async handleUpdateTrip(req, res, next) {
		try {
			const { departureId, status } = req.body;
			const updatedDeparture = await updateTrip(req.user, departureId, status);
			res.json({
				success: true,
				message: "Trip updated successfully",
				data: updatedDeparture,
			});
		} catch (error) {
			next(error);
		}
	}
}

export default DepartureController;

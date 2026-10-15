import {
	getAllRoutes,
	publishDeparture,
	getAllDepartures,
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
}

export default DepartureController;

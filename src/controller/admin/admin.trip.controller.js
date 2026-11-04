import adminTripService from "../../services/admin/admin.trip.service.js";

class AdminTripController {
	async getAllTrips(req, res) {
		try {
			const trips = await adminTripService.getAllTrips();
			res.status(200).json(trips);
		} catch (error) {
			res.status(500).json({ message: error.message });
		}
	}

	async getTripById(req, res) {
		const { tripId } = req.params;
		try {
			const trip = await adminTripService.getTripById(tripId);
			res.status(200).json(trip);
		} catch (error) {
			res.status(500).json({ message: error.message });
		}
	}
}

export default new AdminTripController();

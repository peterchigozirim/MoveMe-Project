import VehicleService from "../../services/vehicle.service.js";

const vehicleService = new VehicleService();

const VehicleController = {
	addVehicle: async (req, res, next) => {
		try {
			const vehicle = await vehicleService.addVehicle(req.body, req.user.id);
			res.status(201).json({
				message: "Vehicle added successfully",
				data: vehicle,
			});
		} catch (error) {
			next(error);
		}
	},
	getVehicle: async (req, res, next) => {
		try {
			const vehicle = await vehicleService.getVehicle(req.user.id);
			res.status(200).json({
				message: "Vehicle retrieved successfully",
				data: vehicle,
			});
		} catch (error) {
			next(error);
		}
	},
};

export default VehicleController;

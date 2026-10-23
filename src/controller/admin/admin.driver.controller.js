import AdminDriversService from "../../services/admin/admin.drivers.service.js";

const adminDriversService = new AdminDriversService();

class AdminDriverController {
	async listDrivers(req, res, next) {
		try {
			const drivers = await adminDriversService.listDrivers();
			res.json({
				status: "success",
				message: "Drivers retrieved successfully",
				data: drivers,
			});
		} catch (error) {
			next(error);
		}
	}

	async getDriverById(req, res, next) {
		try {
			const driver = await adminDriversService.getDriverById(req.params.id);
			res.json({
				status: "success",
				message: "Driver retrieved successfully",
				data: driver,
			});
		} catch (error) {
			next(error);
		}
	}

	async enableDriver(req, res, next) {
		try {
			const driver = await adminDriversService.enableDriver(req.params.id);
			res.json({
				status: "success",
				message: "Driver enabled successfully",
				data: driver,
			});
		} catch (error) {
			next(error);
		}
	}

	async disableDriver(req, res, next) {
		try {
			const driver = await adminDriversService.disableDriver(req.params.id);
			res.json({
				status: "success",
				message: "Driver disabled successfully",
				data: driver,
			});
		} catch (error) {
			next(error);
		}
	}
}

export default AdminDriverController;

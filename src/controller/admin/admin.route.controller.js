import AdminRoutesService from "../../services/admin/admin.route.service.js";
import { stat } from "fs";

const adminRoutesService = new AdminRoutesService();

class AdminRoutesController {
	async listRoutes(req, res, next) {
		try {
			const routes = await adminRoutesService.listRoutes();
			res.json({
				status: "success",
				message: "Routes retrieved successfully",
				data: routes,
			});
		} catch (error) {
			next(error);
		}
	}

	async getRouteById(req, res, next) {
		try {
			const route = await adminRoutesService.getRouteById(req.params.id);
			res.json({
				status: "success",
				message: "Route retrieved successfully",
				data: route,
			});
		} catch (error) {
			next(error);
		}
	}

	async createRoute(req, res, next) {
		try {
			const route = await adminRoutesService.createRoute(req.user.id, req.body);
			res.status(201).json({
				status: "success",
				message: "Route created successfully",
				data: route,
			});
		} catch (error) {
			next(error);
		}
	}

	async updateRoute(req, res, next) {
		try {
			const route = await adminRoutesService.updateRoute(
				req.user.id,
				req.params.id,
				req.body,
			);
			res.json({
				status: "success",
				message: "Route updated successfully",
				data: route,
			});
		} catch (error) {
			next(error);
		}
	}

	async deleteRoute(req, res, next) {
		try {
			await adminRoutesService.deleteRoute(req.user.id, req.params.id);
			res.status(200).json({
				status: "success",
				message: "Route deleted successfully",
			});
		} catch (error) {
			next(error);
		}
	}
}
export default AdminRoutesController;

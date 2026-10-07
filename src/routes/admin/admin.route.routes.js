import express from "express";
import AdminRoutesController from "../../controller/admin/admin.route.controller.js";
import { authenticate } from "../../middlewares/session.middleware.js";
import { checkAdmin } from "../../middlewares/role.middleware.js";
import { validateRouteInput } from "../../middlewares/admin/admin.route.middleware.js";

const router = express.Router();
const adminRoutesController = new AdminRoutesController();

router.get("/", authenticate, checkAdmin, adminRoutesController.listRoutes);
router.get(
	"/:id",
	authenticate,
	checkAdmin,
	adminRoutesController.getRouteById,
);
router.post(
	"/",
	authenticate,
	checkAdmin,
	validateRouteInput,
	adminRoutesController.createRoute,
);
router.put(
	"/:id",
	authenticate,
	checkAdmin,
	validateRouteInput,
	adminRoutesController.updateRoute,
);
router.delete(
	"/:id",
	authenticate,
	checkAdmin,
	adminRoutesController.deleteRoute,
);

export default router;

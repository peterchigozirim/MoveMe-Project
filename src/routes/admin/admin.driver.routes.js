import { Router } from "express";
import AdminDriverController from "../../controller/admin/admin.driver.controller.js";
import { authenticate } from "../../middlewares/session.middleware.js";
import { checkAdmin } from "../../middlewares/role.middleware.js";

const router = Router();
const adminDriverController = new AdminDriverController();

router.get("/", authenticate, checkAdmin, adminDriverController.listDrivers);
router.get(
	"/:id",
	authenticate,
	checkAdmin,
	adminDriverController.getDriverById,
);
router.post(
	"/:id/enable",
	authenticate,
	checkAdmin,
	adminDriverController.enableDriver,
);
router.post(
	"/:id/disable",
	authenticate,
	checkAdmin,
	adminDriverController.disableDriver,
);

export default router;

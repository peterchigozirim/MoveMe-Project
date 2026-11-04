import { Router } from "express";
import adminTripController from "../../controller/admin/admin.trip.controller.js";
import { authenticate } from "../../middlewares/session.middleware.js";
import { checkAdmin } from "../../middlewares/role.middleware.js";

const router = Router();

router.get("/", authenticate, checkAdmin, adminTripController.getAllTrips);
router.get(
	"/:tripId",
	authenticate,
	checkAdmin,
	adminTripController.getTripById,
);

export default router;

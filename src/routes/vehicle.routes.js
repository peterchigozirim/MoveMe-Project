import { Router } from "express";
import VehicleController from "../controller/driver/vehicle.controller.js";
import { validateVehicle } from "../middlewares/vehicle.middleware.js";
import { authenticate } from "../middlewares/session.middleware.js";
import { checkDriver } from "../middlewares/role.middleware.js";

const router = Router();

router.post(
	"/vehicle",
	authenticate,
	validateVehicle,
	VehicleController.addVehicle,
);
router.get("/vehicle", authenticate, checkDriver, VehicleController.getVehicle);

export default router;

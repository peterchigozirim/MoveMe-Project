import { Router } from "express";
import { authenticate } from "../middlewares/session.middleware.js";
import { checkDriver } from "../middlewares/role.middleware.js";
import DepartureController from "../controller/driver/departure.controller.js";
import DepartureMiddleware from "../middlewares/driver/departure.middleware.js";

const router = Router();
const departureController = new DepartureController();
const departureMiddleware = new DepartureMiddleware();

router.get(
	"/get-all-routes",
	authenticate,
	checkDriver,
	departureController.handleGetAllRoutes,
);

router.get(
	"/get-all-departures",
	authenticate,
	checkDriver,
	departureController.handleGetAllDepartures,
);

router.post(
	"/publish-departure",
	authenticate,
	checkDriver,
	departureMiddleware.validatePublishDeparture,
	departureController.handlePublishDeparture,
);
export default router;

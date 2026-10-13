import { Router } from "express";
import { authenticate } from "../../middlewares/session.middleware.js";
import { checkPassenger } from "../../middlewares/role.middleware.js";
import BookRideController from "../../controller/passenger/bookRide.controller.js";
import SearchRideMiddleware from "../../middlewares/passenger/passenger.ride.middleware.js";

const router = Router();
const bookRideController = new BookRideController();
const searchRideMiddleware = new SearchRideMiddleware();

router.post(
	"/search",
	authenticate,
	checkPassenger,
	searchRideMiddleware.searchRideInput,
	bookRideController.searchRide,
);

export default router;

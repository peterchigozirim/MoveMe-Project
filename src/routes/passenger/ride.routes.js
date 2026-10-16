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

router.get(
	"/all-routes",
	authenticate,
	checkPassenger,
	bookRideController.getAllRoute,
);

router.get(
	"/",
	authenticate,
	checkPassenger,
	bookRideController.handleGetAllReservations,
);

router.get(
	"/:rideId",
	authenticate,
	checkPassenger,
	bookRideController.handleGetReservation,
);

router.post(
	"/create-reservation",
	authenticate,
	checkPassenger,
	bookRideController.handleCreateReservation,
);

router.post(
	"/cancel-reservation",
	authenticate,
	checkPassenger,
	bookRideController.handleCancelReservation,
);

export default router;

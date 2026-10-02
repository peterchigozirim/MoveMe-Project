import { Router } from "express";
import { z } from "zod";
import {
	authenticate,
	authorize,
	requireEnabledDriver,
} from "../middlewares/session.middleware.js";
import {
	asyncHandler,
	validateRequest,
} from "../middlewares/request.middleware.js";
import {
	createIssue,
	createRoute,
	createVehicle,
	listAllRoutes,
	listDrivers,
	listIssues,
	listNotifications,
	listRoutes,
	listVehicles,
	markNotificationRead,
	setDriverAccess,
	updateIssue,
	updateRoute,
	updateVehicle,
} from "../services/admin.service.js";
import {
	cancelDeparture,
	cancelReservation,
	createReservation,
	getDriverDepartures,
	getPassengerRides,
	publishDeparture,
	searchDepartures,
	simulatePayment,
	updateTrip,
} from "../services/ride.service.js";

const router = Router();
const routeSchema = z.object({
	origin: z.string().trim().min(1).max(120),
	destination: z.string().trim().min(1).max(120),
	durationMinutes: z.coerce.number().int().positive().max(1440),
	soloFare: z.coerce.number().positive(),
	pooledFare: z.coerce.number().positive(),
	isActive: z.boolean().optional(),
});
const vehicleSchema = z.object({
	registration: z.string().trim().min(2).max(24),
	make: z.string().trim().min(1).max(60),
	model: z.string().trim().min(1).max(60),
	color: z.string().trim().max(40).optional(),
	seats: z.coerce.number().int().positive().max(80),
	isActive: z.boolean().optional(),
});
const departureSchema = z.object({
	routeId: z.string().uuid(),
	vehicleId: z.string().uuid(),
	departureTime: z.string().datetime(),
	mode: z.enum(["SOLO", "POOL"]),
});
const issueSchema = z.object({
	title: z.string().trim().min(3).max(160),
	description: z.string().trim().min(3).max(4000),
});
const routeUpdateSchema = routeSchema
	.partial()
	.refine((value) => Object.keys(value).length > 0);
const vehicleUpdateSchema = vehicleSchema
	.partial()
	.refine((value) => Object.keys(value).length > 0);
const searchSchema = z.object({
	routeId: z.string().uuid(),
	mode: z.enum(["SOLO", "POOL"]),
	timing: z.enum(["immediate", "scheduled"]).default("scheduled"),
});
const tripSchema = z.object({
	status: z.enum(["ARRIVED", "IN_PROGRESS", "COMPLETED"]),
});
const paymentSchema = z.object({ outcome: z.enum(["success", "failure"]) });
const issueStatusSchema = z.object({
	status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]),
});
const accessSchema = z.object({ enabled: z.boolean() });
const idParam = (key) =>
	validateRequest(z.object({ [key]: z.string().uuid() }), "params");

router.get(
	"/routes",
	asyncHandler(async (req, res) => res.json({ data: await listRoutes() })),
);
router.post(
	"/admin/routes",
	authenticate,
	authorize("ADMIN"),
	validateRequest(routeSchema),
	asyncHandler(async (req, res) => {
		res
			.status(201)
			.json({ data: await createRoute(req.user.id, req.validated) });
	}),
);
router.get(
	"/admin/routes",
	authenticate,
	authorize("ADMIN"),
	asyncHandler(async (req, res) => res.json({ data: await listAllRoutes() })),
);
router.patch(
	"/admin/routes/:routeId",
	authenticate,
	authorize("ADMIN"),
	idParam("routeId"),
	validateRequest(routeUpdateSchema),
	asyncHandler(async (req, res) => {
		res.json({
			data: await updateRoute(
				req.user.id,
				req.validated.routeId,
				req.validated,
			),
		});
	}),
);

router.post(
	"/vehicles",
	authenticate,
	authorize("DRIVER"),
	validateRequest(vehicleSchema),
	asyncHandler(async (req, res) => {
		res
			.status(201)
			.json({ data: await createVehicle(req.user.id, req.validated) });
	}),
);
router.get(
	"/vehicles/me",
	authenticate,
	authorize("DRIVER"),
	asyncHandler(async (req, res) =>
		res.json({ data: await listVehicles(req.user.id) }),
	),
);
router.patch(
	"/vehicles/:vehicleId",
	authenticate,
	authorize("DRIVER"),
	idParam("vehicleId"),
	validateRequest(vehicleUpdateSchema),
	asyncHandler(async (req, res) => {
		res.json({
			data: await updateVehicle(
				req.user.id,
				req.validated.vehicleId,
				req.validated,
			),
		});
	}),
);

router.post(
	"/departures",
	authenticate,
	requireEnabledDriver,
	validateRequest(departureSchema),
	asyncHandler(async (req, res) => {
		res
			.status(201)
			.json({ data: await publishDeparture(req.user, req.validated) });
	}),
);
router.get(
	"/departures/search",
	authenticate,
	authorize("PASSENGER"),
	validateRequest(searchSchema, "query"),
	asyncHandler(async (req, res) => {
		res.json({ data: await searchDepartures(req.validated) });
	}),
);
router.get(
	"/departures/mine",
	authenticate,
	authorize("DRIVER"),
	asyncHandler(async (req, res) =>
		res.json({ data: await getDriverDepartures(req.user.id) }),
	),
);
router.delete(
	"/departures/:departureId",
	authenticate,
	requireEnabledDriver,
	idParam("departureId"),
	asyncHandler(async (req, res) => {
		res.json({
			data: await cancelDeparture(req.user, req.validated.departureId),
		});
	}),
);
router.patch(
	"/departures/:departureId/trip",
	authenticate,
	requireEnabledDriver,
	idParam("departureId"),
	validateRequest(tripSchema),
	asyncHandler(async (req, res) => {
		res.json({
			data: await updateTrip(
				req.user,
				req.validated.departureId,
				req.validated.status,
			),
		});
	}),
);

router.post(
	"/rides",
	authenticate,
	authorize("PASSENGER"),
	validateRequest(z.object({ departureId: z.string().uuid() })),
	asyncHandler(async (req, res) => {
		const ride = await createReservation(
			req.user,
			req.validated.departureId,
			req.get("Idempotency-Key"),
		);
		res.status(201).json({ data: ride });
	}),
);
router.get(
	"/rides/me",
	authenticate,
	authorize("PASSENGER"),
	asyncHandler(async (req, res) =>
		res.json({ data: await getPassengerRides(req.user.id) }),
	),
);
router.delete(
	"/rides/:rideId",
	authenticate,
	authorize("PASSENGER"),
	idParam("rideId"),
	asyncHandler(async (req, res) => {
		res.json({ data: await cancelReservation(req.user, req.validated.rideId) });
	}),
);
router.post(
	"/payments/:paymentId/simulate",
	authenticate,
	authorize("PASSENGER"),
	idParam("paymentId"),
	validateRequest(paymentSchema),
	asyncHandler(async (req, res) => {
		res.json({
			data: await simulatePayment(
				req.user,
				req.validated.paymentId,
				req.validated.outcome,
			),
		});
	}),
);

router.get(
	"/notifications",
	authenticate,
	asyncHandler(async (req, res) =>
		res.json({ data: await listNotifications(req.user.id) }),
	),
);
router.patch(
	"/notifications/:notificationId/read",
	authenticate,
	idParam("notificationId"),
	asyncHandler(async (req, res) => {
		res.json({
			data: await markNotificationRead(
				req.user.id,
				req.validated.notificationId,
			),
		});
	}),
);
router.post(
	"/issues",
	authenticate,
	validateRequest(issueSchema),
	asyncHandler(async (req, res) => {
		res
			.status(201)
			.json({ data: await createIssue(req.user.id, req.validated) });
	}),
);
router.get(
	"/admin/issues",
	authenticate,
	authorize("ADMIN"),
	asyncHandler(async (req, res) => res.json({ data: await listIssues() })),
);
router.get(
	"/admin/drivers",
	authenticate,
	authorize("ADMIN"),
	asyncHandler(async (req, res) => res.json({ data: await listDrivers() })),
);
router.patch(
	"/admin/issues/:issueId",
	authenticate,
	authorize("ADMIN"),
	idParam("issueId"),
	validateRequest(issueStatusSchema),
	asyncHandler(async (req, res) => {
		res.json({
			data: await updateIssue(
				req.user.id,
				req.validated.issueId,
				req.validated.status,
			),
		});
	}),
);
router.patch(
	"/admin/drivers/:userId/access",
	authenticate,
	authorize("ADMIN"),
	idParam("userId"),
	validateRequest(accessSchema),
	asyncHandler(async (req, res) => {
		res.json({
			data: await setDriverAccess(
				req.user.id,
				req.validated.userId,
				req.validated.enabled,
			),
		});
	}),
);

export default router;

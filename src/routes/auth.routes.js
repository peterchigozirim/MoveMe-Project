import { Router } from "express";
import { z } from "zod";
import prisma from "../config/database.js";
import { loginUser, registerUser } from "../services/authentication.service.js";
import { authenticate } from "../middlewares/session.middleware.js";
import {
	asyncHandler,
	validateRequest,
} from "../middlewares/request.middleware.js";

const router = Router();
const registerSchema = z.object({
	firstName: z.string().trim().min(1).max(80),
	lastName: z.string().trim().min(1).max(80),
	email: z.string().email().max(254),
	password: z.string().min(10).max(128),
	phone: z.string().trim().min(7).max(24).optional(),
	role: z.enum(["PASSENGER", "DRIVER"]).default("PASSENGER"),
});

router.post(
	"/register",
	validateRequest(registerSchema),
	asyncHandler(async (req, res) => {
		const result = await registerUser(req.validated);
		res.status(201).json({ data: result });
	}),
);

router.post(
	"/login",
	validateRequest(
		z.object({ email: z.string().email(), password: z.string().min(1) }),
	),
	asyncHandler(async (req, res) => {
		res.json({
			data: await loginUser(req.validated.email, req.validated.password),
		});
	}),
);

router.get(
	"/me",
	authenticate,
	asyncHandler(async (req, res) => {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				phone: true,
				role: true,
				driverEnabled: true,
				createdAt: true,
			},
		});
		res.json({ data: user });
	}),
);

export default router;

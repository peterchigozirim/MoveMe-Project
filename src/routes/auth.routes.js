import { Router } from "express";
import {
	registerInput,
	loginInput,
	changePasswordInput,
} from "../middlewares/auth.middleware.js";
import AuthController from "../controller/auth/auth.controller.js";
import { authenticate } from "../middlewares/session.middleware.js";

const router = Router();
const { registerUser, loginUser, getProfile, changePassword } = AuthController;

router.post("/register", registerInput, registerUser);

router.post("/login", loginInput, loginUser);

router.get("/me", authenticate, getProfile);

router.put(
	"/change-password",
	authenticate,
	changePasswordInput,
	changePassword,
);

export default router;

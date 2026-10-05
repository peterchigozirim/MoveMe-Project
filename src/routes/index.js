import { Router } from "express";
import authRoutes from "./auth.routes.js";
import moveMeRoutes from "./moveme.routes.js";
import vehicleRoutes from "./vehicle.routes.js";

const router = Router();

router.get("/", (req, res) => {
	res.json({
		success: true,
		message: "Ride Booking API v1",
	});
});

router.use("/auth", authRoutes);
router.use("/", moveMeRoutes);
router.use("/", vehicleRoutes);

export default router;

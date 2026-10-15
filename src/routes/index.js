import { Router } from "express";
import authRoutes from "./auth.routes.js";
import moveMeRoutes from "./moveme.routes.js";
import vehicleRoutes from "./vehicle.routes.js";
import adminUserRoutes from "./admin/admin.user.routes.js";
import adminRouteRoutes from "./admin/admin.route.routes.js";
import adminDriverRoutes from "./admin/admin.driver.routes.js";
import rideRoutes from "./passenger/ride.routes.js";
import paymentRoutes from "./payment/payment.routes.js";
import driverRoutes from "./driver.routes.js";

const router = Router();

router.get("/", (req, res) => {
	res.json({
		success: true,
		message: "Ride Booking API v1",
	});
});

router.use("/auth", authRoutes);
// router.use("/", moveMeRoutes);
router.use("/", vehicleRoutes);

// Admin routes
router.use("/admin/users", adminUserRoutes);
router.use("/admin/routes", adminRouteRoutes);
router.use("/admin/drivers", adminDriverRoutes);
router.use("/passenger/rides", rideRoutes);
router.use("/driver", driverRoutes);
router.use("/payments", paymentRoutes);

export default router;

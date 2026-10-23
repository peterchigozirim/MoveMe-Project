import { Router } from "express";
import authRoutes from "./auth.routes.js";
import moveMeRoutes from "./moveme.routes.js";
import vehicleRoutes from "./vehicle.routes.js";
import adminUserRoutes from "./admin/admin.user.routes.js";
import adminRouteRoutes from "./admin/admin.route.routes.js";
import adminDriverRoutes from "./admin/admin.driver.routes.js";
import adminAuditRoutes from "./admin/admin.audit.routes.js";
import adminIssueRoutes from "./admin/admin.issue.routes.js";
import rideRoutes from "./passenger/ride.routes.js";
import paymentRoutes from "./payment/payment.routes.js";
import driverRoutes from "./driver.routes.js";
import notificationRoutes from "./notification.routes.js";

const router = Router();

router.get("/", (req, res) => {
	res.json({
		success: true,
		message: "Ride Booking API v1",
	});
});

router.use("/auth", authRoutes);
// router.use("/", moveMeRoutes);
router.use("/vehicle", vehicleRoutes);

// Admin routes
router.use("/admin/users", adminUserRoutes);
router.use("/admin/routes", adminRouteRoutes);
router.use("/admin/drivers", adminDriverRoutes);
router.use("/admin/audits", adminAuditRoutes);
router.use("/admin/issues", adminIssueRoutes);

// driver routes
router.use("/driver", driverRoutes);
// passenger routes
router.use("/passenger/rides", rideRoutes);
// Payment routes
router.use("/payments", paymentRoutes);
// Notification routes
router.use("/notifications", notificationRoutes);

export default router;

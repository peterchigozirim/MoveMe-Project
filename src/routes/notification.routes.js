import { Router } from "express";
import NotificationController from "../controller/notification/notification.controller.js";
import { authenticate } from "../middlewares/session.middleware.js";

const router = Router();
const notificationController = new NotificationController();

router.get("/", authenticate, notificationController.getNotifications);
router.patch("/:id/read", authenticate, notificationController.markAsRead);

export default router;

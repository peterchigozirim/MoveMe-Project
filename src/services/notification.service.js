import prisma from "../config/database.js";
import { httpError } from "../utils/http-error.js";

class NotificationService {
	async getNotifications(userId) {
		const notifications = await prisma.notification.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
		});
		if (!notifications.length) {
			throw new httpError("No notifications found", 404);
		}
		return notifications;
	}

	async markAsRead(notificationId) {
		const notification = await prisma.notification.update({
			where: { id: notificationId },
			data: { readAt: new Date() },
		});
		if (!notification) {
			throw new httpError("Notification not found", 404);
		}
		return notification;
	}
}

export default NotificationService;

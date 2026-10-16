import NotificationService from "../../services/notification.service.js";

const notificationService = new NotificationService();

class NotificationController {
	async getNotifications(req, res, next) {
		try {
			const userId = req.user.id;
			const notifications = await notificationService.getNotifications(userId);
			res.json(notifications);
		} catch (error) {
			next(error);
		}
	}

	async markAsRead(req, res, next) {
		try {
			const notificationId = req.params.id;
			const notification = await notificationService.markAsRead(notificationId);
			res.json(notification);
		} catch (error) {
			next(error);
		}
	}
}

export default NotificationController;

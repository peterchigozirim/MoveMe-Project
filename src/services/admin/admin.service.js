import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";

export function listRoutes() {
	return prisma.route.findMany({
		where: { isActive: true },
		orderBy: { origin: "asc" },
	});
}

export function listAllRoutes() {
	return prisma.route.findMany({ orderBy: { origin: "asc" } });
}

export async function createRoute(actorId, input) {
	return prisma.$transaction(async (tx) => {
		const route = await tx.route.create({ data: input });
		await tx.auditLog.create({
			data: {
				actorId,
				entityType: "Route",
				entityId: route.id,
				action: "CREATED",
				details: input,
			},
		});
		return route;
	});
}

export async function updateRoute(actorId, routeId, input) {
	const route = await prisma.route.findUnique({ where: { id: routeId } });
	if (!route) throw httpError("Route not found", 404);
	return prisma.$transaction(async (tx) => {
		const updated = await tx.route.update({
			where: { id: routeId },
			data: input,
		});
		await tx.auditLog.create({
			data: {
				actorId,
				entityType: "Route",
				entityId: routeId,
				action: "UPDATED",
				details: input,
			},
		});
		return updated;
	});
}

export function createVehicle(driverId, input) {
	return prisma.vehicle.create({ data: { ...input, driverId } });
}

export function listVehicles(driverId) {
	return prisma.vehicle.findMany({
		where: { driverId },
		orderBy: { createdAt: "desc" },
	});
}

export async function updateVehicle(driverId, vehicleId, input) {
	const vehicle = await prisma.vehicle.findFirst({
		where: { id: vehicleId, driverId },
	});
	if (!vehicle) throw httpError("Vehicle not found", 404);
	return prisma.vehicle.update({ where: { id: vehicleId }, data: input });
}

export function listDrivers() {
	return prisma.user.findMany({
		where: { role: "DRIVER" },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			email: true,
			driverEnabled: true,
			_count: { select: { vehicles: true } },
		},
		orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
	});
}

export async function setDriverAccess(actorId, userId, enabled) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || user.role !== "DRIVER")
		throw httpError("Driver account not found", 404);
	return prisma.$transaction(async (tx) => {
		const updated = await tx.user.update({
			where: { id: userId },
			data: { driverEnabled: enabled },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				driverEnabled: true,
			},
		});
		await tx.auditLog.create({
			data: {
				actorId,
				entityType: "User",
				entityId: userId,
				action: "DRIVER_ACCESS_UPDATED",
				details: { enabled },
			},
		});
		return updated;
	});
}

export async function createIssue(reporterId, input) {
	return prisma.$transaction(async (tx) => {
		const issue = await tx.operationalIssue.create({
			data: { ...input, reporterId },
		});
		await tx.auditLog.create({
			data: {
				actorId: reporterId,
				entityType: "OperationalIssue",
				entityId: issue.id,
				action: "REPORTED",
				details: {},
			},
		});
		return issue;
	});
}

export function listIssues() {
	return prisma.operationalIssue.findMany({
		include: {
			reporter: {
				select: { id: true, firstName: true, lastName: true, email: true },
			},
		},
		orderBy: { createdAt: "desc" },
	});
}

export async function updateIssue(actorId, issueId, status) {
	const issue = await prisma.operationalIssue.findUnique({
		where: { id: issueId },
	});
	if (!issue) throw httpError("Issue not found", 404);
	return prisma.$transaction(async (tx) => {
		const updated = await tx.operationalIssue.update({
			where: { id: issueId },
			data: { status },
		});
		await tx.auditLog.create({
			data: {
				actorId,
				entityType: "OperationalIssue",
				entityId: issueId,
				action: "STATUS_UPDATED",
				details: { from: issue.status, to: status },
			},
		});
		return updated;
	});
}

export function listNotifications(userId) {
	return prisma.notification.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		take: 100,
	});
}

export async function markNotificationRead(userId, notificationId) {
	const result = await prisma.notification.updateMany({
		where: { id: notificationId, userId, readAt: null },
		data: { readAt: new Date() },
	});
	if (!result.count) {
		const exists = await prisma.notification.findFirst({
			where: { id: notificationId, userId },
		});
		if (!exists) throw httpError("Notification not found", 404);
	}
	return prisma.notification.findUnique({ where: { id: notificationId } });
}

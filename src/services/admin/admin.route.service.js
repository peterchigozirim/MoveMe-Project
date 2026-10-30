import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";
import { emitToGeneral } from "../../websocket/realtime.js";

class AdminRouteService {
	listRoutes = () => {
		return prisma.route.findMany({
			where: { isActive: true },
			orderBy: { origin: "asc" },
		});
	};

	listAllRoutes = () => {
		return prisma.route.findMany({ orderBy: { origin: "asc" } });
	};

	getRouteById = async (routeId) => {
		const route = await prisma.route.findUnique({ where: { id: routeId } });
		if (!route) throw httpError("Route not found", 404);
		return route;
	};

	createRoute = async (actorId, input) => {
		const existingRoute = await prisma.route.findFirst({
			where: {
				origin: input.origin,
				destination: input.destination,
			},
		});
		if (!existingRoute) {
			return prisma.$transaction(
				async (tx) => {
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
				},
				emitToGeneral("new_route", {
					type: "New Route Created",
					message: "A new route has been created.",
				}),
				{ maxWait: 5000, timeout: 10000 },
			);
		}
		throw httpError(
			"Route with the same origin and destination already exists",
			400,
		);
	};

	updateRoute = async (actorId, routeId, input) => {
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
			emitToGeneral("new_route", {
				type: "Route Updated",
				message: "A route has been updated.",
			});
			return updated;
		});
	};
	deleteRoute = async (actorId, routeId) => {
		const route = await prisma.route.findUnique({ where: { id: routeId } });
		if (!route) throw httpError("Route not found", 404);
		return prisma.$transaction(async (tx) => {
			const deleted = await tx.route.delete({ where: { id: routeId } });
			await tx.auditLog.create({
				data: {
					actorId,
					entityType: "Route",
					entityId: routeId,
					action: "DELETED",
					details: null,
				},
			});
			emitToGeneral("new_route", {
				type: "Route Deleted",
				message: "A route has been deleted.",
			});
			return deleted;
		});
	};
}
export default AdminRouteService;

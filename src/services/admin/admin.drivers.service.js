import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";

class AdminDriversService {
	async listDrivers() {
		const drivers = await prisma.user.findMany({
			where: { role: "DRIVER" },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				driverEnabled: true,
				createdAt: true,
				_count: { select: { vehicles: true } },
				vehicles: true,
			},
			orderBy: { createdAt: "desc" },
		});
		if (!drivers) {
			throw httpError("No drivers found", 404);
		}
		return drivers;
	}

	async getDriverById(id) {
		const driver = await prisma.user.findUnique({
			where: { id, role: "DRIVER" },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				driverEnabled: true,
				_count: { select: { vehicles: true } },
			},
		});
		if (!driver) {
			throw httpError("Driver not found", 404);
		}
		return driver;
	}

	async enableDriver(id) {
		const checkDriver = await prisma.user.findUnique({
			where: { id, role: "DRIVER" },
			select: { driverEnabled: true },
		});
		if (!checkDriver) {
			throw httpError("Driver not found", 404);
		}
		if (checkDriver.driverEnabled) {
			throw httpError("Driver is already enabled", 400);
		}
		const checkVehicle = await prisma.vehicle.findFirst({
			where: { driverId: id, isActive: true },
		});
		if (!checkVehicle) {
			throw httpError("Active vehicle not found for this driver", 404);
		}
		try {
			return prisma.user.update({
				where: { id, role: "DRIVER" },
				data: { driverEnabled: true },
			});
		} catch (error) {
			throw httpError("Failed to enable driver", 500);
		}
	}

	async disableDriver(id) {
		const checkDriver = await prisma.user.findUnique({
			where: { id, role: "DRIVER" },
			select: { driverEnabled: true },
		});
		if (!checkDriver) {
			throw httpError("Driver not found", 404);
		}
		if (!checkDriver.driverEnabled) {
			throw httpError("Driver is already disabled", 400);
		}
		try {
			return prisma.user.update({
				where: { id, role: "DRIVER" },
				data: { driverEnabled: false },
			});
		} catch (error) {
			throw httpError("Failed to disable driver", 500);
		}
	}
}

export default AdminDriversService;

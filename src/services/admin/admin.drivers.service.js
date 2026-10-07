import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";

class AdminDriversService {
	listDrivers() {
		try {
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
		} catch (error) {
			throw httpError(500, "Failed to list drivers");
		}
	}

	getDriverById(id) {
		try {
			return prisma.user.findUnique({
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
		} catch (error) {
			throw httpError(500, "Failed to get driver by ID");
		}
	}

	async enableDriver(id) {
		const checkDriver = await prisma.user.findUnique({
			where: { id, role: "DRIVER" },
			select: { driverEnabled: true },
		});
		if (!checkDriver) {
			throw httpError(404, "Driver not found");
		}
		if (checkDriver.driverEnabled) {
			throw httpError(400, "Driver is already enabled");
		}
		try {
			return prisma.user.update({
				where: { id, role: "DRIVER" },
				data: { driverEnabled: true },
			});
		} catch (error) {
			throw httpError(500, "Failed to enable driver");
		}
	}

	async disableDriver(id) {
		const checkDriver = await prisma.user.findUnique({
			where: { id, role: "DRIVER" },
			select: { driverEnabled: true },
		});
		if (!checkDriver) {
			throw httpError(404, "Driver not found");
		}
		if (!checkDriver.driverEnabled) {
			throw httpError(400, "Driver is already disabled");
		}
		try {
			return prisma.user.update({
				where: { id, role: "DRIVER" },
				data: { driverEnabled: false },
			});
		} catch (error) {
			throw httpError(500, "Failed to disable driver");
		}
	}
}

export default AdminDriversService;

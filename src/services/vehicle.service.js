import prisma from "../config/database.js";
import env from "../config/env.js";
import { httpError } from "../utils/http-error.js";

const SAFE_VEHICLE_FIELDS = {
	id: true,
	registration: true,
	make: true,
	model: true,
	color: true,
	seats: true,
	driverId: true,
	createdAt: true,
};
class VehicleService {
	static getUser = async (userId) => {
		const user = await prisma.user.findUnique({
			where: { id: userId },
		});
		if (!user) {
			throw new httpError("User not found", 404);
		}
		return user;
	};

	addVehicle = async (vehicleData, userId) => {
		const { registration, make, model, color, seats } = vehicleData;

		const driver = await VehicleService.getUser(userId);
		if (driver.role !== "DRIVER") {
			throw new httpError("User is not a driver", 400);
		}

		const checkHasVehicle = await prisma.vehicle.findFirst({
			where: { driverId: userId },
		});
		if (checkHasVehicle) {
			throw new httpError("Driver already has a vehicle", 400);
		}

		const vehicle = await prisma.vehicle.create({
			data: {
				registration,
				make,
				model,
				color,
				seats,
				driverId: userId,
			},
			select: SAFE_VEHICLE_FIELDS,
		});
		return vehicle;
	};

	getVehicle = async (driverId) => {
		const vehicle = await prisma.vehicle.findFirst({
			where: { driverId },
			select: SAFE_VEHICLE_FIELDS,
		});
		if (!vehicle) {
			throw new httpError("Vehicle not found", 404);
		}
		return vehicle;
	};
}

export default VehicleService;

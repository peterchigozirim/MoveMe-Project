import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test(
	"simultaneous requests cannot reserve the final pooled seat",
	{
		skip: process.env.RUN_DB_INTEGRATION_TESTS !== "1",
	},
	async () => {
		const [{ default: prisma }, { createReservation }] = await Promise.all([
			import("../src/config/database.js"),
			import("../src/services/ride.service.js"),
		]);
		const suffix = randomUUID();
		const testUsers = [];
		let route;
		let vehicle;
		let departure;
		try {
			const driver = await prisma.user.create({
				data: {
					firstName: "Concurrency",
					lastName: "Driver",
					email: `driver-${suffix}@test.invalid`,
					passwordHash: "not-used-by-test",
					role: "DRIVER",
					driverEnabled: true,
				},
			});
			const passengerA = await prisma.user.create({
				data: {
					firstName: "Pool",
					lastName: "A",
					email: `a-${suffix}@test.invalid`,
					passwordHash: "not-used-by-test",
				},
			});
			const passengerB = await prisma.user.create({
				data: {
					firstName: "Pool",
					lastName: "B",
					email: `b-${suffix}@test.invalid`,
					passwordHash: "not-used-by-test",
				},
			});
			testUsers.push(driver, passengerA, passengerB);
			route = await prisma.route.create({
				data: {
					origin: `Origin ${suffix}`,
					destination: `Destination ${suffix}`,
					durationMinutes: 60,
					soloFare: 100,
					pooledFare: 40,
				},
			});
			vehicle = await prisma.vehicle.create({
				data: {
					driverId: driver.id,
					registration: `T-${suffix.slice(0, 20)}`,
					make: "Test",
					model: "Pool",
					seats: 1,
				},
			});
			departure = await prisma.departure.create({
				data: {
					driverId: driver.id,
					vehicleId: vehicle.id,
					routeId: route.id,
					departureTime: new Date(Date.now() + 60 * 60_000),
					durationMinutes: 60,
					mode: "POOL",
					fare: 40,
					totalSeats: 1,
					trip: { create: {} },
				},
			});
			const results = await Promise.allSettled([
				createReservation(passengerA, departure.id, randomUUID()),
				createReservation(passengerB, departure.id, randomUUID()),
			]);
			assert.equal(
				results.filter((result) => result.status === "fulfilled").length,
				1,
			);
			assert.equal(
				await prisma.ride.count({
					where: { departureId: departure.id, status: "PENDING_PAYMENT" },
				}),
				1,
			);
		} finally {
			if (departure) {
				await prisma.auditLog.deleteMany({
					where: {
						entityType: "Ride",
						entityId: {
							in: (
								await prisma.ride.findMany({
									where: { departureId: departure.id },
									select: { id: true },
								})
							).map((ride) => ride.id),
						},
					},
				});
				await prisma.auditLog.deleteMany({
					where: { entityType: "Departure", entityId: departure.id },
				});
				await prisma.payment.deleteMany({
					where: { ride: { departureId: departure.id } },
				});
				await prisma.ride.deleteMany({ where: { departureId: departure.id } });
				await prisma.trip.deleteMany({ where: { departureId: departure.id } });
				await prisma.departure.delete({ where: { id: departure.id } });
			}
			if (vehicle) await prisma.vehicle.delete({ where: { id: vehicle.id } });
			if (route) await prisma.route.delete({ where: { id: route.id } });
			if (testUsers.length) {
				await prisma.auditLog.deleteMany({
					where: { actorId: { in: testUsers.map((item) => item.id) } },
				});
				await prisma.user.deleteMany({
					where: { id: { in: testUsers.map((item) => item.id) } },
				});
			}
			await prisma.$disconnect();
		}
	},
);

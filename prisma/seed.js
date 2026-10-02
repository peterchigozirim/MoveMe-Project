import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../src/config/database.js";

const demoUsers = [
	{
		firstName: "Demo",
		lastName: "Passenger",
		email: "passenger@moveme.local",
		role: "PASSENGER",
	},
	{
		firstName: "Demo",
		lastName: "Driver",
		email: "driver@moveme.local",
		role: "DRIVER",
		driverEnabled: true,
	},
	{
		firstName: "Demo",
		lastName: "Admin",
		email: "admin@moveme.local",
		role: "ADMIN",
	},
];

async function main() {
	const demoPassword = process.env.DEMO_ACCOUNT_PASSWORD;
	if (!demoPassword || demoPassword.length < 10) {
		throw new Error(
			"Set DEMO_ACCOUNT_PASSWORD to a value of at least 10 characters before seeding",
		);
	}
	const passwordHash = await bcrypt.hash(demoPassword, 12);
	for (const { driverEnabled = false, ...user } of demoUsers) {
		await prisma.user.upsert({
			where: { email: user.email },
			update: {},
			create: { ...user, passwordHash, driverEnabled },
		});
	}
	await prisma.route.upsert({
		where: {
			origin_destination: { origin: "Central Station", destination: "Airport" },
		},
		update: {},
		create: {
			origin: "Central Station",
			destination: "Airport",
			durationMinutes: 45,
			soloFare: 18000,
			pooledFare: 6500,
		},
	});
	await prisma.vehicle.upsert({
		where: { registration: "MOVEME-DEMO-1" },
		update: {},
		create: {
			registration: "MOVEME-DEMO-1",
			make: "Toyota",
			model: "Corolla",
			color: "White",
			seats: 4,
			driver: { connect: { email: "driver@moveme.local" } },
		},
	});

	console.log("Demo passenger, driver, admin, route, and vehicle are ready.");
}

main()
	.catch((error) => {
		console.error("Seed failed:", error.message);
		process.exitCode = 1;
	})
	.finally(async () => prisma.$disconnect());

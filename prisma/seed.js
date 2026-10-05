import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../src/config/database.js";

const demoUsers = [
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

	console.log("Demo passenger, driver, admin, route, and vehicle are ready.");
}

main()
	.catch((error) => {
		console.error("Seed failed:", error.message);
		process.exitCode = 1;
	})
	.finally(async () => prisma.$disconnect());

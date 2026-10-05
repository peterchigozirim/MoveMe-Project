import "dotenv/config";
import app from "./app.js";
import prisma from "./config/database.js";

const PORT = process.env.PORT || 3000;

async function main() {
	await prisma.$queryRaw`SELECT 1`;
	console.log("✅ Database connected successfully");

	app.listen(PORT, () => {
		console.log(`Server running on port ${PORT}`);
	});
}

main().catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});

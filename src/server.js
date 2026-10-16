import http from "http";
import { Server } from "socket.io";
import initSockets from "./websocket/index.js";

import "dotenv/config";
import createApp from "./app.js";
import prisma from "./config/database.js";
import env from "./config/env.js";

const PORT = process.env.PORT || 3000;

async function main() {
	const app = createApp();
	const server = http.createServer(app);
	const io = new Server(server, {
		cors: { origin: env.clientOrigin, credentials: true },
	});
	initSockets(io);

	// database connection check
	await prisma.$queryRaw`SELECT 1`;
	console.log("✅ Database connected successfully");

	server.listen(PORT, () => {
		console.log(`Server running on port ${PORT}`);
	});

	const shutdown = (signal) => {
		console.log(`${signal} received — shutting down gracefully.`);
		server.close(() => {
			prisma.$disconnect().finally(() => process.exit(0));
		});
		setTimeout(() => process.exit(1), 10_000).unref();
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});

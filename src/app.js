import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import env from "./config/env.js";
import redis from "./config/redis.js";

function createApp() {
	const app = express();
	const openApiPath = fileURLToPath(
		new URL("../openapi.yaml", import.meta.url),
	);
	const openApiDoc = YAML.parse(fs.readFileSync(openApiPath, "utf8"));

	app.use(helmet());
	app.use(cors({ origin: env.clientOrigin === "*" ? true : env.clientOrigin }));
	app.use(
		express.json({
			// Paystack signs the exact raw bytes, so keep them for webhook verification.
			verify: (req, res, buf) => {
				req.rawBody = buf;
			},
		}),
	);
	// app.use(express.urlencoded({ extended: true }));
	app.use(morgan("dev"));

	app.get("/up", (req, res) => {
		res.status(200).json({
			success: true,
			message: "API is running",
		});
	});

	app.get("/redis", async (req, res) => {
		try {
			const redisStatus = await redis.ping();

			res.json({
				api: "running",
				redis: redisStatus === "PONG" ? "connected" : "unavailable",
			});
		} catch {
			res.status(503).json({
				api: "running",
				redis: "disconnected",
			});
		}
	});

	app.get("/openapi.yaml", (req, res) => {
		res.sendFile(openApiPath);
	});
	app.use(
		"/api-docs",
		swaggerUi.serve,
		swaggerUi.setup(openApiDoc, {
			explorer: true,
			customSiteTitle: `${openApiDoc.info.title} Documentation`,
		}),
	);
	app.use("/api/v1", routes);

	app.use((req, res) => {
		res.status(404).json({ message: "Endpoint not found" });
	});

	app.use(errorHandler);

	return app;
}

export default createApp;

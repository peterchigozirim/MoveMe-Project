import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { fileURLToPath } from "node:url";

import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import env from "./config/env.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientOrigin === "*" ? true : env.clientOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.get("/up", (req, res) => {
	res.status(200).json({
		success: true,
		message: "API is running",
	});
});

app.get("/openapi.yaml", (req, res) => {
	res.sendFile(fileURLToPath(new URL("../openapi.yaml", import.meta.url)));
});
app.use("/api/v1", routes);

app.use((req, res) => {
	res.status(404).json({ message: "Endpoint not found" });
});

app.use(errorHandler);

export default app;

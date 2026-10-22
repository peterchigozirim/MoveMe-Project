import { Worker } from "bullmq";
import prisma from "../../config/database.js";
import redis from "../../config/redis.js";
import departureQueue from "../queue/departure.queue.js";
import { updateDepartureStatus } from "../../services/statusUpdate.service.js";

let shuttingDown = false;

async function startWorker() {
	// Register the recurring schedule once at worker startup.
	await departureQueue.upsertJobScheduler(
		"close-expired-departures",
		{
			every: 60_000,
		},
		{
			name: "close-expired-departures",
			data: {},
			opts: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 2000,
				},
			},
		},
	);

	const worker = new Worker(
		"departure",
		async (job) => {
			switch (job.name) {
				case "close-expired-departures": {
					const result = await updateDepartureStatus();

					console.info("Departure status maintenance completed", {
						jobId: job.id,
						...result,
					});

					return result;
				}

				default:
					throw new Error(`Unknown status job: ${job.name}`);
			}
		},
		{
			connection: redis,
			concurrency: 1,
		},
	);

	worker.on("failed", (job, error) => {
		console.error("Status job failed", {
			jobId: job?.id,
			jobName: job?.name,
			error: error.message,
		});
	});

	worker.on("error", (error) => {
		console.error("Worker infrastructure error", error);
	});

	console.info("MoveMe status worker started");

	return worker;
}

const worker = await startWorker();

async function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;

	console.info(`Received ${signal}; shutting down worker`);

	try {
		await worker.close();
		await departureQueue.close();
		await redis.quit();
		await prisma.$disconnect();
		process.exitCode = 0;
	} catch (error) {
		console.error("Worker shutdown failed", error);
		process.exitCode = 1;
	}
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

import "dotenv/config";
import Redis from "ioredis";

let redis;

if (process.env.NODE_ENV === "production") {
	const redisUrl = process.env.REDIS_URL;
	if (!redisUrl) {
		throw new Error("Missing required environment variable: REDIS_URL");
	}

	if (!/^rediss?:\/\/\S+$/.test(redisUrl)) {
		throw new Error("REDIS_URL must be a valid Redis URL");
	}

	redis = new Redis(redisUrl, {
		// Required by BullMQ workers (blocking commands must never time out).
		maxRetriesPerRequest: null,
	});
} else {
	redis = new Redis({
		host: process.env.REDIS_HOST,
		port: Number(process.env.REDIS_PORT) || 6379,
		password: process.env.REDIS_PASSWORD || undefined,
		// Required by BullMQ workers (blocking commands must never time out).
		maxRetriesPerRequest: null,
	});
}

export default redis;

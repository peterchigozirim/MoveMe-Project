import "dotenv/config";
import Redis from "ioredis";

const redis = new Redis({
	host: process.env.REDIS_HOST,
	port: Number(process.env.REDIS_PORT) || 6379,
	password: process.env.REDIS_PASSWORD || undefined,
	// Required by BullMQ workers (blocking commands must never time out).
	maxRetriesPerRequest: null,
});

export default redis;

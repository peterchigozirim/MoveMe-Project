import redis from "../../config/redis.js";
import { Queue } from "bullmq";

const departureQueue = new Queue("departure", {
	connection: redis,
});

export default departureQueue;

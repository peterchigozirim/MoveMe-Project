import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL,
});

// A single shared client
// creating a new PrismaClient per request/module exhausts Supabase's pooled connection limit fast.
const prisma = new PrismaClient({
	adapter,
	log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
});

export default prisma;

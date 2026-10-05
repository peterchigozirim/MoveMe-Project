import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const datasourceUrl = process.env.DATABASE_URL;

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: { seed: "node prisma/seed.js" },
	datasource: {
		url: env("DIRECT_URL"),
	},
});

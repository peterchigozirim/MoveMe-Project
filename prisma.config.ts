import { defineConfig } from "prisma/config";

const datasourceUrl = process.env.DATABASE_URL;

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: { seed: "node prisma/seed.js" },
	...(datasourceUrl ? { datasource: { url: datasourceUrl } } : {}),
});

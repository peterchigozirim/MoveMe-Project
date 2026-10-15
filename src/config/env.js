import "dotenv/config";

const required = ["JWT_SECRET", "DATABASE_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
	// A missing secret should crash on boot, not silently sign tokens with
	// a public fallback string.
	throw new Error(
		`Missing required environment variable(s): ${missing.join(", ")}`,
	);
}

const isProduction = process.env.NODE_ENV === "production";

// Wide-open CORS ("*") is fine for local dev but not for a deployed API —
// require a real origin once this is actually live, same fail-fast
// treatment as the secrets above.
if (isProduction && !process.env.CLIENT_ORIGIN) {
	throw new Error(
		"Missing required environment variable: CLIENT_ORIGIN (needed to lock down CORS in production)",
	);
}

export default {
	port: Number(process.env.PORT) || 4000,
	jwtSecret: process.env.JWT_SECRET,
	jwtExpiresIn: process.env.JWT_EXPIRES_IN || "3d",
	clientOrigin: process.env.CLIENT_ORIGIN || "*",
	paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
	paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL,
	isProduction,
};

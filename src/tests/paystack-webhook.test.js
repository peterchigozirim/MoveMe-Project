import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.JWT_SECRET ||= "test-secret";
process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5432/db";
process.env.PAYSTACK_SECRET_KEY = "sk_test_secret";

const { isValidWebhookSignature, handleWebhook, verifyPayment } = await import(
	"../services/payment/paystack.service.js"
);

const body = Buffer.from(JSON.stringify({ event: "charge.success" }));
const sign = (buf, key = "sk_test_secret") =>
	crypto.createHmac("sha512", key).update(buf).digest("hex");

test("accepts a correctly signed body", () => {
	assert.equal(isValidWebhookSignature(body, sign(body)), true);
});

test("rejects wrong, tampered, missing or malformed signatures", () => {
	assert.equal(isValidWebhookSignature(body, sign(body, "other")), false);
	assert.equal(
		isValidWebhookSignature(Buffer.from("tampered"), sign(body)),
		false,
	);
	assert.equal(isValidWebhookSignature(body, undefined), false);
	assert.equal(isValidWebhookSignature(undefined, sign(body)), false);
	assert.equal(isValidWebhookSignature(body, "short"), false);
});

test("handleWebhook ignores other events and invalid references", async () => {
	await handleWebhook({ event: "charge.failed", data: { reference: "x" } });
	await handleWebhook({ event: "charge.success", data: { reference: "nope" } });
	await handleWebhook(undefined);
});

test("verifyPayment rejects malformed references before any network call", async () => {
	await assert.rejects(() => verifyPayment("not-a-uuid"), {
		message: "Invalid payment reference",
		status: 400,
	});
});

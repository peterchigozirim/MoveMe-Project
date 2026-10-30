import crypto from "node:crypto";
import prisma from "../../config/database.js";
import env from "../../config/env.js";
import { httpError } from "../../utils/http-error.js";
import { emitToUser } from "../../websocket/realtime.js";

const PAYSTACK_URL = "https://api.paystack.co";
// A UUID is 36 characters; references are `<paymentId>-<timestamp>`.
const UUID_LENGTH = 36;

const toKobo = (amount) => Math.round(Number(amount) * 100);

async function paystackRequest(path, options = {}) {
	if (!env.paystackSecretKey) {
		throw httpError("Payment gateway is not configured", 503);
	}
	let response;
	try {
		response = await fetch(`${PAYSTACK_URL}${path}`, {
			...options,
			headers: {
				Authorization: `Bearer ${env.paystackSecretKey}`,
				"Content-Type": "application/json",
			},
		});
	} catch {
		throw httpError("Payment gateway is unreachable", 502);
	}
	const body = await response.json().catch(() => null);
	if (!response.ok || !body?.status) {
		throw httpError(body?.message || "Payment gateway error", 502);
	}
	return body.data;
}

async function audit(tx, actorId, entityType, entityId, action, details) {
	await tx.auditLog.create({
		data: { actorId, entityType, entityId, action, details },
	});
}

export async function initializePayment(passenger, paymentId) {
	const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
	if (!payment || payment.passengerId !== passenger.id)
		throw httpError("Payment not found", 404);
	if (payment.status !== "PENDING")
		throw httpError("Payment is no longer pending", 409);
	if (!payment.expiresAt || payment.expiresAt <= new Date()) {
		await audit(prisma, passenger.id, "Payment", paymentId, "EXPIRED", {
			reference: `${payment.id}-${Date.now()}`,
		});
		await prisma.payment.update({
			where: { id: paymentId },
			data: { status: "EXPIRED" },
		});
		throw httpError("Payment hold expired", 409);
	}

	const reference = `${payment.id}-${Date.now()}`;
	const data = await paystackRequest("/transaction/initialize", {
		method: "POST",
		body: JSON.stringify({
			email: passenger.email,
			amount: toKobo(payment.amount),
			currency: payment.currency,
			reference,
			...(env.paystackCallbackUrl
				? { callback_url: env.paystackCallbackUrl }
				: {}),
			metadata: { paymentId: payment.id, rideId: payment.rideId },
		}),
	});
	return {
		authorizationUrl: data.authorization_url,
		accessCode: data.access_code,
		reference: data.reference,
	};
}

// Settles a payment from a verified Paystack transaction. Idempotent: the
// webhook and the client-triggered verify can both call it safely.
async function settle(paymentId, transaction) {
	let paidEvent = null;
	const result = await prisma.$transaction(
		async (tx) => {
			const payment = await tx.payment.findUnique({
				where: { id: paymentId },
				include: { ride: { include: { departure: true } } },
			});
			if (!payment) throw httpError("Payment not found", 404);
			await tx.$queryRaw`SELECT id FROM "Departure" WHERE id = ${payment.ride.departureId} FOR UPDATE`;
			const current = await tx.payment.findUnique({ where: { id: paymentId } });
			if (current.status === "SUCCESS") return current;

			const paidInFull =
				transaction.status === "success" &&
				transaction.amount === toKobo(current.amount) &&
				transaction.currency === current.currency;

			if (!paidInFull) {
				if (transaction.status === "success") {
					await audit(
						tx,
						current.passengerId,
						"Payment",
						paymentId,
						"AMOUNT_MISMATCH",
						{
							reference: transaction.reference,
							paid: transaction.amount,
						},
					);
					return current;
				}
				// Abandoned/pending transactions stay pending so the passenger can retry.
				if (transaction.status !== "failed") return current;
				if (current.status !== "PENDING") return current;
				const failed = await tx.payment.update({
					where: { id: paymentId },
					data: { status: "FAILED" },
				});
				await tx.ride.update({
					where: { id: current.rideId },
					data: { status: "CANCELLED" },
				});
				await audit(tx, current.passengerId, "Payment", paymentId, "FAILED", {
					reference: transaction.reference,
				});
				return failed;
			}

			if (current.status !== "PENDING") {
				// Money was taken after the hold was released; needs a manual refund.
				await audit(
					tx,
					current.passengerId,
					"Payment",
					paymentId,
					"PAID_AFTER_EXPIRY",
					{
						reference: transaction.reference,
					},
				);
				return current;
			}
			if (!current.expiresAt || current.expiresAt <= new Date()) {
				await tx.payment.update({
					where: { id: paymentId },
					data: { status: "EXPIRED" },
				});
				await tx.ride.update({
					where: { id: current.rideId },
					data: { status: "CANCELLED" },
				});
				await audit(
					tx,
					current.passengerId,
					"Payment",
					paymentId,
					"PAID_AFTER_EXPIRY",
					{
						reference: transaction.reference,
					},
				);
				return { ...current, status: "EXPIRED" };
			}

			const updated = await tx.payment.update({
				where: { id: paymentId },
				data: { status: "SUCCESS", paidAt: new Date() },
			});
			await tx.ride.update({
				where: { id: current.rideId },
				data: { status: "CONFIRMED" },
			});
			await audit(tx, current.passengerId, "Payment", paymentId, "SUCCEEDED", {
				reference: transaction.reference,
				gateway: "paystack",
			});
			paidEvent = {
				driverId: payment.ride.departure.driverId,
				rideId: current.rideId,
				departureId: payment.ride.departureId,
			};
			return updated;
		},
		{ isolationLevel: "ReadCommitted" },
	);
	if (paidEvent) {
		emitToUser(paidEvent.driverId, "departure_updated", {
			rideId: paidEvent.rideId,
			departureId: paidEvent.departureId,
			paymentId,
			message: "A passenger completed payment for a ride.",
		});
	}
	return result;
}

function paymentIdFromReference(reference) {
	const id = String(reference ?? "").slice(0, UUID_LENGTH);
	return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

// Always confirms with Paystack's API rather than trusting client input.
export async function verifyPayment(reference, passenger = null) {
	const paymentId = paymentIdFromReference(reference);
	if (!paymentId) throw httpError("Invalid payment reference", 400);
	const owned = await prisma.payment.findUnique({
		where: { id: paymentId },
		select: {
			passengerId: true,
			ride: { select: { departure: { select: { driverId: true } } } },
		},
	});
	if (!owned || (passenger && owned.passengerId !== passenger.id))
		throw httpError("Payment not found", 404);
	const transaction = await paystackRequest(
		`/transaction/verify/${encodeURIComponent(reference)}`,
	);
	const driver = owned.ride.departure.driverId;
	emitToUser(driver, "departure_updated", {
		type: "Departure Status Updated",
		message: `departures have been closed.`,
	});
	return settle(paymentId, transaction);
}

export function isValidWebhookSignature(rawBody, signature) {
	if (!env.paystackSecretKey || !rawBody || !signature) return false;
	const expected = crypto
		.createHmac("sha512", env.paystackSecretKey)
		.update(rawBody)
		.digest("hex");
	const a = Buffer.from(expected);
	const b = Buffer.from(String(signature));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handleWebhook(event) {
	if (event?.event !== "charge.success") return;
	const reference = event.data?.reference;
	if (!paymentIdFromReference(reference)) return;
	await verifyPayment(reference);
}

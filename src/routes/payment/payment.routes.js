import { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  authorize,
} from "../../middlewares/session.middleware.js";
import { asyncHandler } from "../../middlewares/request.middleware.js";
import {
  handleWebhook,
  initializePayment,
  isValidWebhookSignature,
  verifyPayment,
} from "../../services/payment/paystack.service.js";

const router = Router();
const uuid = z.string().uuid();

// Public endpoint called by Paystack; authenticity is proven by the HMAC signature.
router.post(
  "/paystack/webhook",
  asyncHandler(async (req, res) => {
    if (
      !isValidWebhookSignature(req.rawBody, req.get("x-paystack-signature"))
    ) {
      return res.status(401).json({ message: "Invalid signature" });
    }
    await handleWebhook(req.body);
    res.sendStatus(200);
  }),
);

router.post(
  "/:paymentId/initialize",
  authenticate,
  authorize("PASSENGER"),
  asyncHandler(async (req, res) => {
    const paymentId = uuid.safeParse(req.params.paymentId);
    if (!paymentId.success)
      return res.status(400).json({ message: "Invalid payment id" });
    res.json({ data: await initializePayment(req.user, paymentId.data) });
  }),
);

router.get(
  "/verify/:reference",
  authenticate,
  authorize("PASSENGER"),
  asyncHandler(async (req, res) => {
    res.json({ data: await verifyPayment(req.params.reference, req.user) });
  }),
);

export default router;

import { Router } from "express";
import AdminAuditController from "../../controller/admin/admin.audit.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { checkAdmin } from "../../middlewares/role.middleware.js";

const { getAudits, getOneAuditById } = AdminAuditController;

const router = Router();
router.get("/", authenticate, checkAdmin, getAudits);
router.get("/:id", authenticate, checkAdmin, getOneAuditById);

export default router;

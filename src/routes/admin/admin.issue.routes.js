import { Router } from "express";
import AdminIssueController from "../../controller/admin/admin.issue.controller.js";
import { authenticate } from "../../middlewares/session.middleware.js";
import { checkAdmin } from "../../middlewares/role.middleware.js";
import {
	createIssueSchema,
	updateIssueSchema,
} from "../../middlewares/admin/admin.issue.middleware.js";

const router = Router();
const adminIssueController = new AdminIssueController();

router.get("/", authenticate, checkAdmin, adminIssueController.listIssues);
router.get("/:id", authenticate, checkAdmin, adminIssueController.getIssueById);
router.post(
	"/",
	authenticate,
	checkAdmin,
	createIssueSchema,
	adminIssueController.createNewIssue,
);
router.put(
	"/:id",
	authenticate,
	checkAdmin,
	updateIssueSchema,
	adminIssueController.update,
);
router.delete("/:id", authenticate, checkAdmin, adminIssueController.delete);

export default router;

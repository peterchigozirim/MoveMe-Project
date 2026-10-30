import { Router } from "express";

import IssueController from "../controller/issue.controller.js";
import { authenticate } from "../middlewares/session.middleware.js";

const router = Router();
const issueController = new IssueController();

router.get("/", authenticate, issueController.listIssues);
router.get("/:id", authenticate, issueController.getIssueById);
router.post("/", authenticate, issueController.createNewIssue);

export default router;

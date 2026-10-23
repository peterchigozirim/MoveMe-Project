import { success } from "zod";
import {
	getAllIssues,
	getIssueById,
	createIssue,
	updateIssue,
	deleteIssue,
} from "../../services/admin/admin.issue.service.js";

class AdminIssueController {
	async listIssues(req, res, next) {
		try {
			const issues = await getAllIssues();
			res.json(issues);
		} catch (error) {
			next(error);
		}
	}

	async getIssueById(req, res, next) {
		try {
			const issue = await getIssueById(req.params.id);
			res.json(issue);
		} catch (error) {
			next(error);
		}
	}

	async createNewIssue(req, res, next) {
		try {
			const issue = await createIssue(req.body, req.user.id);
			res.status(201).json({
				success: true,
				data: issue,
				message: "Issue created successfully",
			});
		} catch (error) {
			next(error);
		}
	}

	async update(req, res, next) {
		try {
			const issue = await updateIssue(req.params.id, req.body);
			res.json({
				success: true,
				data: issue,
				message: "Issue updated successfully",
			});
		} catch (error) {
			next(error);
		}
	}

	async delete(req, res, next) {
		try {
			const issue = await deleteIssue(req.params.id);
			res.json({
				success: true,
				data: issue,
				message: "Issue deleted successfully",
			});
		} catch (error) {
			next(error);
		}
	}
}

export default AdminIssueController;

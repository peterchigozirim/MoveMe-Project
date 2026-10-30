import * as IssueService from "../services/issues.service.js";

class IssueController {
	listIssues = async (req, res, next) => {
		try {
			const userId = req.user.id;
			const issues = await IssueService.getAllIssues(userId);
			res.json(issues);
		} catch (error) {
			next(error);
		}
	};

	getIssueById = async (req, res, next) => {
		try {
			const issue = await IssueService.getIssueById(req.params.id, req.user.id);
			res.json(issue);
		} catch (error) {
			next(error);
		}
	};

	createNewIssue = async (req, res, next) => {
		try {
			const issue = await IssueService.createIssue(req.body, req.user.id);
			res.status(201).json(issue);
		} catch (error) {
			next(error);
		}
	};
}

export default IssueController;

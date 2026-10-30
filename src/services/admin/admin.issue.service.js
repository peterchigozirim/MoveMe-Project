import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";
import { emitToUsers } from "../../websocket/realtime.js";

export async function getAllIssues() {
	const issues = await prisma.operationalIssue.findMany({
		orderBy: { createdAt: "desc" },
	});
	if (!issues || issues.length === 0) {
		throw httpError("No issues found", 404);
	}
	return issues;
}

export async function getIssueById(issueId) {
	const issue = await prisma.operationalIssue.findUnique({
		where: { id: issueId },
	});
	if (!issue) {
		throw httpError("Issue not found", 404);
	}
	return issue;
}

export async function createIssue(data, userId) {
	const issue = await prisma.operationalIssue.create({
		data: { ...data, reporterId: userId },
	});
	if (!issue) {
		console.log(issue);

		throw httpError("Issue could not be created", 500);
	}
	return issue;
}

export async function updateIssue(issueId, data) {
	const issue = await prisma.operationalIssue.update({
		where: { id: issueId },
		data,
	});
	if (!issue) {
		throw httpError("Issue could not be updated", 500);
	}
	emitToUsers([issue.reporterId], "issue_updated", {
		type: "update",
		message: "Issue has been updated",
	});
	return issue;
}

export async function deleteIssue(issueId) {
	const issue = await prisma.operationalIssue.delete({
		where: { id: issueId },
	});
	if (!issue) {
		throw httpError("Issue could not be deleted", 500);
	}
	return issue;
}

import prisma from "../config/database.js";
import { httpError } from "../utils/http-error.js";

export const getAllIssues = async (userId) => {
	const issues = await prisma.operationalIssue.findMany({
		where: { reporterId: userId },
		orderBy: { createdAt: "desc" },
	});
	if (!issues || issues.length === 0) throw httpError("No issues found", 404);

	return issues;
};

export const getIssueById = async (id, userId) => {
	const issue = await prisma.operationalIssue.findUnique({
		where: { id: id, reporterId: userId },
		orderBy: { createdAt: "desc" },
	});
	if (!issue) throw httpError("Issue not found", 404);
	return issue;
};

export const createIssue = async (data, userId) => {
	try {
		return await prisma.operationalIssue.create({
			data: {
				...data,
				reporterId: userId,
			},
		});
	} catch (error) {
		throw httpError("Failed to create issue", 500);
	}
};

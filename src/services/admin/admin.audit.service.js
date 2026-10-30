import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";

export async function getAllAudits() {
	const audits = await prisma.auditLog.findMany();
	if (!audits || audits.length === 0) {
		throw httpError("No audits found", 404);
	}
	return audits;
}

export async function getAuditById(auditId) {
	const audit = await prisma.auditLog.findUnique({ where: { id: auditId } });
	if (!audit) {
		throw httpError("Audit not found", 404);
	}
	return audit;
}

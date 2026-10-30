import {
	getAllAudits,
	getAuditById,
} from "../../services/admin/admin.audit.service.js";

class AdminAuditController {
	static async getAudits(req, res) {
		try {
			const audits = await getAllAudits();
			res.json({
				data: audits,
				message: "Audits retrieved successfully",
			});
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	}

	static async getOneAuditById(req, res) {
		try {
			const audit = await getAuditById(req.params.id);
			res.json({
				data: audit,
				message: "Audit retrieved successfully",
			});
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	}
}

export default AdminAuditController;

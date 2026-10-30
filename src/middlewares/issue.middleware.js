import joi from "joi";

export const createIssueSchema = (req, res, next) => {
	const schema = joi.object({
		title: joi.string().required(),
		description: joi.string().required(),
	});
	const { error } = schema.validate(req.body);
	if (error) {
		return res.status(400).json({
			success: false,
			message: error.details[0].message
				.replace(/["]/g, "")
				.split(" ")
				.join(" "),
		});
	}
	next();
};

export const updateIssueSchema = (req, res, next) => {
	const schema = joi.object({
		status: joi.string().valid("OPEN", "IN_PROGRESS", "RESOLVED"),
	});
	const { error } = schema.validate(req.body);
	if (error) {
		return res.status(400).json({
			success: false,
			message: error.details[0].message
				.replace(/["]/g, "")
				.split(" ")
				.join(" "),
		});
	}
	next();
};

import joi from "joi";

export const validateUserId = (req, res, next) => {
	const schema = joi.object({
		id: joi.string().uuid().required(),
	});
	const { error } = schema.validate(req.params);
	if (error) {
		const errors = error.details.map((detail) => {
			if (detail.type === "any.required") {
				return "select a user";
			} else if (detail.type === "string.min") {
				return "invalid user id";
			}
			return detail.message;
		});
		return res.status(400).json({ message: errors.join(", ") });
	}
	next();
};

export const validateUserUpdate = (req, res, next) => {
	const schema = joi.object({
		firstName: joi.string().min(3).optional(),
		lastName: joi.string().min(3).optional(),
		email: joi.string().email().optional(),
	});
	const { error } = schema.validate(req.body);
	if (error) {
		const errors = error.details.map((detail) => detail.message);
		return res.status(400).json({ message: errors.join(", ") });
	}
	next();
};

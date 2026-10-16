import joi from "joi";

const authenticate = (req, res, next) => {
	if (!req.user) {
		return res.status(401).json({ message: "Unauthorized" });
	}
	next();
};

const registerInput = (req, res, next) => {
	if (!req.body) {
		return res.status(400).json({ message: "Request body is missing" });
	}
	const { error, value } = joi
		.object({
			firstName: joi.string().min(1).required(),
			lastName: joi.string().min(1).required(),
			email: joi.string().email().required(),
			password: joi.string().min(1).required(),
			phone: joi.string().min(1).required(),
			role: joi
				.string()
				.valid("passenger", "driver")
				.required()
				.default("passenger"),
		})
		.validate(req.body);
	if (error) {
		const errors = error.details.map((detail) =>
			detail.message.replaceAll('"', ""),
		);
		return res.status(400).json({ message: "Invalid new input", errors });
	}
	req.body = value;

	next();
};

const loginInput = (req, res, next) => {
	if (!req.body) {
		return res.status(400).json({ message: "Request body is missing" });
	}
	const { error, value } = joi
		.object({
			email: joi.string().email().required(),
			password: joi.string().min(1).required(),
		})
		.validate(req.body);
	if (error) {
		const errors = error.details.map((detail) =>
			detail.message.replaceAll('"', ""),
		);
		return res.status(400).json({ message: "Invalid login input", errors });
	}
	req.body = value;

	next();
};

const changePasswordInput = (req, res, next) => {
	if (!req.body) {
		return res.status(400).json({ message: "Request body is missing" });
	}
	const { error, value } = joi
		.object({
			oldPassword: joi.string().min(8).required(),
			newPassword: joi.string().min(8).required(),
		})
		.validate(req.body);
	if (error) {
		const errors = error.details.map((detail) => {
			if (detail.context?.key === "oldPassword") {
				if (detail.type === "any.required") {
					return "Old password is required";
				} else if (detail.type === "string.min") {
					return "Old password must be at least 8 characters long";
				}
			}
			if (detail.context?.key === "newPassword") {
				if (detail.type === "any.required") {
					return "New password is required";
				} else if (detail.type === "string.min") {
					return "New password must be at least 8 characters long";
				}
			}
			return detail.message.replaceAll('"', "");
		});
		return res
			.status(400)
			.json({ message: "Invalid change password input", errors });
	}
	req.body = value;

	next();
};

export { authenticate, registerInput, loginInput, changePasswordInput };

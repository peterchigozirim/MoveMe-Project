import zod from "zod";

const validateAuth = (req, res, next) => {
	const schema = zod.object({
		email: zod.string().email(),
		password: zod.string().min(6),
	});
	const validationResult = schema.safeParse(req.body);
	if (!validationResult.success) {
		return res.status(400).json({
			status: "error",
			message: "Validation failed",
			errors: validationResult.error.errors,
		});
	}
	req.body = validationResult.data;
	next();
};
const validateRegisterInput = (req, res, next) => {
	const schema = zod.object({
		name: zod.string().min(3),
		email: zod.string().email(),
		password: zod.string().min(6),
		firstName: zod.string().min(3),
		lastName: zod.string().min(3),
		phone: zod.string().min(10),
	});
	const validationResult = schema.safeParse(req.body);
	if (!validationResult.success) {
		return res.status(400).json({
			status: "error",
			message: "Validation failed",
			errors: validationResult.error.errors,
		});
	}
	req.body = validationResult.data;
	next();
};

const validateChangePasswordInput = (req, res, next) => {
	const schema = zod.object({
		oldPassword: zod.string().min(6),
		newPassword: zod.string().min(6),
	});
	const validationResult = schema.safeParse(req.body);
	if (!validationResult.success) {
		return res.status(400).json({
			status: "error",
			message: "Validation failed",
			errors: validationResult.error.errors,
		});
	}
	req.body = validationResult.data;
	next();
};

export { validateAuth, validateRegisterInput, validateChangePasswordInput };

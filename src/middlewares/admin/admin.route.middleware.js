import joi from "joi";
import id from "zod/v4/locales/id.cjs";

export const validateRouteInput = (req, res, next) => {
	if (!req.body) {
		return res.status(400).json({ message: "Request body is missing" });
	}
	const { error, value } = joi
		.object({
			origin: joi.string().min(3).required(),
			durationMinutes: joi.number().required(),
			destination: joi.string().min(3).required(),
			soloFare: joi.number().required(),
			pooledFare: joi.number().required(),
			isActive: joi.boolean().optional(),
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

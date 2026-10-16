import { httpError } from "../utils/http-error.js";
import joi from "joi";

const vehicleSchema = joi.object({
	registration: joi.string().required(),
	make: joi.string().required(),
	model: joi.string().required(),
	color: joi.string().required(),
	seats: joi.number().required(),
});

export const validateVehicle = (req, res, next) => {
	const { error } = vehicleSchema.validate(req.body);
	if (error) {
		const errors = error.details.map((detail) =>
			detail.message.replaceAll('"', ""),
		);
		throw new httpError(errors.join(", "), 400);
	}
	next();
};

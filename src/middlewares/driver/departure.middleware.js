import joi from "joi";

class DepartureMiddleware {
	validatePublishDeparture(req, res, next) {
		const schema = joi.object({
			routeId: joi.string().required(),
			departureTime: joi.date().required(),
			mode: joi.string().valid("SOLO", "POOL").required(),
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
	}
}

export default DepartureMiddleware;

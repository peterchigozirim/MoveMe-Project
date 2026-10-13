import joi from "joi";

class SearchRideMiddleware {
	searchRideInput = (req, res, next) => {
		const schema = joi.object({
			destination: joi.string().optional(),
			origin: joi.string().optional(),
		});
		const { error } = schema.validate(req.body);
		if (error) {
			const errors = error.details.map((detail) =>
				detail.message.replace(/"/g, ""),
			);
			return res.status(400).json({ message: errors.join(", ") });
		}
		next();
	};
}

export default SearchRideMiddleware;

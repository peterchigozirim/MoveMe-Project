export function validateRequest(schema, source = "body") {
	return (req, res, next) => {
		const parsed = schema.safeParse(req[source]);
		if (!parsed.success) {
			const error = new Error("Request validation failed");
			error.status = 400;
			error.details = parsed.error.issues;
			return next(error);
		}
		req.validated = parsed.data;
		next();
	};
}

export function asyncHandler(handler) {
	return (req, res, next) =>
		Promise.resolve(handler(req, res, next)).catch(next);
}

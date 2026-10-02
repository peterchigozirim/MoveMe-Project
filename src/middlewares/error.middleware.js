export function errorHandler(err, req, res, next) {
	const statusCode =
		err.status ||
		err.statusCode ||
		{
			P2002: 409,
			P2025: 404,
			P2034: 409,
		}[err.code] ||
		500;
	const message =
		err.code === "P2002"
			? "A record with these details already exists"
			: err.code === "P2025"
				? "Record not found"
				: err.code === "P2034"
					? "This request conflicted with another update; retry it"
					: err.message;

	res.status(statusCode).json({
		message: statusCode >= 500 ? "Internal server error" : message,
		...(err.details ? { errors: err.details } : {}),
	});
}

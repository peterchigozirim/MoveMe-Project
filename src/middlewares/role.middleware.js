export function authorize(...roles) {
	return (req, res, next) => {
		if (!req.user || !roles.includes(req.user.role)) {
			return res.status(403).json({ message: "Insufficient permissions" });
		}
		next();
	};
}

export function requireEnabledDriver(req, res, next) {
	if (req.user?.role !== "DRIVER" || !req.user.driverEnabled) {
		return res.status(403).json({ message: "Enabled driver access required" });
	}
	next();
}

export const checkDriver = (req, res, next) => {
	if (req.user?.role !== "DRIVER") {
		return res.status(403).json({ message: "Driver access required" });
	}
	next();
};

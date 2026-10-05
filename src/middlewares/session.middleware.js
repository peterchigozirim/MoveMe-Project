import jwt from "jsonwebtoken";
import prisma from "../config/database.js";
import env from "../config/env.js";
export { authorize, requireEnabledDriver } from "./role.middleware.js";

export async function authenticate(req, res, next) {
	let payload;
	try {
		const [scheme, token] = (req.get("authorization") ?? "").split(" ");
		if (scheme !== "Bearer" || !token) {
			return res.status(401).json({ message: "Unauthorized" });
		}
		payload = jwt.verify(token, env.jwtSecret);
	} catch {
		return res.status(401).json({ message: "Invalid or expired token" });
	}
	try {
		const user = await prisma.user.findUnique({
			where: { id: payload.userId },
			select: {
				id: true,
				role: true,
				driverEnabled: true,
				firstName: true,
				lastName: true,
				email: true,
				phone: true,
				createdAt: true,
			},
		});
		if (!user) return res.status(401).json({ message: "Invalid session" });
		req.user = user;
		next();
	} catch (error) {
		next(error);
	}
}

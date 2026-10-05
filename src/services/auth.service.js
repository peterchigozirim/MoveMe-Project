import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import prisma from "../config/database.js";
import env from "../config/env.js";
import { httpError } from "../utils/http-error.js";

const SAFE_USER_FIELDS = {
	id: true,
	firstName: true,
	lastName: true,
	email: true,
	phone: true,
	role: true,
	createdAt: true,
};

class AuthService {
	generateToken(userId, email, name) {
		return jwt.sign({ userId, email, name }, env.jwtSecret, {
			expiresIn: env.jwtExpiresIn,
		});
	}

	verifyToken(token) {
		return jwt.verify(token, env.jwtSecret);
	}

	async registerUser(newUser) {
		const { firstName, lastName, email, password, phone, role } = newUser;
		const existingUser = await prisma.user.findUnique({ where: { email } });
		if (existingUser) {
			throw new httpError("User already exists", 409);
		}

		const passwordHash = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: {
				email,
				passwordHash,
				firstName,
				lastName,
				phone,
				role: role.toUpperCase(),
			},
			select: SAFE_USER_FIELDS,
		});

		const token = this.generateToken(
			user.id,
			user.email,
			`${user.firstName} ${user.lastName}`,
		);
		return { token, user };
	}

	async loginUser(email, password) {
		const user = await prisma.user.findUnique({ where: { email } });

		if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
			throw new httpError("These credentials do not match our records.", 401);
		}

		const token = this.generateToken(
			user.id,
			user.email,
			`${user.firstName} ${user.lastName}`,
		);
		return {
			token,
			user: {
				id: user.id,
				name: `${user.firstName} ${user.lastName}`,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				phone: user.phone,
				role: user.role,
				createdAt: user.createdAt,
			},
		};
	}

	async getProfile(userId) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: SAFE_USER_FIELDS,
		});
		if (!user) {
			throw new httpError("User not found", 404);
		}
		return user;
	}

	async updateUser(userId, name, email) {
		try {
			const user = await prisma.user.update({
				where: { id: userId },
				data: { name, email },
				select: SAFE_USER_FIELDS,
			});
			return user;
		} catch (err) {
			if (err.code === "P2025") throw new httpError("User not found", 404);
			throw err;
		}
	}

	// Not routed this sprint (password reset is a backlog item) — same as above.
	async changePassword(userId, oldPassword, newPassword) {
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			throw new httpError("User not found", 404);
		}

		const isOldPasswordValid = await bcrypt.compare(
			oldPassword,
			user.passwordHash,
		);
		if (!isOldPasswordValid) {
			throw new httpError("Old password is incorrect", 400);
		}
		if (oldPassword === newPassword) {
			throw new httpError(
				"New password must be different from the old password",
				400,
			);
		}

		const password = await bcrypt.hash(newPassword, 10);
		await prisma.user.update({
			where: { id: userId },
			data: { passwordHash: password },
		});
		return { userId };
	}
}

export default AuthService;

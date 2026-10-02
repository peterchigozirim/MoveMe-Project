const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const env = require("../config/env");
const AppError = require("../utils/AppError");

const SAFE_USER_FIELDS = {
	id: true,
	name: true,
	email: true,
	firstName: true,
	lastName: true,
	phone: true,
	createdAt: true,
};

class AuthService {
	generateToken(userId, email, name) {
		return jwt.sign({ userId, email, name }, env.jwtSecret, {
			expiresIn: env.jwtExpiresIn,
		});
	}

	verifyToken(token) {
		// Let this throw — callers decide how to translate a bad/expired
		// token into a response instead of silently getting `null` back.
		return jwt.verify(token, env.jwtSecret);
	}

	async registerUser(newUser) {
		const { name, email, password, firstName, lastName, phone } = newUser;
		const existingUser = await prisma.user.findUnique({ where: { email } });
		if (existingUser) {
			throw new AppError("User already exists", 409);
		}

		const passwordHash = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: { name, email, passwordHash, firstName, lastName, phone },
			select: SAFE_USER_FIELDS,
		});

		const token = this.generateToken(user.id, user.email, user.name);
		return { token, user };
	}

	async loginUser(email, password) {
		const user = await prisma.user.findUnique({ where: { email } });
		// Same message either way — don't tell an attacker whether the
		// email exists (PRD A2: "generic invalid credentials error").
		if (!user || !(await bcrypt.compare(password, user.password))) {
			throw new AppError("These credentials do not match our records.", 401);
		}

		const token = this.generateToken(user.id, user.email, user.name);
		return {
			token,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				phone: user.phone,
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
			throw new AppError("User not found", 404);
		}
		return user;
	}

	// Not routed this sprint (profile editing is a backlog item) — kept
	// working and ported to Prisma so it isn't dead code waiting to break
	// the moment someone re-enables the route.
	async updateUser(userId, name, email) {
		try {
			const user = await prisma.user.update({
				where: { id: userId },
				data: { name, email },
				select: SAFE_USER_FIELDS,
			});
			return user;
		} catch (err) {
			if (err.code === "P2025") throw new AppError("User not found", 404);
			throw err;
		}
	}

	// Not routed this sprint (password reset is a backlog item) — same as above.
	async changePassword(userId, oldPassword, newPassword) {
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			throw new AppError("User not found", 404);
		}

		const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
		if (!isOldPasswordValid) {
			throw new AppError("Old password is incorrect", 400);
		}
		if (oldPassword === newPassword) {
			throw new AppError(
				"New password must be different from the old password",
				400,
			);
		}

		const password = await bcrypt.hash(newPassword, 10);
		await prisma.user.update({ where: { id: userId }, data: { password } });
		return { userId };
	}
}

export default AuthService;

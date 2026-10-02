import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/database.js";
import env from "../config/env.js";

const userFields = {
	id: true,
	firstName: true,
	lastName: true,
	email: true,
	phone: true,
	role: true,
	driverEnabled: true,
	createdAt: true,
};

export async function registerUser(input) {
	const passwordHash = await bcrypt.hash(input.password, 12);
	const user = await prisma.user.create({
		data: {
			firstName: input.firstName,
			lastName: input.lastName,
			email: input.email.toLowerCase(),
			phone: input.phone,
			passwordHash,
			role: input.role ?? "PASSENGER",
		},
		select: userFields,
	});
	return { user, token: createToken(user) };
}

export async function loginUser(email, password) {
	const user = await prisma.user.findUnique({
		where: { email: email.toLowerCase() },
	});
	if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
		const error = new Error("Invalid email or password");
		error.status = 401;
		throw error;
	}
	const { passwordHash, ...safeUser } = user;
	return { user: safeUser, token: createToken(user) };
}

function createToken(user) {
	return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
		expiresIn: env.jwtExpiresIn,
	});
}

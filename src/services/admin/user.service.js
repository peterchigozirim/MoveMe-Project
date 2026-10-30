import prisma from "../../config/database.js";
import { httpError } from "../../utils/http-error.js";

class AdminUserService {
	listUsers = async () => {
		const users = await prisma.user.findMany({
			where: { role: "PASSENGER" },
			orderBy: { createdAt: "asc" },
		});

		if (!users || users.length === 0) throw httpError("No users found", 404);
		return users;
	};

	getUserById = async (id) => {
		const user = await prisma.user.findUnique({
			where: { id },
		});

		if (!user) throw httpError("User not found", 404);
		return user;
	};

	deleteUserById = async (id) => {
		const user = await prisma.user.findUnique({
			where: { id },
		});

		if (!user) throw httpError("User not found", 404);

		await prisma.user.delete({
			where: { id },
		});

		return { message: "User deleted successfully" };
	};

	updateUserById = async (id, data) => {
		const user = await prisma.user.findUnique({
			where: { id },
		});

		if (!user) throw httpError("User not found", 404);

		const updatedUser = await prisma.user.update({
			where: { id },
			data,
		});

		return updatedUser;
	};
}

export default AdminUserService;

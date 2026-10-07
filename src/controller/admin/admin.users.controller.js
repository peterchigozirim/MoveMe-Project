import AdminUserService from "../../services/admin/user.service.js";

const adminUserService = new AdminUserService();

class AdminUsersController {
	listUsers = async (req, res, next) => {
		try {
			const users = await adminUserService.listUsers();
			res.status(200).json({
				status: "success",
				message: "Users retrieved successfully",
				data: users,
			});
		} catch (error) {
			next(error);
		}
	};

	getUserById = async (req, res, next) => {
		try {
			const user = await adminUserService.getUserById(req.params.id);
			res.status(200).json({
				status: "success",
				message: "User retrieved successfully",
				data: user,
			});
		} catch (error) {
			next(error);
		}
	};

	deleteUserById = async (req, res, next) => {
		try {
			const result = await adminUserService.deleteUserById(req.params.id);
			res.status(200).json({
				status: "success",
				message: "User deleted successfully",
				data: result,
			});
		} catch (error) {
			next(error);
		}
	};

	updateUserById = async (req, res, next) => {
		try {
			const updatedUser = await adminUserService.updateUserById(
				req.params.id,
				req.body,
			);
			res.status(200).json({
				status: "success",
				message: "User updated successfully",
				data: updatedUser,
			});
		} catch (error) {
			next(error);
		}
	};
}

export default AdminUsersController;

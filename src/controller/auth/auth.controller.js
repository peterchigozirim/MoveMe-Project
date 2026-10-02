import AuthService from "../../services/auth.service";

const authService = new AuthService();

const AuthController = {
	registerUser: async (req, res, next) => {
		try {
			const newUser = req.body;
			const result = await authService.registerUser(newUser);
			res.status(201).json({
				status: "success",
				message: "User registered successfully",
				data: result,
			});
		} catch (err) {
			next(err);
		}
	},
	loginUser: async (req, res, next) => {
		try {
			const { email, password } = req.body;
			const result = await authService.loginUser(email, password);
			res.status(200).json({
				status: "success",
				message: "Login successful",
				data: result,
			});
		} catch (err) {
			next(err);
		}
	},
	getProfile: async (req, res, next) => {
		try {
			const userId = req.user.id;
			const result = await authService.getProfile(userId);
			res.status(200).json({
				status: "success",
				message: "Profile retrieved successfully",
				data: result,
			});
		} catch (err) {
			next(err);
		}
	},
	updateUser: async (req, res, next) => {
		try {
			const userId = req.user.id;
			const { name, email } = req.body;
			const result = await authService.updateUser(userId, name, email);
			res.status(200).json({
				status: "success",
				message: "User updated successfully",
				data: result,
			});
		} catch (err) {
			next(err);
		}
	},
	changePassword: async (req, res, next) => {
		try {
			const userId = req.user.id;
			const { oldPassword, newPassword } = req.body;
			const result = await authService.changePassword(
				userId,
				oldPassword,
				newPassword,
			);
			res.status(200).json({
				status: "success",
				message: "Password changed successfully",
				data: result,
			});
		} catch (err) {
			next(err);
		}
	},
};

import AuthService from "../../services/auth.service.js";

const authService = new AuthService();

const AuthController = {
	async registerUser(req, res, next) {
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
	async loginUser(req, res, next) {
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
	async getProfile(req, res, next) {
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

	async changePassword(req, res, next) {
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
				// data: result,
			});
		} catch (err) {
			next(err);
		}
	},
};

export default AuthController;

import express from "express";
import AdminUsersController from "../../controller/admin/users.controller.js";
import { authenticate } from "../../middlewares/session.middleware.js";
import { checkAdmin } from "../../middlewares/role.middleware.js";
import { validateUserUpdate } from "../../middlewares/admin/admin.user.middleware.js";

const router = express.Router();
const adminUsersController = new AdminUsersController();

router.get("/", authenticate, checkAdmin, adminUsersController.listUsers);
router.get("/:id", authenticate, checkAdmin, adminUsersController.getUserById);
router.delete(
	"/:id",
	authenticate,
	checkAdmin,
	adminUsersController.deleteUserById,
);
router.put(
	"/:id",
	authenticate,
	checkAdmin,
	validateUserUpdate,
	adminUsersController.updateUserById,
);

export default router;

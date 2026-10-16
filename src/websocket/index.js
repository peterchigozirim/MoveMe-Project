import authService from "../services/auth.service.js";
import { setIO } from "./realtime.js";

function initSockets(io) {
	io.use((socket, next) => {
		try {
			const token = socket.handshake.auth?.token;
			if (!token) return next(new Error("Authentication required"));

			const decoded = authService.verifyToken(token);
			socket.user = {
				id: decoded.userId,
				email: decoded.email,
				name: decoded.name,
			};
			next();
		} catch (err) {
			next(new Error("Invalid or expired token"));
		}
	});

	setIO(io);

	io.on("connection", (socket) => {
		socket.join(`user:${socket.user.id}`);

		socket.on("channel:join", async (channelId, ack) => {
			try {
				socket.join(`channel:${channelId}`);
				ack?.({ ok: true });
			} catch (err) {
				ack?.({ ok: false, error: err.message || "Unable to join channel" });
			}
		});

		socket.on("channel:leave", (channelId) => {
			socket.leave(`channel:${channelId}`);
		});
	});
}

export default initSockets;

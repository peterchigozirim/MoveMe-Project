let io = null;

export function setIO(instance) {
	io = instance;
}

export function emitToUser(userId, event, payload) {
	io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds, event, payload) {
	for (const userId of new Set(userIds)) emitToUser(userId, event, payload);
}

export function emitToGeneral(event, payload) {
	io?.emit(event, payload);
}

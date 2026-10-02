export function intervalsOverlap(startA, endA, startB, endB) {
	return startA < endB && startB < endA;
}

export function reservationIsActive(ride, now) {
	return (
		ride.status === "CONFIRMED" ||
		(ride.status === "PENDING_PAYMENT" &&
			ride.payment?.status === "PENDING" &&
			ride.payment.expiresAt > now)
	);
}

export function availableSeats(departure, rides, now) {
	const occupied = rides.reduce(
		(total, ride) => total + (reservationIsActive(ride, now) ? ride.seats : 0),
		0,
	);
	return departure.mode === "SOLO"
		? occupied === 0
			? 1
			: 0
		: Math.max(0, departure.totalSeats - occupied);
}

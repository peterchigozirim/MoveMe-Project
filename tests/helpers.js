export function response() {
	return {
		statusCode: 200,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(body) {
			this.body = body;
			return this;
		},
	};
}

export function stub(t, target, key, implementation) {
	const original = target[key];
	target[key] = implementation;
	t.after(() => {
		target[key] = original;
	});
}

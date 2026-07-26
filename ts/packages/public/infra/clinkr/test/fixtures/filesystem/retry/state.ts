let attempts = 0;

export function nextAttempt(): number {
	attempts += 1;
	return attempts;
}

export function readAttempts(): number {
	return attempts;
}

export function clearAttempts(): void {
	attempts = 0;
}

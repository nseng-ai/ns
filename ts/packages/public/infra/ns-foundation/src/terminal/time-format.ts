export function formatElapsedMs(elapsedMs: number): string {
	const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
	if (seconds < 60) return `${seconds}s`;

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

export function formatCountdownMs(remainingMs: number): string {
	const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
	if (remainingSeconds < 60) return `${remainingSeconds}s`;

	const minutes = Math.floor(remainingSeconds / 60);
	const seconds = remainingSeconds % 60;
	return seconds === 0 ? `${minutes}m` : `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

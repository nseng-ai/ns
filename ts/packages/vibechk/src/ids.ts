export function generateRunId(): string {
	const hex = randomHex(4);
	return hex.toLowerCase();
}

function randomHex(bytes: number): string {
	const array = new Uint8Array(bytes);
	crypto.getRandomValues(array);
	return Array.from(array)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function parseJsonObject(
	text: string,
): { type: "ok"; value: unknown } | { type: "failure"; message: string } {
	try {
		return { type: "ok", value: JSON.parse(text) };
	} catch (error) {
		return { type: "failure", message: error instanceof Error ? error.message : String(error) };
	}
}

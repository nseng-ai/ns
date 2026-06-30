export function brmemCheckJson(present: boolean): string {
	return JSON.stringify({ exitCode: 0, data: { present } });
}

const ANSI_ESCAPE_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
	return text.replace(ANSI_ESCAPE_RE, "");
}

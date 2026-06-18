const TERMINAL_ESCAPE_PATTERN = /\x1B(?:\](?:[^\x07\x1B]|\x1B(?!\\))*?(?:\x07|\x1B\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripTerminalEscapes(value: string): string {
	return value.replace(TERMINAL_ESCAPE_PATTERN, "");
}

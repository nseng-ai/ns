// Keep this local to clinkr: `@ns/core` currently depends on `@ns/clinkr`, so clinkr cannot
// import the canonical core terminal-escape helper without creating a package cycle. The pattern is
// intentionally equivalent to `@ns/core/terminal-escapes` and covers OSC, single-character escapes,
// and CSI sequences.
const TERMINAL_ESCAPE_RE =
	/\x1B(?:\](?:[^\x07\x1B]|\x1B(?!\\))*?(?:\x07|\x1B\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripAnsi(text: string): string {
	return text.replace(TERMINAL_ESCAPE_RE, "");
}

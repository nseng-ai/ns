// Keep this local to clinkr: `@ji/core` currently depends on `@ji/clinkr`, so clinkr cannot
// import the canonical core terminal-escape helper without creating a package cycle. The pattern is
// intentionally equivalent to `@ji/core/terminal-escapes` and covers OSC, single-character escapes,
// and CSI sequences.
const TERMINAL_ESCAPE_RE =
	/\x1B(?:\](?:[^\x07\x1B]|\x1B(?!\\))*?(?:\x07|\x1B\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripAnsi(text: string): string {
	return text.replace(TERMINAL_ESCAPE_RE, "");
}

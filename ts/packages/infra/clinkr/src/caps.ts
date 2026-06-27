// Terminal capability detection for clinkr core. This is the dependency-free foundation the opt-in
// display subpaths (theme/stream) read from; it must not import `ansis`/`log-update` or any display
// module. Detection is split into a pure resolver over an injected snapshot (`resolveCaps`) and a
// thin process reader (`readProcessCapsEnv`) so the decision logic is testable without touching the
// real `process`.

export type ColorDepth = "truecolor" | "ansi256" | "ansi16" | "none";

/** Resolved terminal capabilities a renderer paints against. */
export interface Caps {
	/** Whether stdout is an interactive terminal; streaming renderers may own the cursor when true. */
	isTty: boolean;
	/** Richest color encoding the sink can render, after honoring NO_COLOR / FORCE_COLOR. */
	colorDepth: ColorDepth;
	/** Terminal width in columns; DEFAULT_COLUMNS when the width is unknown. */
	columns: number;
	/** Whether the sink can render non-ASCII glyphs, derived from the locale. */
	unicode: boolean;
}

/** Raw capability signals snapshotted from the environment; the input to resolveCaps. */
export interface CapsEnv {
	isTty: boolean;
	columns: number | undefined;
	env: Readonly<Record<string, string | undefined>>;
}

/** Width assumed when the terminal does not report its own column count. */
export const DEFAULT_COLUMNS = 80;

/** Pure capability decision over a snapshot. Reads no globals, so unit tests inject CapsEnv. */
export function resolveCaps(snapshot: CapsEnv): Caps {
	return {
		isTty: snapshot.isTty,
		colorDepth: resolveColorDepth(snapshot),
		columns: snapshot.columns ?? DEFAULT_COLUMNS,
		unicode: detectUnicode(snapshot.env),
	};
}

/** Snapshot the real `process.*` capability signals; the impure half of detection. */
export function readProcessCapsEnv(): CapsEnv {
	return {
		isTty: process.stdout.isTTY === true,
		columns: process.stdout.columns,
		env: process.env,
	};
}

/** Convenience entry for real runtimes: snapshot the process and resolve in one step. */
export function resolveProcessCaps(): Caps {
	return resolveCaps(readProcessCapsEnv());
}

function resolveColorDepth(snapshot: CapsEnv): ColorDepth {
	const env = snapshot.env;
	// NO_COLOR (defined at any value, even empty) disables color outright; it outranks FORCE_COLOR to
	// stay consistent with clinkr's existing io color detection.
	if (env["NO_COLOR"] !== undefined) return "none";
	const forced = forcedColorDepth(env["FORCE_COLOR"]);
	if (forced !== undefined) return forced;
	// Color is an interactive-terminal affordance: a piped/redirected sink gets none unless forced.
	if (!snapshot.isTty) return "none";
	return terminalColorDepth(env);
}

function forcedColorDepth(value: string | undefined): ColorDepth | undefined {
	if (value === undefined || value === "") return undefined;
	switch (value) {
		case "0":
		case "false":
			return "none";
		case "2":
			return "ansi256";
		case "3":
			return "truecolor";
		// "1", "true", and any other truthy value mean "force color on" at the base 16-color level.
		default:
			return "ansi16";
	}
}

function terminalColorDepth(env: Readonly<Record<string, string | undefined>>): ColorDepth {
	if (env["TERM"] === "dumb") return "none";
	const colorterm = env["COLORTERM"];
	if (colorterm === "truecolor" || colorterm === "24bit") return "truecolor";
	const term = env["TERM"];
	if (term !== undefined && term.includes("256color")) return "ansi256";
	return "ansi16";
}

function detectUnicode(env: Readonly<Record<string, string | undefined>>): boolean {
	// POSIX locale precedence: LC_ALL overrides LC_CTYPE overrides LANG.
	const locale = env["LC_ALL"] ?? env["LC_CTYPE"] ?? env["LANG"];
	// No locale configured: assume a modern UTF-8 terminal rather than degrading to ASCII.
	if (locale === undefined || locale === "") return true;
	return /utf-?8/i.test(locale);
}

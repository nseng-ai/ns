import { resolveProcessCaps, resolveSettledNonInteractiveCaps, type Caps } from "./caps.ts";

export interface ClinkrIo {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	/** Full terminal capabilities for the resolved stdout sink. */
	caps?: Caps;
	/** Whether human renderers may emit ANSI styling. Resolved from the stdout sink caps. */
	canEmitAnsi?: boolean;
}

export function createProcessIo(): ClinkrIo {
	const caps = resolveProcessCaps();
	return {
		stdout: (text) => {
			process.stdout.write(text);
		},
		stderr: (text) => {
			process.stderr.write(text);
		},
		caps,
		canEmitAnsi: caps.colorDepth !== "none",
	};
}

export interface ClinkrIoOverrides {
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	canEmitAnsi?: boolean | undefined;
	caps?: Caps | undefined;
}

/** Process io with per-stream overrides; the seam CLIs hand their deps to. */
export function resolveIo(overrides: ClinkrIoOverrides = {}): ClinkrIo {
	const base = createProcessIo();
	// A caller-supplied stdout is an unknown, redirected sink (tests, pipes), so ANSI output defaults
	// off unless the caller asks for it. With no override we are writing to the real terminal.
	const canEmitAnsi =
		overrides.canEmitAnsi ?? (overrides.stdout === undefined ? base.canEmitAnsi === true : false);
	const caps =
		overrides.caps ??
		(overrides.stdout === undefined
			? base.caps
			: capsForOverrideSink({ env: process.env, canEmitAnsi }));
	return {
		stdout: overrides.stdout ?? base.stdout,
		stderr: overrides.stderr ?? base.stderr,
		...(caps === undefined ? {} : { caps }),
		canEmitAnsi,
	};
}

function capsForOverrideSink(input: {
	env: Readonly<Record<string, string | undefined>>;
	canEmitAnsi: boolean;
}): Caps {
	const settled = resolveSettledNonInteractiveCaps(input.env);
	if (!input.canEmitAnsi) return settled;
	return { ...settled, colorDepth: "ansi16" };
}

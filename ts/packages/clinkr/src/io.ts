export interface ClinkrIo {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	/** Whether human renderers may emit ANSI styling. Resolved from the real stdout sink. */
	canEmitAnsi?: boolean;
}

export function createProcessIo(): ClinkrIo {
	return {
		stdout: (text) => {
			process.stdout.write(text);
		},
		stderr: (text) => {
			process.stderr.write(text);
		},
		canEmitAnsi: resolveProcessColor(),
	};
}

export interface ClinkrIoOverrides {
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	canEmitAnsi?: boolean | undefined;
}

/** Process io with per-stream overrides; the seam CLIs hand their deps to. */
export function resolveIo(overrides: ClinkrIoOverrides = {}): ClinkrIo {
	const base = createProcessIo();
	// A caller-supplied stdout is an unknown, redirected sink (tests, pipes), so ANSI output defaults
	// off unless the caller asks for it. With no override we are writing to the real terminal.
	const canEmitAnsi = overrides.canEmitAnsi ?? (overrides.stdout === undefined ? base.canEmitAnsi === true : false);
	return { stdout: overrides.stdout ?? base.stdout, stderr: overrides.stderr ?? base.stderr, canEmitAnsi };
}

function resolveProcessColor(): boolean {
	const env = process.env;
	if (env["NO_COLOR"] !== undefined) return false;
	const forceColor = env["FORCE_COLOR"];
	if (forceColor !== undefined && forceColor !== "" && forceColor !== "0") return true;
	return process.stdout.isTTY === true;
}

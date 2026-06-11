export interface ClinkrIo {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export function createProcessIo(): ClinkrIo {
	return {
		stdout: (text) => {
			process.stdout.write(text);
		},
		stderr: (text) => {
			process.stderr.write(text);
		},
	};
}

export interface ClinkrIoOverrides {
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
}

/** Process io with per-stream overrides; the seam CLIs hand their deps to. */
export function resolveIo(overrides: ClinkrIoOverrides = {}): ClinkrIo {
	const base = createProcessIo();
	return { stdout: overrides.stdout ?? base.stdout, stderr: overrides.stderr ?? base.stderr };
}

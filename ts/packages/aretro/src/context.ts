export interface AretroCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export function createRealAretroContext(
	options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {},
): AretroCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	return { cwd, env };
}

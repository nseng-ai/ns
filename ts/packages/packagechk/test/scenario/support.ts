import { runCli, type CliDeps } from "../../src/cli.ts";

export interface CliRun {
	code: number;
	stdout: string;
	stderr: string;
}

export async function runPackagechk(args: readonly string[], deps: CliDeps = {}): Promise<CliRun> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const code = await runCli(args, {
		...deps,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

import type { ExecGateway } from "./exec-gateway.ts";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export interface LoadGhCommandOptions {
	pi: ExecGateway;
	args: string[];
	cwd: string;
	timeoutMs: number;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	shouldAllowNonZeroWithStdout?: boolean;
}

export type LoadGhCommandResult =
	| { type: "loaded"; stdout: string; stderr: string; code: number }
	| { type: "failed"; detail: string };

export async function loadGhCommand(options: LoadGhCommandOptions): Promise<LoadGhCommandResult> {
	const result = await options.pi.exec("gh", options.args, {
		cwd: options.cwd,
		timeout: options.timeoutMs,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	const stdout = result.stdout.trim();
	if (result.killed) return { type: "failed", detail: "command timed out" };
	if (result.code !== 0 && (options.shouldAllowNonZeroWithStdout !== true || stdout.length === 0)) {
		return { type: "failed", detail: result.stderr.trim() || `exit code ${result.code}` };
	}
	return { type: "loaded", stdout: result.stdout, stderr: result.stderr, code: result.code };
}

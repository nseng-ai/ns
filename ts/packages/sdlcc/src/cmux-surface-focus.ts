import { runRealCommand, type CommandOutput, type CommandRunner } from "./command-runner.ts";

const COMMAND_TIMEOUT_MS = 10_000;

export interface CmuxSurfaceFocusTarget {
	readonly windowRef: string;
	readonly workspaceRef: string;
	readonly surfaceRef: string;
}

export interface FocusCmuxSurfaceOptions {
	readonly cwd?: string | undefined;
	readonly runCommand?: CommandRunner | undefined;
	readonly target: CmuxSurfaceFocusTarget;
	readonly timeout?: number | undefined;
}

export type FocusCmuxSurfaceResult =
	| { readonly type: "focused" }
	| { readonly type: "failed"; readonly message: string };

export async function focusCmuxSurface(options: FocusCmuxSurfaceOptions): Promise<FocusCmuxSurfaceResult> {
	const cwd = options.cwd ?? process.cwd();
	const runCommand = options.runCommand ?? runRealCommand;
	const params = JSON.stringify({
		surface_id: options.target.surfaceRef,
		workspace_id: options.target.workspaceRef,
		window_id: options.target.windowRef,
	});
	const result = await runCommand("cmux", ["rpc", "surface.focus", params], { cwd, timeout: options.timeout ?? COMMAND_TIMEOUT_MS });
	if (result.code === 0) return { type: "focused" };
	return { type: "failed", message: commandFailureMessage("cmux rpc surface.focus", result) };
}

function commandFailureMessage(commandName: string, result: CommandOutput): string {
	return `${commandName} failed with exit code ${result.code}. stdout: ${result.stdout.trim() || "(empty)"} stderr: ${result.stderr.trim() || "(empty)"}`;
}

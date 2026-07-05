/**
 * The stack-view exec seam. Every downstream stack-view module takes a
 * `CommandExecApi` by injection so it can be faked in tests; this module builds
 * that seam from the Pi extension host's `exec` and re-exports the exec types
 * the rest of stack-view codes against. Keep it dependency-light.
 */
import {
	piExecApiToCommandExecApi,
	type CommandExecApi,
	type PiExecApiLike,
} from "@nseng-ai/foundation/exec";

export type {
	CommandExecApi,
	ExecOptions,
	ExecResult,
	PiExecApiLike,
} from "@nseng-ai/foundation/exec";

/** Shared exec context threaded through stack-view I/O helpers. */
export interface StackViewExecContext {
	execApi: CommandExecApi;
	cwd: string;
}

/** Adapt the Pi host `exec` into the `CommandExecApi` gateway for stack-view. */
export function stackViewExecApi(pi: PiExecApiLike): CommandExecApi {
	return piExecApiToCommandExecApi(pi);
}

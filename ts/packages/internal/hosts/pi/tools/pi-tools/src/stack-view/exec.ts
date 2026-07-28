/**
 * The stack-view exec seam. Downstream modules depend on the foundation command
 * gateway so tests can inject complete typed command results.
 */
import type { CommandExecApi } from "@nseng-ai/ns-foundation/exec";

export type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/ns-foundation/exec";

/** Shared exec context threaded through stack-view I/O helpers. */
export interface StackViewExecContext {
	execApi: CommandExecApi;
	cwd: string;
}

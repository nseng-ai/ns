import type { ExecOptions, ExecResult } from "@ns/core/exec";

export type { ExecOptions, ExecResult } from "@ns/core/exec";

export interface ExecGateway {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

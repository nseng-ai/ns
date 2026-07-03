import type { ExecOptions, ExecResult } from "@ji/core/exec";

export type { ExecOptions, ExecResult } from "@ji/core/exec";

export interface ExecGateway {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

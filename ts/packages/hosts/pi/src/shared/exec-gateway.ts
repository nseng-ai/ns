import type { ExecOptions, ExecResult } from "@sdl/core/exec";

export type { ExecOptions, ExecResult } from "@sdl/core/exec";

export interface ExecGateway {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

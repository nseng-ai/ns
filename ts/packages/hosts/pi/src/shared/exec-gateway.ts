import type { ExecOptions, ExecResult } from "@sdl/exec";

export type { ExecOptions, ExecResult } from "@sdl/exec";

export interface ExecGateway {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

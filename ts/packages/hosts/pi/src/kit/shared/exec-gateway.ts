import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

export type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

export interface ExecGateway {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

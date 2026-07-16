import type {
	CommandExecApi,
	CommandRunner,
	ExecOptions,
	ExecResult,
} from "@nseng-ai/foundation/exec";

export interface RecordedCommand {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: ExecOptions;
}

export function exited(
	overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {},
): ExecResult {
	return { type: "exited", stdout: "", stderr: "", code: 0, signal: null, ...overrides };
}

/** Shared low-level command test support for dispatch-owned adapters and Foundation Git. */
export class ScriptedCommandRunner implements CommandExecApi {
	readonly calls: RecordedCommand[] = [];
	private readonly responses: readonly ExecResult[];
	private nextResponse = 0;

	constructor(responses: readonly ExecResult[]) {
		this.responses = responses;
	}

	readonly run: CommandRunner = async (command, args, options = {}) => {
		return await this.exec(command, [...args], options);
	};

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options: { ...options } });
		const response = this.responses[this.nextResponse] ?? this.responses.at(-1) ?? exited();
		this.nextResponse += 1;
		return response;
	}
}

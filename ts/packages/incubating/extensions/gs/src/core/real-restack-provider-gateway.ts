import {
	commandSucceeded,
	formatCommand,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";

import type {
	GsProviderDiagnostic,
	GsProviderResult,
	GsRestackProviderGateway,
} from "./restack-provider.ts";

const DIAGNOSTIC_MAX_CHARS = 1_000;
export const GS_RESTACK_COMMAND_ENV = {
	GH_PROMPT_DISABLED: "1",
	GIT_TERMINAL_PROMPT: "0",
	GIT_EDITOR: "true",
	GIT_SEQUENCE_EDITOR: "true",
} as const;

export class RealGsRestackProviderGateway implements GsRestackProviderGateway {
	private readonly commands: CommandExecApi;
	private readonly cwd: string;

	constructor(commands: CommandExecApi, cwd: string) {
		this.commands = commands;
		this.cwd = cwd;
	}

	async readVersion(): Promise<GsProviderResult<string>> {
		const args = ["stack", "--version"];
		const result = await this.run(args);
		if (!result.ok) return result;
		const match = /^gh stack version (\S+)$/u.exec(result.value.stdout.trim());
		if (match === null || match[1] === undefined) {
			return { ok: false, diagnostic: buildDiagnostic(args, result.value, "unsupported-output") };
		}
		return { ok: true, value: match[1] };
	}

	async start(scope: "full" | "downstack"): Promise<GsProviderResult<null>> {
		const args = ["stack", "rebase", "--no-trunk"];
		if (scope === "downstack") args.push("--downstack");
		const result = await this.run(args);
		return result.ok ? { ok: true, value: null } : result;
	}

	async continue(): Promise<GsProviderResult<null>> {
		const result = await this.run(["stack", "rebase", "--continue"]);
		return result.ok ? { ok: true, value: null } : result;
	}

	private async run(args: string[]): Promise<GsProviderResult<ExecResult>> {
		const result = await this.commands.exec("gh", args, {
			cwd: this.cwd,
			env: GS_RESTACK_COMMAND_ENV,
		});
		return commandSucceeded(result)
			? { ok: true, value: result }
			: { ok: false, diagnostic: buildDiagnostic(args, result) };
	}
}

function buildDiagnostic(
	args: readonly string[],
	result: ExecResult,
	termination?: string,
): GsProviderDiagnostic {
	return {
		command: formatCommand("gh", args),
		termination: termination ?? terminationOf(result),
		stdout: bound(result.stdout),
		stderr: bound(result.stderr),
	};
}

function terminationOf(result: ExecResult): string {
	if (result.type === "spawn-failed") return "spawn-failed";
	if (result.type === "exited") return `exit-${String(result.code)}`;
	return result.type;
}

function bound(value: string): string {
	return truncateTextHead({
		value,
		maxChars: DIAGNOSTIC_MAX_CHARS,
		buildMarker: (omittedChars) => `… [omitted ${omittedChars} chars]`,
	});
}

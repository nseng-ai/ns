import {
	commandSucceeded,
	formatCommand,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";
import { z } from "zod";

import type {
	GsCommandDiagnostic,
	GsProviderResult,
	GsProviderTopology,
	GsStackProviderGateway,
} from "./stack-provider.ts";

const MAX_DIAGNOSTIC_CHARS = 1_000;
export const GS_NONINTERACTIVE_ENV = {
	GH_PROMPT_DISABLED: "1",
	GIT_TERMINAL_PROMPT: "0",
	GIT_EDITOR: "true",
	GIT_SEQUENCE_EDITOR: "true",
} as const;

const topologySchema = z.looseObject({
	trunk: z.string().min(1),
	currentBranch: z.string().min(1),
	branches: z.array(
		z.looseObject({
			name: z.string().min(1),
			base: z.string().min(1),
			needsRebase: z.boolean(),
			isCurrent: z.boolean(),
		}),
	),
});

export class RealGsStackProviderGateway implements GsStackProviderGateway {
	private readonly commands: CommandExecApi;
	private readonly cwd: string;

	constructor(commands: CommandExecApi, cwd: string) {
		this.commands = commands;
		this.cwd = cwd;
	}

	async readVersion(): Promise<GsProviderResult<string>> {
		const result = await this.run(["stack", "--version"]);
		if (!result.ok) return result;
		const match = /^gh stack version (\S+)$/u.exec(result.value.stdout.trim());
		if (match === null) return this.protocolFailure(["stack", "--version"], result.value);
		return { ok: true, value: match[1] ?? "" };
	}

	async readTopology(): Promise<GsProviderResult<GsProviderTopology>> {
		const args = ["stack", "view", "--json"];
		const result = await this.run(args);
		if (!result.ok) return result;
		let raw: unknown;
		try {
			raw = JSON.parse(result.value.stdout);
		} catch {
			return this.protocolFailure(args, result.value);
		}
		const parsed = topologySchema.safeParse(raw);
		if (!parsed.success) return this.protocolFailure(args, result.value);
		return {
			ok: true,
			value: {
				trunk: parsed.data.trunk,
				currentBranch: parsed.data.currentBranch,
				branches: parsed.data.branches.map((branch) => ({
					name: branch.name,
					base: branch.base,
					needsRebase: branch.needsRebase,
					isCurrent: branch.isCurrent,
				})),
			},
		};
	}

	async startRestack(scope: "full" | "downstack"): Promise<GsProviderResult<null>> {
		const args = ["stack", "rebase", "--no-trunk"];
		if (scope === "downstack") args.push("--downstack");
		const result = await this.run(args);
		return result.ok ? { ok: true, value: null } : result;
	}

	async continueRestack(): Promise<GsProviderResult<null>> {
		const result = await this.run(["stack", "rebase", "--continue"]);
		return result.ok ? { ok: true, value: null } : result;
	}

	private async run(args: string[]): Promise<GsProviderResult<ExecResult>> {
		const result = await this.commands.exec("gh", args, {
			cwd: this.cwd,
			env: GS_NONINTERACTIVE_ENV,
		});
		if (commandSucceeded(result)) return { ok: true, value: result };
		return { ok: false, error: diagnostic(args, result) };
	}

	private protocolFailure(args: string[], result: ExecResult): GsProviderResult<never> {
		return { ok: false, error: diagnostic(args, result, "unsupported-output") };
	}
}

function diagnostic(
	args: readonly string[],
	result: ExecResult,
	termination?: string,
): GsCommandDiagnostic {
	return {
		command: formatCommand("gh", args),
		termination: termination ?? terminationOf(result),
		stdout: bounded(result.stdout),
		stderr: bounded(result.stderr),
	};
}

function terminationOf(result: ExecResult): string {
	if (result.type === "spawn-failed") return `spawn-failed: ${result.error}`;
	return result.type === "exited" ? `exit-${String(result.code)}` : result.type;
}

function bounded(value: string): string {
	return truncateTextHead({
		value,
		maxChars: MAX_DIAGNOSTIC_CHARS,
		buildMarker: (omittedChars) => `… [omitted ${omittedChars} chars]`,
	});
}

import { z } from "zod";

import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { formatCommand } from "@nseng-ai/foundation/exec";

const nonEmptyBranchNameSchema = z.string().trim().min(1);
const stackBranchSchema = z
	.object({
		name: nonEmptyBranchNameSchema.optional(),
		branch: nonEmptyBranchNameSchema.optional(),
	})
	.passthrough()
	.refine((value) => value.name !== undefined || value.branch !== undefined, {
		message: "Each branch entry must contain a non-empty name or branch.",
	})
	.transform((value) => value.name ?? value.branch ?? "");
const stackViewSchema = z
	.object({
		trunk: z.string().optional(),
		currentBranch: z.string().optional(),
		branches: z.array(stackBranchSchema).optional(),
	})
	.passthrough();

export interface GsErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type GsStackInspection =
	| { type: "stacked"; currentBranch: string; orderedBranches: readonly string[] }
	| { type: "unstacked" };
export type GsResult<T> = { ok: true; value: T } | { ok: false; error: GsErrorInfo };
export type GsOperationResult = { ok: true } | { ok: false; error: GsErrorInfo };

export interface GsConsumerGateway {
	inspectLocalStack(options: {
		cwd: string;
		signal?: AbortSignal;
	}): Promise<GsResult<GsStackInspection>>;
	addAboveCurrentStack(options: {
		cwd: string;
		targetBranch: string;
		signal?: AbortSignal;
	}): Promise<GsOperationResult>;
	initializeStack(options: {
		cwd: string;
		trunkBranch: string;
		branches: readonly string[];
		signal?: AbortSignal;
	}): Promise<GsOperationResult>;
}

export class RealGsConsumerGateway implements GsConsumerGateway {
	private readonly commands: CommandExecApi;

	constructor(commands: CommandExecApi) {
		this.commands = commands;
	}

	async inspectLocalStack(options: {
		cwd: string;
		signal?: AbortSignal;
	}): Promise<GsResult<GsStackInspection>> {
		const args = ["stack", "view", "--json"];
		const result = await this.commands.exec("gh", args, options);
		if (result.type !== "exited")
			return { ok: false, error: lifecycleFailure(result.type, result.stderr, args) };
		if (result.code === 2) return { ok: true, value: { type: "unstacked" } };
		if (result.code !== 0)
			return { ok: false, error: classifyFailure(result.code ?? 1, result.stderr, args) };
		const parsedJson = parseJson(result.stdout);
		if (!parsedJson.ok) return parsedJson;
		const parsed = stackViewSchema.safeParse(parsedJson.value);
		if (!parsed.success) {
			return {
				ok: false,
				error: {
					code: "gs-view-malformed",
					message: `gh stack view --json returned malformed topology: ${z.prettifyError(parsed.error)}`,
					displayCommand: formatCommand("gh", args),
				},
			};
		}
		const branches = parsed.data.branches ?? [];
		const currentBranch = parsed.data.currentBranch;
		if (currentBranch === undefined || branches.length === 0 || !branches.includes(currentBranch)) {
			return {
				ok: false,
				error: {
					code: "gs-topology-ambiguous",
					message:
						"GitHub Stacks reported success but did not identify the current branch in one ordered local stack; refusing to choose a mutation.",
					displayCommand: formatCommand("gh", args),
				},
			};
		}
		return {
			ok: true,
			value: { type: "stacked", currentBranch, orderedBranches: branches },
		};
	}

	async addAboveCurrentStack(options: {
		cwd: string;
		targetBranch: string;
		signal?: AbortSignal;
	}): Promise<GsOperationResult> {
		return this.run(["stack", "add", options.targetBranch], options);
	}

	async initializeStack(options: {
		cwd: string;
		trunkBranch: string;
		branches: readonly string[];
		signal?: AbortSignal;
	}): Promise<GsOperationResult> {
		return this.run(["stack", "init", "--base", options.trunkBranch, ...options.branches], options);
	}

	private async run(
		args: string[],
		options: { cwd: string; signal?: AbortSignal },
	): Promise<GsOperationResult> {
		const result = await this.commands.exec("gh", args, options);
		if (result.type !== "exited")
			return { ok: false, error: lifecycleFailure(result.type, result.stderr, args) };
		if (result.code === 0) return { ok: true };
		return { ok: false, error: classifyFailure(result.code ?? 1, result.stderr, args) };
	}
}

function parseJson(value: string): GsResult<unknown> {
	try {
		return { ok: true, value: JSON.parse(value) };
	} catch {
		return {
			ok: false,
			error: {
				code: "gs-view-malformed-json",
				message:
					"gh stack view --json returned invalid JSON; update or repair the gh-stack extension.",
				displayCommand: formatCommand("gh", ["stack", "view", "--json"]),
			},
		};
	}
}

function lifecycleFailure(type: string, stderr: string, args: string[]): GsErrorInfo {
	return {
		code: `gs-command-${type}`,
		message: `gh-stack did not exit normally (${type}).${stderr.trim().length === 0 ? "" : `\nProvider output: ${stderr.trim()}`}`,
		displayCommand: formatCommand("gh", args),
	};
}

function classifyFailure(exitCode: number, stderr: string, args: string[]): GsErrorInfo {
	const guidance: Readonly<Record<number, { code: string; guidance: string }>> = {
		2: { code: "gs-not-in-stack", guidance: "The current branch is not in a local GitHub Stack." },
		4: {
			code: "gs-github-api-failed",
			guidance: "GitHub API access failed; check authentication and connectivity.",
		},
		5: {
			code: "gs-invalid-arguments",
			guidance: "gh-stack rejected the explicit branch arguments.",
		},
		6: {
			code: "gs-disambiguation-required",
			guidance: "gh-stack requires disambiguation; inspect local stack state before retrying.",
		},
		8: {
			code: "gs-metadata-locked",
			guidance: "GitHub Stacks metadata is locked; finish or recover the other operation first.",
		},
		9: {
			code: "gs-unavailable",
			guidance: "Stacked pull requests are unavailable for this repository or account.",
		},
	};
	const known = guidance[exitCode];
	const detail = stderr.trim();
	return {
		code: known?.code ?? "gs-command-failed",
		message: [
			known?.guidance ?? `gh-stack failed with exit code ${exitCode}.`,
			...(detail.length === 0 ? [] : [`Provider output: ${detail}`]),
		].join("\n"),
		displayCommand: formatCommand("gh", args),
	};
}

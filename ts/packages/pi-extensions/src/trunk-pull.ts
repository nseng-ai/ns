import {
	formatCommand,
	formatCommandFailure,
	formatOutputSection,
	isSuccessfulExecResult,
	type ExecResult as CoreExecResult,
} from "@asdl/core/exec";
import { planLocalBranchRefreshFromWorktrees } from "@asdl/core/git";

import { definePiSurfaceParity } from "./parity.ts";

const COMMAND_NAME = "sdl:code:pull-trunk";
const GT_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 2 * 60 * 1000;

export const trunkPullParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: COMMAND_NAME,
		workflow: "Pull the configured Graphite trunk branch without running full gt sync",
		parity: "PARTIAL",
		trackedGap:
			"cross-harness-parity roadmap: decide whether non-Pi agents need a skill wrapper for the narrow trunk pull workflow or can run the displayed git command directly.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "trunk-pull",
		notes:
			"Pi command resolves gt trunk, then pulls the checked-out trunk worktree or fetches only that remote branch into the matching local branch so users can refresh main/master/trunk before restacking without full gt sync.",
	},
] as const);

type NotifyLevel = "info" | "warning" | "error";

export type ExecResult = CoreExecResult;

export interface CommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

export default function trunkPullExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Pull Graphite trunk without running full gt sync",
		handler: async (args, ctx) => {
			await runTrunkPull(pi, ctx, args);
		},
	});
}

export async function runTrunkPull(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: CommandContext,
	args: string,
): Promise<boolean> {
	if (args.trim().length > 0) {
		ctx.ui.notify(
			"`/sdl:code:pull-trunk` does not accept arguments. Run it with no text after the command.",
			"error",
		);
		return false;
	}

	await ctx.waitForIdle();

	const trunkResult = await pi.exec("gt", ["trunk", "--no-interactive"], {
		cwd: ctx.cwd,
		timeout: GT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(trunkResult)) {
		ctx.ui.notify(
			formatCommandFailure(
				"Could not resolve Graphite trunk. Local trunk was not updated.",
				"gt trunk --no-interactive",
				trunkResult,
			),
			"error",
		);
		return false;
	}

	const trunk = firstNonEmptyLine(trunkResult.stdout);
	if (trunk === undefined) {
		ctx.ui.notify(
			"gt trunk --no-interactive returned no branch. Local trunk was not updated.",
			"error",
		);
		return false;
	}

	const planResult = await planTrunkPull(pi, ctx.cwd, trunk);
	if (!planResult.ok) {
		ctx.ui.notify(planResult.message, "error");
		return false;
	}

	const updateResult = await pi.exec("git", planResult.args, {
		cwd: planResult.cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(updateResult)) {
		ctx.ui.notify(
			formatCommandFailure(
				`Could not update local trunk branch \`${trunk}\`.`,
				formatCommand("git", planResult.args),
				updateResult,
			),
			"error",
		);
		return false;
	}

	ctx.ui.notify(
		formatSuccess({ trunk, result: updateResult, args: planResult.args, cwd: planResult.cwd }),
		"info",
	);
	return true;
}

async function planTrunkPull(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	trunk: string,
): Promise<{ ok: true; args: string[]; cwd: string } | { ok: false; message: string }> {
	const worktreeResult = await pi.exec("git", ["worktree", "list", "--porcelain"], {
		cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(worktreeResult)) {
		return {
			ok: false,
			message: formatCommandFailure(
				"Could not inspect Git worktrees. Local trunk was not updated.",
				"git worktree list --porcelain",
				worktreeResult,
			),
		};
	}

	const plan = planLocalBranchRefreshFromWorktrees({
		branch: trunk,
		cwd,
		worktreePorcelain: worktreeResult.stdout,
	});
	return { ok: true, args: plan.args, cwd: plan.cwd };
}

function firstNonEmptyLine(text: string): string | undefined {
	return text
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

interface FormatSuccessOptions {
	trunk: string;
	args: readonly string[];
	cwd: string;
	result: ExecResult;
}

function formatSuccess(options: FormatSuccessOptions): string {
	return [
		`Pulled local Graphite trunk branch \`${options.trunk}\` only.`,
		"No full `gt sync` was run.",
		`Command: ${formatCommand("git", options.args)}`,
		`Cwd: ${options.cwd}`,
		formatOutputSection("stdout", options.result.stdout, { maxChars: 4_000, maxLines: 80 }),
		formatOutputSection("stderr", options.result.stderr, { maxChars: 4_000, maxLines: 80 }),
	].join("\n");
}

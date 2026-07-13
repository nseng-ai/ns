// `ns dispatch prompt` — dispatch a raw prompt as the remote unit of work
// (README "Commands → /ns:dispatch:prompt"; the Pi command is a thin
// mirror of this kernel CLI). Tier 1: the command's whole purpose is the
// scoped, reversible anchor mutation (a new `dispatch/` branch and its
// PR), so no confirmation flag gates it; every refusal happens before the
// first mutation. Live end-to-end behavior is pending verification.
import { createNsDomainCommand } from "@nseng-ai/capability-kit/ns-command";
import {
	failure,
	negative,
	ok,
	usageError,
	z,
	type CommandExit,
	type NsCommand,
} from "@nseng-ai/sdk";

import { DISPATCH_PROMPT_MAX_LENGTH } from "../../dispatch/dispatch-run.ts";
import { executeDispatchPrompt, type DispatchPreflightCheck } from "../dispatch-prompt/core.ts";
import {
	createDispatchPromptContext,
	type DispatchPromptCliContext,
} from "../dispatch-prompt/context.ts";

const DIRTY_PATHS_RENDER_LIMIT = 20;
/** Machine-envelope bound on the dirty-path list (ADR 0012: command-local). */
const DIRTY_PATHS_DATA_LIMIT = 100;

const dispatchPromptRequestSchema = z.object({
	prompt: z
		.string()
		.min(1)
		.max(DISPATCH_PROMPT_MAX_LENGTH)
		.describe("The prompt the remote agent executes against your branch head."),
});

const dispatchPromptResultSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("dispatched"),
		revision: z.string(),
		sourceBranch: z.string(),
		sourcePushed: z.boolean(),
		anchorBranch: z.string(),
		anchorPrNumber: z.number().int(),
		anchorPrUrl: z.string(),
		runId: z.string(),
	}),
	z.object({
		status: z.literal("dirty-tree"),
		/** First entries up to a command-local bound; see totalDirtyPaths. */
		dirtyPaths: z.array(z.string()),
		/** Total dirty paths found, including any beyond the bound. */
		totalDirtyPaths: z.number().int(),
	}),
]);

type DispatchPromptCommandResult = z.infer<typeof dispatchPromptResultSchema>;

export const dispatchPromptCommand: NsCommand = createNsDomainCommand({
	name: "prompt",
	summary: "Dispatch a prompt to run remotely against your branch head.",
	description:
		"Dispatch a raw prompt as a remote unit of work. Requires a clean worktree; pushes your current branch first when the remote is missing or behind, pushes a new dispatch/ anchor branch at your exact head commit, opens the anchor pull request up front on your own credentials, starts the dispatch workflow through the configured deployment, and stamps the workflow run id on the anchor PR. Results land on the anchor PR when the run completes. The execution backend comes from the repo-root ns.toml [dispatch] table.",
	schema: dispatchPromptRequestSchema,
	resultSchema: dispatchPromptResultSchema,
	positionals: { prompt: { position: 0 } },
	createContext: createDispatchPromptContext,
	handler: runDispatchPromptCommand,
	renderHuman: renderDispatchPromptResult,
});

export default dispatchPromptCommand;

async function runDispatchPromptCommand(
	ctx: DispatchPromptCliContext,
	request: z.output<typeof dispatchPromptRequestSchema>,
): Promise<CommandExit<DispatchPromptCommandResult>> {
	if (request.prompt.trim().length === 0) {
		return usageError("The dispatch prompt must not be blank.", { argument: "prompt" });
	}

	const outcome = await executeDispatchPrompt(
		{ cwd: ctx.cwd, prompt: request.prompt },
		ctx.gateways,
	);
	switch (outcome.status) {
		case "dispatched":
			return ok({
				status: outcome.status,
				revision: outcome.revision,
				sourceBranch: outcome.sourceBranch,
				sourcePushed: outcome.sourcePushed,
				anchorBranch: outcome.anchorPr.branch,
				anchorPrNumber: outcome.anchorPr.number,
				anchorPrUrl: outcome.anchorPr.url,
				runId: outcome.runId,
			});
		case "dirty-tree":
			return negative(renderDirtyTreeRefusal(outcome.dirtyPaths), {
				data: {
					status: "dirty-tree",
					dirtyPaths: outcome.dirtyPaths.slice(0, DIRTY_PATHS_DATA_LIMIT),
					totalDirtyPaths: outcome.dirtyPaths.length,
				},
			});
		case "preflight-failed":
			return failure("preflight-failed", renderPreflightFailure(outcome.checks), {
				checks: outcome.checks,
			});
		case "source-unusable":
			return failure(outcome.code, outcome.message);
		case "source-push-failed":
			return failure(
				"source-push-failed",
				`${outcome.message}\nNothing was dispatched. Bring the branch and its remote in sync (for Graphite-tracked branches, ns flow submit), then dispatch again.`,
				{ sourceBranch: outcome.sourceBranch },
			);
		case "anchor-push-failed":
			return failure(
				"anchor-push-failed",
				`${outcome.message}\nNothing was dispatched and no PR was opened.`,
				{ anchorBranch: outcome.anchorBranch },
			);
		case "anchor-pr-failed":
			return failure(
				"anchor-pr-failed",
				`${outcome.message}\nThe anchor branch ${outcome.anchorBranch} was pushed but no run was started; delete the remote branch or retry the dispatch.`,
				{ anchorBranch: outcome.anchorBranch },
			);
		case "trigger-failed":
			return failure(
				"trigger-failed",
				`${outcome.message}\nThe anchor PR ${outcome.anchorPr.url} is open but no run was started; re-dispatch or close it.`,
				{
					code: outcome.code,
					anchorBranch: outcome.anchorPr.branch,
					anchorPrNumber: outcome.anchorPr.number,
					anchorPrUrl: outcome.anchorPr.url,
				},
			);
		case "run-id-stamp-failed":
			return failure(
				"run-id-stamp-failed",
				`${outcome.message}\nThe run was started${outcome.runId === undefined ? "" : ` (run id ${outcome.runId})`} but the anchor PR ${outcome.anchorPr.url} carries no run-id stamp; record the run id on the PR manually.`,
				{
					anchorBranch: outcome.anchorPr.branch,
					anchorPrNumber: outcome.anchorPr.number,
					anchorPrUrl: outcome.anchorPr.url,
					...(outcome.runId === undefined ? {} : { runId: outcome.runId }),
				},
			);
	}
}

function renderDispatchPromptResult(data: DispatchPromptCommandResult): string {
	if (data.status === "dirty-tree") return renderDirtyTreeRefusal(data.dirtyPaths);
	const lines = [
		"Dispatched. The run executes remotely; results land on the anchor PR.",
		"",
		`  Anchor PR:     ${data.anchorPrUrl}`,
		`  Anchor branch: ${data.anchorBranch}`,
		`  Revision:      ${data.revision}`,
		`  Workflow run:  ${data.runId}`,
	];
	if (data.sourcePushed) {
		lines.push(
			"",
			`Pushed ${data.sourceBranch} first so the dispatched head is remotely reachable.`,
		);
	}
	return `${lines.join("\n")}\n`;
}

function renderDirtyTreeRefusal(dirtyPaths: readonly string[]): string {
	const shown = dirtyPaths.slice(0, DIRTY_PATHS_RENDER_LIMIT);
	const rest = dirtyPaths.length - shown.length;
	return [
		"Dispatch refused: the worktree has uncommitted changes, so what runs remotely would not match what you see.",
		"",
		...shown.map((path) => `  ${path}`),
		...(rest > 0 ? [`  … and ${rest} more`] : []),
		"",
		"Commit (or stash) the changes and dispatch again.",
	].join("\n");
}

function renderPreflightFailure(checks: readonly DispatchPreflightCheck[]): string {
	return [
		"Dispatch preflight failed; nothing was pushed, opened, or started.",
		"",
		...checks.map(
			(check) => `  [${check.status === "ok" ? "ok" : "failed"}] ${check.id}: ${check.detail}`,
		),
	].join("\n");
}

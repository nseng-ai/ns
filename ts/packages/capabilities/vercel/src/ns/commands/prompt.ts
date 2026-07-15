// `ns dispatch prompt` — dispatch a raw prompt as the remote unit of work
// (README "Commands → /ns:dispatch:prompt"; the Pi command is a thin
// mirror of this kernel CLI). The anchor remains Tier 1, while stale
// Graphite source publication is conditionally Tier 3 because its computed
// branch scope may restack history and update multiple PRs. `--force/-f`
// authorizes that scope only; Graphite safeguards remain enabled. Live
// end-to-end behavior is pending verification.
import { createNsDomainCommand } from "@nseng-ai/capability-kit/ns-command";
import {
	failure,
	negative,
	ok,
	usageError,
	z,
	type CommandExit,
	type NsCommand,
	type NsExtensionApi,
} from "@nseng-ai/sdk";

import { DISPATCH_PROMPT_MAX_CHARS } from "../../dispatch/dispatch-run.ts";
import {
	executeDispatchPrompt,
	type DispatchPreflightCheck,
	type DispatchPromptOutcome,
} from "../../dispatch-client/core.ts";
import {
	createDispatchPromptContext,
	type DispatchPromptCliContext,
} from "../../dispatch-client/context.ts";

const DIRTY_PATHS_RENDER_MAX_PATHS = 20;
/** Machine-envelope bound on path and publication-scope lists (ADR 0012: command-local). */
const DIRTY_PATHS_DATA_MAX_PATHS = 100;
const PUBLICATION_BRANCHES_DATA_MAX = 50;

const dispatchPromptRequestSchema = z.object({
	prompt: z
		.string()
		.min(1)
		.max(DISPATCH_PROMPT_MAX_CHARS)
		.describe("The prompt the remote agent executes against your branch head."),
	slug: z
		.string()
		.optional()
		.describe(
			"Semantic anchor slug override. The dispatch/ prefix, timestamp, and collision suffix remain automatic.",
		),
	force: z
		.boolean()
		.default(false)
		.describe(
			"Authorize the computed Graphite source-publication scope non-interactively. Does not bypass Graphite safeguards.",
		),
});

const dispatchPromptResultSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("dispatched"),
		revision: z.string(),
		sourceBranch: z.string(),
		isSourcePushed: z
			.boolean()
			.describe("Compatibility field: false only when sourcePublication is already-current."),
		sourcePublication: z
			.enum(["already-current", "git-pushed", "graphite-submitted"])
			.describe(
				"How the exact source was published. graphite-submitted requires TTY confirmation or dispatch --force/-f; dispatch authorization is never forwarded as Graphite force and does not bypass Graphite safeguards.",
			),
		anchorBranch: z.string(),
		anchorPrNumber: z.number().int(),
		anchorPrUrl: z.string(),
		runId: z.string(),
		workflowRunUrl: z.string(),
	}),
	z.object({
		status: z.literal("dirty-tree"),
		/** First entries up to a command-local bound; see totalDirtyPaths. */
		dirtyPaths: z.array(z.string()),
		/** Total dirty paths found, including any beyond the bound. */
		totalDirtyPaths: z.number().int(),
	}),
	z.object({
		status: z.literal("source-publication-declined"),
		affectedBranches: z.array(z.string()),
		totalAffectedBranches: z.number().int(),
	}),
]);

type DispatchPromptCommandResult = z.infer<typeof dispatchPromptResultSchema>;
type DispatchPromptSuccess = Extract<DispatchPromptCommandResult, { status: "dispatched" }>;

export function createDispatchPromptCommand(
	createContext: (ctx: NsExtensionApi) => DispatchPromptCliContext = createDispatchPromptContext,
): NsCommand {
	return createNsDomainCommand({
		name: "prompt",
		summary: "Dispatch a prompt to run remotely against your branch head.",
		description:
			"Dispatch a raw prompt as a remote unit of work. Requires a clean worktree and an exactly published source revision. An already-current remote needs no source action. A stale untracked branch is pushed by exact SHA; a stale Graphite-tracked branch is previewed and conditionally Tier-3 authorized before Flow restacks/submits it. In a TTY, confirm the computed Graphite scope; non-interactive callers pass --force/-f. Dispatch force authorizes only that computed mutation and never bypasses Graphite safeguards. After publication, dispatch revalidates repository, branch, HEAD, cleanliness, configuration, identity, and remote tip before creating the semantic dispatch/ anchor and PR, starting the workflow, and stamping its run id. Pass --slug/-s to override only the semantic slug portion. Results land on the anchor PR when the run completes. The execution backend comes from the repo-root ns.toml [dispatch] table.",
		schema: dispatchPromptRequestSchema,
		resultSchema: dispatchPromptResultSchema,
		positionals: { prompt: { position: 0 } },
		options: { slug: { short: "-s" }, force: { short: "-f" } },
		createContext,
		handler: runDispatchPromptCommand,
	});
}

export const dispatchPromptCommand: NsCommand = createDispatchPromptCommand();

export default dispatchPromptCommand;

async function runDispatchPromptCommand(
	ctx: DispatchPromptCliContext,
	request: z.output<typeof dispatchPromptRequestSchema>,
): Promise<CommandExit<DispatchPromptCommandResult>> {
	if (request.prompt.trim().length === 0) {
		return usageError("The dispatch prompt must not be blank.", { argument: "prompt" });
	}

	let outcome: DispatchPromptOutcome;
	try {
		outcome = await executeDispatchPrompt(
			{
				cwd: ctx.cwd,
				prompt: request.prompt,
				...(request.slug === undefined ? {} : { slugOverride: request.slug }),
				force: request.force,
				onPhase: ctx.commandIo.phase,
			},
			ctx.gateways,
		);
	} finally {
		ctx.commandIo.clearPhase();
	}
	switch (outcome.status) {
		case "dispatched": {
			const result: DispatchPromptSuccess = {
				status: outcome.status,
				revision: outcome.revision,
				sourceBranch: outcome.sourceBranch,
				isSourcePushed: outcome.isSourcePushed,
				sourcePublication: outcome.sourcePublication,
				anchorBranch: outcome.anchorPr.branch,
				anchorPrNumber: outcome.anchorPr.number,
				anchorPrUrl: outcome.anchorPr.url,
				runId: outcome.runId,
				workflowRunUrl: outcome.workflowRunUrl,
			};
			return ok(result, { human: renderDispatchPromptResult(result) });
		}
		case "dirty-tree":
			return negative(renderDirtyTreeRefusal(outcome.dirtyPaths), {
				data: {
					status: "dirty-tree",
					dirtyPaths: outcome.dirtyPaths.slice(0, DIRTY_PATHS_DATA_MAX_PATHS),
					totalDirtyPaths: outcome.dirtyPaths.length,
				},
			});
		case "preflight-failed":
			return failure("preflight-failed", renderPreflightFailure(outcome.checks), {
				checks: outcome.checks,
			});
		case "invalid-branch-slug-override":
			return usageError(outcome.message, { argument: "slug" });
		case "branch-slug-generation-failed":
			return failure("branch-slug-generation-failed", outcome.message, {
				recovery: "Pass --slug/-s with an explicit semantic slug and retry.",
			});
		case "anchor-branch-availability-failed":
			return failure(
				"anchor-branch-availability-failed",
				outcome.mutation === undefined
					? `${outcome.message}\nNothing was pushed, opened, or started. Check origin access and retry.`
					: `${outcome.message}\n${renderMutationEvidence(outcome.mutation)} Source publication completed, but no dispatch anchor or run was created.`,
				{
					anchorBranch: outcome.anchorBranch,
					...(outcome.sourcePublication === undefined
						? {}
						: { sourcePublication: outcome.sourcePublication }),
					...(outcome.mutation === undefined
						? {}
						: {
								mutation: outcome.mutation,
								anchorCreated: false,
								runStarted: false,
							}),
					...(outcome.affectedBranches === undefined
						? {}
						: publicationScopeData(outcome.affectedBranches)),
				},
			);
		case "anchor-branch-unavailable":
			return failure(
				"anchor-branch-unavailable",
				outcome.mutation === undefined
					? `All ${outcome.candidateLimit} timestamped anchor names for ${outcome.semanticSlug} already exist on origin. Retry after the clock advances or pass a different --slug/-s override.`
					: `All ${outcome.candidateLimit} timestamped anchor names for ${outcome.semanticSlug} already exist on origin. ${renderMutationEvidence(outcome.mutation)} Source publication completed, but no dispatch anchor or run was created. Retry after the clock advances or pass a different --slug/-s override.`,
				{
					semanticSlug: outcome.semanticSlug,
					candidateLimit: outcome.candidateLimit,
					...(outcome.sourcePublication === undefined
						? {}
						: { sourcePublication: outcome.sourcePublication }),
					...(outcome.mutation === undefined
						? {}
						: {
								mutation: outcome.mutation,
								anchorCreated: false,
								runStarted: false,
							}),
					...(outcome.affectedBranches === undefined
						? {}
						: publicationScopeData(outcome.affectedBranches)),
				},
			);
		case "source-unusable":
			return failure(outcome.code, outcome.message);
		case "source-publication-plan-failed":
			return failure(
				"source-publication-plan-failed",
				`${outcome.message}\nSource publication planning failed closed; no local or remote mutation was requested and no anchor or run was created.`,
				{
					code: outcome.code,
					mutation: outcome.mutation,
					anchorCreated: false,
					runStarted: false,
				},
			);
		case "source-publication-force-required":
			return usageError(
				"Publishing this Graphite source may restack history and update multiple pull requests. Pass --force/-f to authorize the computed scope non-interactively; Graphite safeguards remain enabled.",
				{ missingFlag: "--force", ...publicationScopeData(outcome.affectedBranches) },
			);
		case "source-publication-declined":
			return negative(
				"Graphite source publication was declined. Nothing was mutated, and no dispatch anchor or run was created.",
				{
					data: {
						status: outcome.status,
						...publicationScopeData(outcome.affectedBranches),
					},
				},
			);
		case "source-push-failed":
			return failure(
				"source-push-failed",
				`${outcome.message}\nThe exact-SHA Git push may have published remote state, but no dispatch anchor or run was created. Inspect origin before retrying.`,
				{
					sourceBranch: outcome.sourceBranch,
					mutation: outcome.mutation,
					anchorCreated: false,
					runStarted: false,
				},
			);
		case "graphite-publication-failed":
			return failure(
				"graphite-publication-failed",
				renderPublicationFailure({
					message: outcome.message,
					stage: outcome.stage,
					affectedBranches: outcome.affectedBranches,
					mutation: outcome.mutation,
				}),
				{
					stage: outcome.stage,
					code: outcome.code,
					...publicationScopeData(outcome.affectedBranches),
					mutation: outcome.mutation,
					anchorCreated: false,
					runStarted: false,
				},
			);
		case "source-publication-verification-failed":
			return failure(
				"source-publication-verification-failed",
				`${outcome.message}\n${renderMutationEvidence(outcome.mutation)} Source publication occurred or may have occurred, but no dispatch anchor or run was created.`,
				{
					sourcePublication: outcome.sourcePublication,
					reason: outcome.reason,
					mutation: outcome.mutation,
					anchorCreated: false,
					runStarted: false,
					...(outcome.affectedBranches === undefined
						? {}
						: publicationScopeData(outcome.affectedBranches)),
					...(outcome.checks === undefined ? {} : { checks: outcome.checks }),
					...(outcome.dirtyPaths === undefined
						? {}
						: {
								dirtyPaths: outcome.dirtyPaths.slice(0, DIRTY_PATHS_DATA_MAX_PATHS),
								totalDirtyPaths: outcome.dirtyPaths.length,
							}),
				},
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

function renderDispatchPromptResult(data: DispatchPromptSuccess): string {
	const lines = [
		"Dispatched. The run executes remotely; results land on the anchor PR.",
		"",
		`  Anchor PR:     ${data.anchorPrUrl}`,
		`  Anchor branch: ${data.anchorBranch}`,
		`  Revision:      ${data.revision}`,
		`  Workflow run:  ${data.workflowRunUrl}`,
		`  Run ID:        ${data.runId}`,
	];
	switch (data.sourcePublication) {
		case "already-current":
			lines.push("", `Source ${data.sourceBranch} was already current on origin.`);
			break;
		case "git-pushed":
			lines.push("", `Published ${data.sourceBranch} by exact-SHA Git push.`);
			break;
		case "graphite-submitted":
			lines.push(
				"",
				`Published ${data.sourceBranch} through Graphite with its safeguards enabled.`,
			);
			break;
	}
	return `${lines.join("\n")}\n`;
}

function renderDirtyTreeRefusal(dirtyPaths: readonly string[]): string {
	const shown = dirtyPaths.slice(0, DIRTY_PATHS_RENDER_MAX_PATHS);
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

function publicationScopeData(affectedBranches: readonly string[]) {
	return {
		affectedBranches: affectedBranches.slice(0, PUBLICATION_BRANCHES_DATA_MAX),
		totalAffectedBranches: affectedBranches.length,
	};
}

function renderPublicationFailure(options: {
	readonly message: string;
	readonly stage: string;
	readonly affectedBranches: readonly string[];
	readonly mutation: { readonly local: string; readonly remote: string };
}): string {
	const scope = options.affectedBranches.slice(0, PUBLICATION_BRANCHES_DATA_MAX).join(" → ");
	return `${options.message}\nGraphite source publication failed during ${options.stage} for ${scope}. ${renderMutationEvidence(options.mutation)} No dispatch anchor or run was created.`;
}

function renderMutationEvidence(mutation: {
	readonly local: string;
	readonly remote: string;
}): string {
	return `Local mutation: ${mutation.local}. Remote publication: ${mutation.remote}.`;
}

import { confirmInteractiveOrUsageError, type ClinkrInteraction } from "@nseng-ai/clinkr";
import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";
import { failure, negative, ok, usageError } from "@nseng-ai/sdk";

import {
	GS_AUTOBRANCH_DIAGNOSTIC_MAX_CHARS,
	GS_AUTOBRANCH_EFFECTS_MAX_COUNT,
	GS_AUTOBRANCH_MINIMUM_GH_STACK_VERSION,
	type GsAutobranchContext,
	type GsAutobranchGitFacts,
	type GsAutobranchStackView,
	type GsAutobranchRequest,
	type GsAutobranchResult,
} from "./autobranch-contract.ts";

export {
	GS_AUTOBRANCH_MINIMUM_GH_STACK_VERSION,
	gsAutobranchRequestSchema,
	gsAutobranchResultSchema,
	type GsAutobranchCheckpointGateway,
	type GsAutobranchContext,
	type GsAutobranchGatewayResult,
	type GsAutobranchGitFacts,
	type GsAutobranchGitGateway,
	type GsAutobranchPreparationFacts,
	type GsAutobranchPreparationGateway,
	type GsAutobranchStackGateway,
	type GsAutobranchStackView,
	type GsAutobranchRequest,
	type GsAutobranchResult,
} from "./autobranch-contract.ts";

interface RunPathOptions {
	readonly context: GsAutobranchContext;
	readonly data: GsAutobranchResult;
	readonly before: GsAutobranchGitFacts;
	readonly child: string;
	readonly checkpointMessage: string;
}

export async function runGsAutobranch(
	context: GsAutobranchContext,
	interaction: ClinkrInteraction,
	request: GsAutobranchRequest,
) {
	const version = await context.stack.readVersion();
	if (!version.ok) return failure("autobranch-inspection-failed", version.message, emptyResult());
	const inspected = await context.git.inspect(null);
	if (!inspected.ok)
		return failure("autobranch-inspection-failed", inspected.message, emptyResult(version.value));
	const before = inspected.value;
	let data = resultFrom(before, version.value);
	if (!isSupportedGhStackVersion(version.value)) {
		return negative(`gh-stack ${GS_AUTOBRANCH_MINIMUM_GH_STACK_VERSION} or newer is required.`, {
			data: recover(
				data,
				"install-supported-gh-stack",
				`Install gh-stack ${GS_AUTOBRANCH_MINIMUM_GH_STACK_VERSION} or newer.`,
			),
		});
	}
	if (before.branch === null || before.headSha === null)
		return negative("A named branch with a readable HEAD is required.", {
			data: recover(data, "inspect-worktree", "Check out a named branch, then rerun."),
		});
	if (before.trunk === null || before.trunkSha === null)
		return negative("Cached origin HEAD is required; this command does not fetch.", {
			data: recover(data, "inspect-worktree", "Configure refs/remotes/origin/HEAD, then rerun."),
		});
	if (before.operation !== "none")
		return negative(`Git ${before.operation} is active.`, {
			data: recover(
				data,
				"inspect-worktree",
				"Finish or abort the active Git operation, then rerun.",
			),
		});
	if (before.dirty.total === 0)
		return negative("Pending work is required.", {
			data: recover(data, "inspect-worktree", "Make the intended changes, then rerun."),
		});
	const path = before.branch === before.trunk ? "trunk-bootstrap" : "tracked-top-extension";
	data = { ...data, path };
	if (path === "tracked-top-extension") {
		const view = await context.stack.view();
		if (!view.ok) {
			const observed = recover(
				{ ...data, diagnostic: bound(view.message) },
				"inspect-stack-worktree",
				"Run from the stack worktree that tracks this branch.",
			);
			return view.reason === "untracked"
				? negative("The current branch is not tracked in the invoking stack worktree.", {
						data: observed,
					})
				: failure("autobranch-inspection-failed", view.message, observed);
		}
		data = { ...data, relationship: relationship(view.value, before.branch, null) };
		if (
			!(
				data.relationship.sourceTrackedOnce &&
				data.relationship.sourceCurrent &&
				data.relationship.sourceTopmost
			)
		) {
			return negative("The current branch must be the unique current top in this stack worktree.", {
				data: recover(
					data,
					"inspect-stack-worktree",
					"Check out the invoking stack worktree's tracked top, then rerun.",
				),
			});
		}
	}
	const prepared = await context.preparation.prepare({
		...(request.slug === undefined ? {} : { requestedSlug: request.slug }),
		facts: {
			root: before.root,
			branch: before.branch,
			status: before.status,
			diff: before.diff,
		},
	});
	if (!prepared.ok)
		return failure(
			"autobranch-preparation-failed",
			prepared.message,
			recover(data, "provide-slug", "Provide --slug or correct model configuration, then rerun."),
		);
	const { child, checkpointMessage } = prepared.value;
	data = { ...data, child };
	const valid = await context.git.validateChild(child);
	if (!valid.ok) return failure("autobranch-inspection-failed", valid.message, data);
	if (!valid.value)
		return negative(`Child branch ${child} is invalid or already exists.`, {
			data: recover(data, "provide-slug", "Choose a valid unused --slug, then rerun."),
		});
	const authorized = await authorize(interaction, request, data, checkpointMessage);
	if (authorized !== true) return authorized;
	const options: RunPathOptions = { context, data, before, child, checkpointMessage };
	return path === "trunk-bootstrap" ? await runBootstrap(options) : await runExtension(options);
}

async function runBootstrap(options: RunPathOptions) {
	const { context, data, before, child, checkpointMessage } = options;
	const created = await context.git.createAndSwitchChild(child);
	let effects = created.ok ? [`created-and-switched:${child}`] : [];
	let observed = await context.git.inspect(child, before.branch!);
	if (!observed.ok)
		return ambiguous(data, effects, created.ok ? observed.message : created.message);
	if (!created.ok) return partial(data, observed.value, effects, created.message);
	const transfer = proveBranchTransfer(before, observed.value, child);
	if (transfer.status === "unproven")
		return partial(data, observed.value, effects, transfer.diagnostic);
	const committed = await context.checkpoint.commit(checkpointMessage);
	if (committed.ok) effects = [...effects, `checkpoint:${committed.value}`];
	observed = await context.git.inspect(child, before.branch!);
	if (!observed.ok) return ambiguous(data, effects, observed.message);
	if (!committed.ok) return partial(data, observed.value, effects, committed.message);
	const checkpoint = proveCheckpoint(before, observed.value, child);
	if (checkpoint.status === "unproven")
		return partial(data, observed.value, effects, checkpoint.diagnostic);
	const initialized = await context.stack.init(child);
	effects = [...effects, "gh-stack-init-attempted"];
	const [after, view] = await Promise.all([
		context.git.inspect(child, before.branch!),
		context.stack.view(),
	]);
	if (!after.ok || !view.ok)
		return ambiguous(data, effects, !after.ok ? after.message : view.ok ? "" : view.message);
	const rel = relationship(view.value, before.branch!, child);
	const initialization = provePostconditions([
		[after.value.branch === child, "The initialized child is not the current branch."],
		[isClean(after.value), "The initialized child worktree is not clean."],
		[
			after.value.childSha !== before.headSha,
			"No child checkpoint was observed after initialization.",
		],
		[view.value.trunk === before.trunk, "The gh-stack trunk does not match the cached Git trunk."],
		[
			view.value.currentBranch === child,
			"The initialized child is not current in the gh-stack view.",
		],
		[view.value.branches.length === 1, "The initialized stack is not one layer."],
		[rel.childCurrentTopmost, "The initialized child is not the current stack top."],
	]);
	if (initialization.status === "unproven")
		return partial(
			{ ...data, relationship: rel },
			after.value,
			effects,
			initialized.ok ? initialization.diagnostic : initialized.message,
		);
	return ok(
		completed({
			data,
			facts: after.value,
			relationship: rel,
			effects,
			checkpointSummary: committed.ok ? committed.value : null,
		}),
	);
}

async function runExtension(options: RunPathOptions) {
	const { context, data, before, child, checkpointMessage } = options;
	const added = await context.stack.add(child);
	let effects = ["gh-stack-add-attempted"];
	let [observed, viewed] = await Promise.all([
		context.git.inspect(child, before.branch!),
		context.stack.view(),
	]);
	if (!observed.ok || !viewed.ok)
		return ambiguous(
			data,
			effects,
			!observed.ok ? observed.message : viewed.ok ? "" : viewed.message,
		);
	let rel = relationship(viewed.value, before.branch!, child);
	const attachment = proveAttachment(before, observed.value, child, rel);
	if (attachment.status === "unproven")
		return partial(
			{ ...data, relationship: rel },
			observed.value,
			effects,
			added.ok ? attachment.diagnostic : added.message,
		);
	const committed = await context.checkpoint.commit(checkpointMessage);
	if (committed.ok) effects = [...effects, `checkpoint:${committed.value}`];
	[observed, viewed] = await Promise.all([
		context.git.inspect(child, before.branch!),
		context.stack.view(),
	]);
	if (!observed.ok || !viewed.ok)
		return ambiguous(
			data,
			effects,
			!observed.ok ? observed.message : viewed.ok ? "" : viewed.message,
		);
	rel = relationship(viewed.value, before.branch!, child);
	const checkpoint = proveCheckpoint(before, observed.value, child);
	const completion =
		checkpoint.status === "unproven"
			? checkpoint
			: provePostconditions([
					[rel.childDirectlyAboveSource, "The child is no longer directly above the source."],
					[rel.childCurrentTopmost, "The child is no longer the current stack top."],
				]);
	if (!committed.ok)
		return partial({ ...data, relationship: rel }, observed.value, effects, committed.message);
	if (completion.status === "unproven")
		return partial({ ...data, relationship: rel }, observed.value, effects, completion.diagnostic);
	return ok(
		completed({
			data,
			facts: observed.value,
			relationship: rel,
			effects,
			checkpointSummary: committed.value,
		}),
	);
}

function relationship(
	view: GsAutobranchStackView,
	source: string,
	child: string | null,
): GsAutobranchResult["relationship"] {
	const sourceRows = view.branches.filter((row) => row.name === source);
	const sourceIndex = view.branches.findIndex((row) => row.name === source);
	const childIndex = child === null ? -1 : view.branches.findIndex((row) => row.name === child);
	return {
		trunk: view.trunk,
		currentBranch: view.currentBranch,
		top: view.branches.at(-1)?.name ?? null,
		sourceTrackedOnce: sourceRows.length === 1,
		sourceCurrent:
			sourceRows.length === 1 && sourceRows[0]?.isCurrent === true && view.currentBranch === source,
		sourceTopmost: sourceIndex === view.branches.length - 1,
		childDirectlyAboveSource: childIndex === sourceIndex + 1,
		childCurrentTopmost:
			childIndex === view.branches.length - 1 &&
			view.branches[childIndex]?.isCurrent === true &&
			view.currentBranch === child,
	};
}
type PostconditionProof =
	| { readonly status: "proven" }
	| { readonly status: "unproven"; readonly diagnostic: string };

function proveBranchTransfer(
	before: GsAutobranchGitFacts,
	after: GsAutobranchGitFacts,
	child: string,
): PostconditionProof {
	return provePostconditions([
		[after.branch === child, "The child is not the current branch."],
		[after.childSha === before.headSha, "The child does not point to the source HEAD."],
		[after.sourceRefSha === before.headSha, "The source ref did not remain at the source HEAD."],
		[after.trunkSha === before.trunkSha, "The trunk ref moved during child creation."],
		[after.dirty.total > 0, "Pending work did not transfer to the child."],
	]);
}

function proveCheckpoint(
	before: GsAutobranchGitFacts,
	after: GsAutobranchGitFacts,
	child: string,
): PostconditionProof {
	return provePostconditions([
		[after.branch === child, "The child is not the current branch."],
		[
			after.childSha !== null && after.childSha !== before.headSha,
			"No child checkpoint was observed.",
		],
		[
			after.sourceRefSha === (before.branch === before.trunk ? before.trunkSha : before.headSha),
			"The source ref moved during checkpointing.",
		],
		[after.trunkSha === before.trunkSha, "The trunk ref moved during checkpointing."],
		[isClean(after), "The child worktree is not clean after checkpointing."],
	]);
}

function proveAttachment(
	before: GsAutobranchGitFacts,
	after: GsAutobranchGitFacts,
	child: string,
	relationship: GsAutobranchResult["relationship"],
): PostconditionProof {
	return provePostconditions([
		[after.branch === child, "gh-stack did not switch to the child."],
		[after.childSha === before.headSha, "The child does not point to the source HEAD."],
		[after.sourceRefSha === before.headSha, "The source ref did not remain at the source HEAD."],
		[after.dirty.total > 0, "Pending work did not transfer to the child."],
		[relationship.childDirectlyAboveSource, "The child is not directly above the source."],
		[relationship.childCurrentTopmost, "The child is not the current stack top."],
	]);
}

function provePostconditions(
	checks: ReadonlyArray<readonly [satisfied: boolean, diagnostic: string]>,
): PostconditionProof {
	const failed = checks.find(([satisfied]) => !satisfied);
	return failed === undefined
		? { status: "proven" }
		: { status: "unproven", diagnostic: failed[1] };
}

async function authorize(
	interaction: ClinkrInteraction,
	request: GsAutobranchRequest,
	data: GsAutobranchResult,
	checkpoint: string,
) {
	if (request.yes) return true;
	const preview = [
		`Path: ${data.path}`,
		`Source: ${data.source}@${data.sourceSha}`,
		`Child: ${data.child}`,
		`Checkpoint: ${checkpoint.split("\n")[0] ?? checkpoint}`,
		"Mutations are forward-only; failures preserve observed state.",
	].join("\n");
	const confirmation = await confirmInteractiveOrUsageError(interaction, {
		nonInteractive: {
			message: "This local mutation requires --yes.",
			missingFlag: "--yes",
			howToSupply: "Rerun with --yes.",
		},
		confirmation: { message: preview, defaultAnswer: "no" },
	});
	if ("errorType" in confirmation)
		return usageError(
			confirmation.message,
			recover(data, "authorize-mutation", "Rerun with --yes."),
		);
	if (confirmation.type === "confirmed") return true;
	return negative("Autobranch was not authorized.", {
		data: recover(data, "authorize-mutation", "Rerun and authorize the prepared mutation."),
	});
}
function isSupportedGhStackVersion(version: string): boolean {
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
	if (match === null) return false;
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	if (![major, minor, patch].every(Number.isSafeInteger)) return false;
	return major > 0 || minor >= 1;
}

function resultFrom(facts: GsAutobranchGitFacts, version: string): GsAutobranchResult {
	return {
		...emptyResult(version),
		worktreeGitDir: facts.worktreeGitDir,
		trunk: facts.trunk,
		source: facts.branch,
		sourceSha: facts.headSha,
		dirty: facts.dirty,
		clean: isClean(facts),
	};
}
function emptyResult(version: string | null = null): GsAutobranchResult {
	return {
		outcome: "refused",
		path: null,
		observedVersion: version,
		worktreeGitDir: null,
		trunk: null,
		source: null,
		child: null,
		sourceSha: null,
		childSha: null,
		dirty: { staged: 0, unstaged: 0, untracked: 0, total: 0 },
		clean: null,
		checkpointSummary: null,
		relationship: {
			trunk: null,
			currentBranch: null,
			top: null,
			sourceTrackedOnce: false,
			sourceCurrent: false,
			sourceTopmost: false,
			childDirectlyAboveSource: false,
			childCurrentTopmost: false,
		},
		effects: [],
		diagnostic: null,
		recovery: { action: "inspect-worktree", instruction: "Inspect the reported state." },
	};
}
interface CompletedOptions {
	readonly data: GsAutobranchResult;
	readonly facts: GsAutobranchGitFacts;
	readonly relationship: GsAutobranchResult["relationship"];
	readonly effects: readonly string[];
	readonly checkpointSummary: string | null;
}
function completed(options: CompletedOptions): GsAutobranchResult {
	const { data, facts, relationship, effects, checkpointSummary } = options;
	return {
		...data,
		outcome: "completed",
		childSha: facts.childSha,
		dirty: facts.dirty,
		clean: isClean(facts),
		checkpointSummary,
		relationship,
		effects: [...effects].slice(0, GS_AUTOBRANCH_EFFECTS_MAX_COUNT),
		recovery: { action: "none", instruction: "Continue work on the verified GS child." },
	};
}
function partial(
	data: GsAutobranchResult,
	facts: GsAutobranchGitFacts,
	effects: readonly string[],
	diagnostic: string,
) {
	return negative("Autobranch preserved a known partial result.", {
		data: {
			...data,
			outcome: "known-partial-failure" as const,
			childSha: facts.childSha,
			dirty: facts.dirty,
			clean: isClean(facts),
			effects: [...effects].slice(0, GS_AUTOBRANCH_EFFECTS_MAX_COUNT),
			diagnostic: bound(diagnostic),
			recovery: {
				action: "inspect-child" as const,
				instruction:
					"Inspect the preserved child and gh-stack view; do not replay or roll back automatically.",
			},
		},
	});
}
function ambiguous(data: GsAutobranchResult, effects: readonly string[], diagnostic: string) {
	return negative("Autobranch effects could not be classified.", {
		data: {
			...data,
			outcome: "ambiguous-failure" as const,
			effects: [...effects].slice(0, GS_AUTOBRANCH_EFFECTS_MAX_COUNT),
			diagnostic: bound(diagnostic),
			recovery: {
				action: "inspect-child" as const,
				instruction: "Inspect Git and the invoking stack worktree before any further mutation.",
			},
		},
	});
}
function recover(
	data: GsAutobranchResult,
	action: GsAutobranchResult["recovery"]["action"],
	instruction: string,
): GsAutobranchResult {
	return { ...data, recovery: { action, instruction } };
}
function bound(value: string): string {
	return truncateTextHead({
		value,
		maxChars: GS_AUTOBRANCH_DIAGNOSTIC_MAX_CHARS,
		buildMarker: () => "… [diagnostic bound]",
		shouldTrimHead: false,
	});
}

function isClean(facts: GsAutobranchGitFacts): boolean {
	return facts.dirty.total === 0;
}

export { renderGsAutobranchHuman } from "./autobranch-render.ts";

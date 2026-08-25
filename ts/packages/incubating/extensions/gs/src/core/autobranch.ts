import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";
import { failure, negative, ok, usageError, z } from "@nseng-ai/sdk";

export const GS_AUTOBRANCH_PROVIDER_VERSION = "0.1.0";
const EFFECTS_MAX_COUNT = 12;
const DIAGNOSTIC_MAX_CHARS = 1_100;

export const gsAutobranchRequestSchema = z.lazy(() =>
	z.strictObject({ slug: z.string().trim().min(1).optional(), yes: z.boolean().default(false) }),
);
export type GsAutobranchRequest = z.infer<typeof gsAutobranchRequestSchema>;

export const gsAutobranchResultSchema = z.lazy(() =>
	z.strictObject({
		outcome: z.enum(["refused", "completed", "known-partial-failure", "ambiguous-failure"]),
		path: z.enum(["trunk-bootstrap", "tracked-top-extension"]).nullable(),
		observedVersion: z.string().nullable(),
		providerWorktreeGitDir: z.string().nullable(),
		trunk: z.string().nullable(),
		source: z.string().nullable(),
		child: z.string().nullable(),
		sourceSha: z.string().nullable(),
		childSha: z.string().nullable(),
		dirty: z.strictObject({
			staged: z.number().int().nonnegative(),
			unstaged: z.number().int().nonnegative(),
			untracked: z.number().int().nonnegative(),
			total: z.number().int().nonnegative(),
		}),
		clean: z.boolean().nullable(),
		checkpointSummary: z.string().max(300).nullable(),
		relationship: z.strictObject({
			trunk: z.string().nullable(),
			currentBranch: z.string().nullable(),
			top: z.string().nullable(),
			sourceTrackedOnce: z.boolean(),
			sourceCurrent: z.boolean(),
			sourceTopmost: z.boolean(),
			childDirectlyAboveSource: z.boolean(),
			childCurrentTopmost: z.boolean(),
		}),
		effects: z.array(z.string().max(200)).max(EFFECTS_MAX_COUNT),
		diagnostic: z.string().max(DIAGNOSTIC_MAX_CHARS).nullable(),
		recovery: z.strictObject({
			action: z.enum([
				"none",
				"authorize-mutation",
				"provide-slug",
				"inspect-worktree",
				"inspect-child",
				"inspect-provider-worktree",
				"install-supported-provider",
			]),
			instruction: z.string().max(400),
		}),
	}),
);
export type GsAutobranchResult = z.infer<typeof gsAutobranchResultSchema>;

export interface GsAutobranchGitFacts {
	readonly root: string;
	readonly providerWorktreeGitDir: string;
	readonly branch: string | null;
	readonly headSha: string | null;
	readonly trunk: string | null;
	readonly trunkSha: string | null;
	readonly operation: "none" | "rebase" | "merge" | "cherry-pick" | "revert" | "bisect";
	readonly status: string;
	readonly diff: string;
	readonly dirty: GsAutobranchResult["dirty"];
	readonly clean: boolean;
	readonly childSha: string | null;
	readonly sourceRefSha: string | null;
}
export type GsAutobranchGatewayResult<T> =
	| { readonly ok: true; readonly value: T }
	| {
			readonly ok: false;
			readonly message: string;
			readonly reason?: "untracked" | "command-failed" | "unsupported-output";
	  };
export interface GsAutobranchGitGateway {
	inspect(
		child: string | null,
		source?: string,
	): Promise<GsAutobranchGatewayResult<GsAutobranchGitFacts>>;
	validateChild(child: string): Promise<GsAutobranchGatewayResult<boolean>>;
	createAndSwitchChild(child: string): Promise<GsAutobranchGatewayResult<null>>;
}
export interface GsAutobranchProviderView {
	readonly trunk: string;
	readonly currentBranch: string;
	readonly branches: readonly {
		readonly name: string;
		readonly base: string;
		readonly isCurrent: boolean;
	}[];
}
export interface GsAutobranchProviderGateway {
	readVersion(): Promise<GsAutobranchGatewayResult<string>>;
	view(): Promise<GsAutobranchGatewayResult<GsAutobranchProviderView>>;
	init(child: string): Promise<GsAutobranchGatewayResult<null>>;
	add(child: string): Promise<GsAutobranchGatewayResult<null>>;
}
export interface GsAutobranchCheckpointGateway {
	commit(message: string): Promise<GsAutobranchGatewayResult<string>>;
}
export interface GsAutobranchPreparationGateway {
	prepare(input: {
		readonly requestedSlug?: string;
		readonly facts: GsAutobranchGitFacts;
	}): Promise<
		GsAutobranchGatewayResult<{ readonly child: string; readonly checkpointMessage: string }>
	>;
}
export interface GsAutobranchContext {
	readonly git: GsAutobranchGitGateway;
	readonly provider: GsAutobranchProviderGateway;
	readonly checkpoint: GsAutobranchCheckpointGateway;
	readonly preparation: GsAutobranchPreparationGateway;
}
export interface GsAutobranchInteraction {
	isInteractive(): boolean;
	confirm(message: string): Promise<boolean>;
}

interface RunPathOptions {
	readonly context: GsAutobranchContext;
	readonly data: GsAutobranchResult;
	readonly before: GsAutobranchGitFacts;
	readonly child: string;
	readonly checkpointMessage: string;
}

export async function runGsAutobranch(
	context: GsAutobranchContext,
	interaction: GsAutobranchInteraction,
	request: GsAutobranchRequest,
) {
	const version = await context.provider.readVersion();
	if (!version.ok) return failure("autobranch-inspection-failed", version.message, emptyResult());
	const inspected = await context.git.inspect(null);
	if (!inspected.ok)
		return failure("autobranch-inspection-failed", inspected.message, emptyResult(version.value));
	const before = inspected.value;
	let data = resultFrom(before, version.value);
	if (version.value !== GS_AUTOBRANCH_PROVIDER_VERSION) {
		return negative(`gh-stack ${GS_AUTOBRANCH_PROVIDER_VERSION} is required.`, {
			data: recover(
				data,
				"install-supported-provider",
				`Install gh-stack ${GS_AUTOBRANCH_PROVIDER_VERSION}.`,
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
		const view = await context.provider.view();
		if (!view.ok) {
			const observed = recover(
				{ ...data, diagnostic: bound(view.message) },
				"inspect-provider-worktree",
				"Run from the provider worktree that tracks this branch.",
			);
			return view.reason === "untracked"
				? negative("The current branch is not tracked in the invoking provider worktree.", {
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
			return negative(
				"The current branch must be the unique current top in this provider worktree.",
				{
					data: recover(
						data,
						"inspect-provider-worktree",
						"Check out the invoking provider worktree's tracked top, then rerun.",
					),
				},
			);
		}
	}
	const prepared = await context.preparation.prepare({
		...(request.slug === undefined ? {} : { requestedSlug: request.slug }),
		facts: before,
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
	if (!created.ok || !branchTransferProven(before, observed.value, child))
		return partial(
			data,
			observed.value,
			effects,
			created.ok ? "Child transfer postconditions were not proven." : created.message,
		);
	const committed = await context.checkpoint.commit(checkpointMessage);
	if (committed.ok) effects = [...effects, `checkpoint:${committed.value}`];
	observed = await context.git.inspect(child, before.branch!);
	if (!observed.ok) return ambiguous(data, effects, observed.message);
	if (!committed.ok || !checkpointProven(before, observed.value, child))
		return partial(
			data,
			observed.value,
			effects,
			committed.ok ? "Checkpoint postconditions were not proven." : committed.message,
		);
	const initialized = await context.provider.init(child);
	effects = [...effects, "provider-init-attempted"];
	const [after, view] = await Promise.all([
		context.git.inspect(child, before.branch!),
		context.provider.view(),
	]);
	if (!after.ok || !view.ok)
		return ambiguous(data, effects, !after.ok ? after.message : view.ok ? "" : view.message);
	const rel = relationship(view.value, before.branch!, child);
	const complete =
		after.value.branch === child &&
		after.value.clean &&
		after.value.childSha !== before.headSha &&
		view.value.trunk === before.trunk &&
		view.value.currentBranch === child &&
		view.value.branches.length === 1 &&
		rel.childCurrentTopmost;
	if (!complete)
		return partial(
			{ ...data, relationship: rel },
			after.value,
			effects,
			initialized.ok
				? "Provider initialization postconditions were not proven."
				: initialized.message,
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
	const added = await context.provider.add(child);
	let effects = ["provider-add-attempted"];
	let [observed, viewed] = await Promise.all([
		context.git.inspect(child, before.branch!),
		context.provider.view(),
	]);
	if (!observed.ok || !viewed.ok)
		return ambiguous(
			data,
			effects,
			!observed.ok ? observed.message : viewed.ok ? "" : viewed.message,
		);
	let rel = relationship(viewed.value, before.branch!, child);
	if (!attachmentProven(before, observed.value, child, rel))
		return partial(
			{ ...data, relationship: rel },
			observed.value,
			effects,
			added.ok ? "Provider attachment postconditions were not proven." : added.message,
		);
	const committed = await context.checkpoint.commit(checkpointMessage);
	if (committed.ok) effects = [...effects, `checkpoint:${committed.value}`];
	[observed, viewed] = await Promise.all([
		context.git.inspect(child, before.branch!),
		context.provider.view(),
	]);
	if (!observed.ok || !viewed.ok)
		return ambiguous(
			data,
			effects,
			!observed.ok ? observed.message : viewed.ok ? "" : viewed.message,
		);
	rel = relationship(viewed.value, before.branch!, child);
	if (
		!committed.ok ||
		!checkpointProven(before, observed.value, child) ||
		!rel.childDirectlyAboveSource ||
		!rel.childCurrentTopmost
	)
		return partial(
			{ ...data, relationship: rel },
			observed.value,
			effects,
			committed.ok ? "Final postconditions were not proven." : committed.message,
		);
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
	view: GsAutobranchProviderView,
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
function branchTransferProven(
	before: GsAutobranchGitFacts,
	after: GsAutobranchGitFacts,
	child: string,
): boolean {
	return (
		after.branch === child &&
		after.childSha === before.headSha &&
		after.sourceRefSha === before.headSha &&
		after.trunkSha === before.trunkSha &&
		after.dirty.total > 0
	);
}
function checkpointProven(
	before: GsAutobranchGitFacts,
	after: GsAutobranchGitFacts,
	child: string,
): boolean {
	return (
		after.branch === child &&
		after.childSha !== null &&
		after.childSha !== before.headSha &&
		after.sourceRefSha === (before.branch === before.trunk ? before.trunkSha : before.headSha) &&
		after.trunkSha === before.trunkSha &&
		after.clean
	);
}
function attachmentProven(
	before: GsAutobranchGitFacts,
	after: GsAutobranchGitFacts,
	child: string,
	rel: GsAutobranchResult["relationship"],
): boolean {
	return (
		after.branch === child &&
		after.childSha === before.headSha &&
		after.sourceRefSha === before.headSha &&
		after.dirty.total > 0 &&
		rel.childDirectlyAboveSource &&
		rel.childCurrentTopmost
	);
}

async function authorize(
	interaction: GsAutobranchInteraction,
	request: GsAutobranchRequest,
	data: GsAutobranchResult,
	checkpoint: string,
) {
	if (request.yes) return true;
	if (!interaction.isInteractive())
		return usageError(
			"This local mutation requires --yes.",
			recover(data, "authorize-mutation", "Rerun with --yes."),
		);
	const preview = [
		`Path: ${data.path}`,
		`Source: ${data.source}@${data.sourceSha}`,
		`Child: ${data.child}`,
		`Checkpoint: ${checkpoint.split("\n")[0] ?? checkpoint}`,
		"Mutations are forward-only; failures preserve observed state.",
	].join("\n");
	if (await interaction.confirm(preview)) return true;
	return negative("Autobranch was not authorized.", {
		data: recover(data, "authorize-mutation", "Rerun and authorize the prepared mutation."),
	});
}
function resultFrom(facts: GsAutobranchGitFacts, version: string): GsAutobranchResult {
	return {
		...emptyResult(version),
		providerWorktreeGitDir: facts.providerWorktreeGitDir,
		trunk: facts.trunk,
		source: facts.branch,
		sourceSha: facts.headSha,
		dirty: facts.dirty,
		clean: facts.dirty.total === 0,
	};
}
function emptyResult(version: string | null = null): GsAutobranchResult {
	return {
		outcome: "refused",
		path: null,
		observedVersion: version,
		providerWorktreeGitDir: null,
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
		clean: facts.dirty.total === 0,
		checkpointSummary,
		relationship,
		effects: [...effects].slice(0, EFFECTS_MAX_COUNT),
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
			clean: facts.dirty.total === 0,
			effects: [...effects].slice(0, EFFECTS_MAX_COUNT),
			diagnostic: bound(diagnostic),
			recovery: {
				action: "inspect-child" as const,
				instruction:
					"Inspect the preserved child and provider view; do not replay or roll back automatically.",
			},
		},
	});
}
function ambiguous(data: GsAutobranchResult, effects: readonly string[], diagnostic: string) {
	return negative("Autobranch effects could not be classified.", {
		data: {
			...data,
			outcome: "ambiguous-failure" as const,
			effects: [...effects].slice(0, EFFECTS_MAX_COUNT),
			diagnostic: bound(diagnostic),
			recovery: {
				action: "inspect-child" as const,
				instruction: "Inspect Git and the invoking provider worktree before any further mutation.",
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
		maxChars: DIAGNOSTIC_MAX_CHARS,
		buildMarker: () => "… [diagnostic bound]",
		shouldTrimHead: false,
	});
}

export function renderGsAutobranchHuman(data: GsAutobranchResult): string {
	return [
		`${data.outcome}: ${data.path ?? "unclassified"}`,
		`Provider worktree: ${data.providerWorktreeGitDir ?? "unknown"}`,
		`Source: ${data.source ?? "unknown"}@${data.sourceSha ?? "unknown"}`,
		`Child: ${data.child ?? "unprepared"}@${data.childSha ?? "unknown"}`,
		`Dirtiness: ${data.dirty.staged} staged, ${data.dirty.unstaged} unstaged, ${data.dirty.untracked} untracked`,
		`Effects: ${data.effects.length === 0 ? "none" : data.effects.join(", ")}`,
		...(data.diagnostic === null ? [] : [`Observation: ${data.diagnostic}`]),
		`Recovery: ${data.recovery.instruction}`,
	].join("\n");
}

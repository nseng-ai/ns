import type { BranchContextAttachData } from "./branch-memory.ts";
import { attachBranchContext, AttachBranchContextError } from "./attach.ts";
import { checkBranchContextEntryPresence, throwBranchContextBrmemError } from "./branch-memory.ts";
import { BRANCH_CONTEXT_NAMESPACE, buildBranchContextPlanKey } from "./constants.ts";
import type { BrmemGateway } from "@nseng-ai/brmem";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { type CommandExecApi, formatCommand } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { normalizeSummary, resolvePlanSourceFile } from "@nseng-ai/plans";
import type { BranchContextContext } from "./context.ts";

export { BRANCH_CONTEXT_NAMESPACE, buildBranchContextPlanKey } from "./constants.ts";

const MAX_ERROR_CHARS = 4_000;

export const BRANCH_CREATION_METHODS = ["plain-git", "graphite"] as const;
export type BranchCreationMethod = (typeof BRANCH_CREATION_METHODS)[number];
export const DEFAULT_BRANCH_CREATION_METHOD: BranchCreationMethod = "plain-git";

export function describeBranchContextGraphiteCreationSteps(parentBranch: string): string {
	return `Branch-context Graphite branch creation is \`git branch <target> HEAD\` plus \`gt track <target> --parent ${parentBranch} --no-interactive\`, not \`gt create\`.`;
}

export type BranchContextCreationPolicy =
	| { type: "plain-git-current-head" }
	| { type: "plain-git-explicit"; startPoint: string; startRef: string }
	| { type: "graphite-current-parent-current-head" }
	| {
			type: "graphite-explicit";
			startPoint: string;
			startRef: string;
			parentBranch: string;
	  };

export function branchContextCreationPolicyFromMethod(
	method: BranchCreationMethod,
): BranchContextCreationPolicy {
	return method === "graphite"
		? { type: "graphite-current-parent-current-head" }
		: { type: "plain-git-current-head" };
}

export interface CreateBranchContextFromFileParams {
	slug: string;
	filePath: string;
	branchName?: string;
	creation: BranchContextCreationPolicy;
	summary?: string;
}

export interface CreateBranchContextFromFileOptions {
	cwd: string;
	context: BranchContextContext;
	signal?: AbortSignal;
}

export interface BranchContextBranchSelectionCollision {
	branch: string;
	isLocalBranch: boolean;
	hasAttachedPlan: boolean;
}

interface BranchContextBranchSelectionBase {
	requestedBranch: string;
	selectedBranch: string;
	collisions: BranchContextBranchSelectionCollision[];
}

export type BranchContextBranchSelection =
	| (BranchContextBranchSelectionBase & { type: "exact" })
	| (BranchContextBranchSelectionBase & { type: "auto-suffixed" });

export type BranchContextEvidenceCreation =
	| { type: "plain-git"; startRef: string }
	| { type: "graphite"; startRef: string; parentBranch: string };

export interface BranchContextEvidence {
	slug: string;
	branch: string;
	startPoint: string;
	creation: BranchContextEvidenceCreation;
	namespace: string;
	key: string;
	refName: string;
	commit: string;
	sourceFile: string;
	branchSelection?: BranchContextBranchSelection;
	summary?: string;
}

export interface BranchContextCreateOperation {
	slug: string;
	filePath: string;
	branch: string;
	creation: BranchContextCreationPolicy;
	namespace: string;
	key: string;
	params: CreateBranchContextFromFileParams;
	branchSelection: BranchContextBranchSelection;
	summary?: string;
}

export type BranchContextGraphitePreviewParent =
	| { type: "resolved"; branch: string }
	| { type: "current-parent-unresolved" };

export type BranchContextCreatePreviewContext =
	| { type: "plain-git"; startPoint: string }
	| {
			type: "graphite";
			startPoint: string;
			parent: BranchContextGraphitePreviewParent;
	  };

interface BranchContextRepoAccess {
	cwd: string;
	git: GitGateway;
	brmem: BrmemGateway;
	signal?: AbortSignal;
}

export interface CreateBranchContextFromResolvedSourceOptions extends BranchContextRepoAccess {
	operation: BranchContextCreateOperation;
	sourceFile: string;
	graphite: GraphiteBranchGateway;
}

export async function createBranchContextFromFile(
	pi: CommandExecApi,
	params: CreateBranchContextFromFileParams,
	options: CreateBranchContextFromFileOptions,
): Promise<BranchContextEvidence> {
	const operation = buildBranchContextCreateOperation(params);
	const { git, brmem, graphite } = options.context;
	await checkBranchRefFormat(git, options.cwd, operation.branch, options.signal);
	const selectedOperation = await selectBranchContextCreateOperationTarget({
		cwd: options.cwd,
		operation,
		git,
		brmem,
		isExplicitTargetBranch: params.branchName !== undefined,
		...optionalEntry("signal", options.signal),
	});
	const sourceFile = await resolvePlanSourceFile(pi, {
		cwd: options.cwd,
		rawFilePath: selectedOperation.filePath,
		...optionalEntry("signal", options.signal),
		git,
	});
	return createBranchContextFromResolvedSource({
		cwd: options.cwd,
		operation: selectedOperation,
		sourceFile,
		git,
		brmem,
		graphite,
		...optionalEntry("signal", options.signal),
	});
}

export async function createBranchContextFromResolvedSource(
	options: CreateBranchContextFromResolvedSourceOptions,
): Promise<BranchContextEvidence> {
	const basis = await resolveBranchContextBasis({
		git: options.git,
		cwd: options.cwd,
		creation: options.operation.creation,
		...optionalEntry("signal", options.signal),
	});
	await assertSelectedTargetBranchStillAvailable(options);
	await createBranchContext(options.git, options.graphite, {
		cwd: options.cwd,
		branch: options.operation.branch,
		basis,
		signal: options.signal,
	});

	let attach: BranchContextAttachData;
	try {
		attach = await attachBranchContext({
			brmem: options.brmem,
			cwd: options.cwd,
			branch: options.operation.branch,
			key: options.operation.key,
			sourceFile: options.sourceFile,
		});
	} catch (error) {
		throw partialFailureError({
			title: attachFailureTitle(error instanceof AttachBranchContextError ? error.code : "unknown"),
			branch: options.operation.branch,
			creation: evidenceCreationFromResolvedBasis(basis),
			startPoint: basis.startPoint,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: options.operation.key,
			sourceFile: options.sourceFile,
			cause: formatErrorMessage(error),
		});
	}

	return buildEvidence({
		data: attach,
		slug: options.operation.slug,
		creation: evidenceCreationFromResolvedBasis(basis),
		startPoint: basis.startPoint,
		branchSelection: options.operation.branchSelection,
		summary: options.operation.summary,
	});
}

export function buildBranchContextCreateOperation(
	params: CreateBranchContextFromFileParams,
): BranchContextCreateOperation {
	const slug = params.slug.trim();
	const branch = deriveTargetBranch(params.branchName, slug);
	const summary = normalizeSummary(params.summary);
	const operationParams: CreateBranchContextFromFileParams = {
		slug,
		filePath: params.filePath,
		creation: { ...params.creation },
	};
	if (branch !== slug) {
		operationParams.branchName = branch;
	}
	if (summary !== undefined) {
		operationParams.summary = summary;
	}

	const operation = {
		slug,
		filePath: params.filePath,
		branch,
		creation: { ...params.creation },
		namespace: BRANCH_CONTEXT_NAMESPACE,
		key: buildBranchContextPlanKey(slug),
		params: operationParams,
		branchSelection: exactBranchSelection(branch),
	};
	if (summary === undefined) {
		return operation;
	}
	return { ...operation, summary };
}

export async function resolveBranchContextCreatePreviewContext(
	_pi: CommandExecApi,
	options: {
		cwd: string;
		context: BranchContextContext;
		creation: BranchContextCreationPolicy;
		signal?: AbortSignal;
	},
): Promise<BranchContextCreatePreviewContext> {
	switch (options.creation.type) {
		case "plain-git-current-head":
			return {
				type: "plain-git",
				startPoint: await resolveStartPoint(options.context.git, options.cwd, options.signal),
			};
		case "plain-git-explicit":
			return { type: "plain-git", startPoint: options.creation.startPoint };
		case "graphite-current-parent-current-head":
			return {
				type: "graphite",
				startPoint: await resolveStartPoint(options.context.git, options.cwd, options.signal),
				parent: { type: "current-parent-unresolved" },
			};
		case "graphite-explicit":
			return {
				type: "graphite",
				startPoint: options.creation.startPoint,
				parent: { type: "resolved", branch: options.creation.parentBranch },
			};
	}
}

export function formatBranchContextCreatePreview(
	operation: BranchContextCreateOperation,
	context: BranchContextCreatePreviewContext,
): string {
	const method = branchCreationMethodFromPolicy(operation.creation);
	const graphiteParent =
		context.type === "graphite"
			? context.parent.type === "resolved"
				? context.parent.branch
				: "<current-graphite-parent>"
			: undefined;
	const lines = [
		"Target:",
		`Branch: ${operation.branch}`,
		`Branch creation: ${method}`,
		...formatBranchSelectionLines(operation.branchSelection),
		`Start point: ${context.startPoint}`,
		`Branch Memory namespace: ${operation.namespace}`,
		`Branch Memory key: ${operation.key}`,
		"",
		"Branch-context operations that would run:",
	];
	if (graphiteParent !== undefined) {
		lines.push(formatCommand("gt", ["info", graphiteParent, "--no-interactive"]));
	}
	lines.push(
		formatCommand("git", ["branch", operation.branch, creationStartPoint(operation.creation)]),
	);
	if (graphiteParent !== undefined) {
		lines.push(
			formatCommand("gt", [
				"track",
				operation.branch,
				"--parent",
				graphiteParent,
				"--no-interactive",
			]),
		);
	}
	lines.push(
		[
			"Attach plan through the in-process Branch Memory gateway:",
			`Namespace: ${operation.namespace}`,
			`Branch: ${operation.branch}`,
			`Key: ${operation.key}`,
			`Source file: ${operation.filePath}`,
		].join(" "),
	);
	return lines.join("\n");
}

export function formatBranchContextEvidence(evidence: BranchContextEvidence): string {
	const lines = [
		"Created branch context and attached plan.",
		`Branch: ${evidence.branch}`,
		`Branch creation: ${evidenceCreationMethod(evidence.creation)}`,
		...formatBranchSelectionLines(evidence.branchSelection),
		`Start point: ${evidence.startPoint}`,
		`Start ref: ${evidence.creation.startRef}`,
		...(evidence.creation.type === "graphite"
			? [`Graphite parent: ${evidence.creation.parentBranch}`]
			: []),
		`Namespace: ${evidence.namespace}`,
		`Key: ${evidence.key}`,
		`Ref: ${evidence.refName}`,
		`Commit: ${evidence.commit}`,
		`Source file: ${evidence.sourceFile}`,
		`Slug: ${evidence.slug}`,
	];
	if (evidence.summary !== undefined) {
		lines.push(`Summary: ${evidence.summary}`);
	}
	return lines.join("\n");
}

export function formatBranchContextCreateFailure(
	operation: BranchContextCreateOperation,
	error: unknown,
	options: {
		/** Consumer consequence line, e.g. "No Herdr workspace was opened." */
		consequence?: string;
	} = {},
): string {
	return [
		"Failed to create branch context and attach plan.",
		`Branch: ${operation.branch}`,
		...formatBranchSelectionLines(operation.branchSelection),
		`Branch creation: ${branchCreationMethodFromPolicy(operation.creation)}`,
		...formatCreationPolicyDetails(operation.creation),
		`Namespace: ${operation.namespace}`,
		`Key: ${operation.key}`,
		`Source file: ${operation.filePath}`,
		...(options.consequence === undefined ? [] : [options.consequence]),
		"",
		formatErrorMessage(error),
	].join("\n");
}

function branchCreationMethodFromPolicy(
	creation: BranchContextCreationPolicy,
): BranchCreationMethod {
	return creation.type.startsWith("graphite-") ? "graphite" : "plain-git";
}

function evidenceCreationMethod(creation: BranchContextEvidenceCreation): BranchCreationMethod {
	return creation.type === "plain-git" ? "plain-git" : "graphite";
}

function creationStartPoint(creation: BranchContextCreationPolicy): string {
	return creation.type === "plain-git-explicit" || creation.type === "graphite-explicit"
		? creation.startPoint
		: "HEAD";
}

function formatCreationPolicyDetails(creation: BranchContextCreationPolicy): string[] {
	switch (creation.type) {
		case "plain-git-current-head":
		case "graphite-current-parent-current-head":
			return [];
		case "plain-git-explicit":
			return [`Start point: ${creation.startPoint}`, `Start ref: ${creation.startRef}`];
		case "graphite-explicit":
			return [
				`Start point: ${creation.startPoint}`,
				`Start ref: ${creation.startRef}`,
				`Graphite parent: ${creation.parentBranch}`,
			];
	}
}

export function deriveTargetBranch(branchName: string | undefined, slug: string): string {
	const trimmedBranchName = branchName?.trim();
	return trimmedBranchName && trimmedBranchName.length > 0 ? trimmedBranchName : slug;
}

export async function selectBranchContextCreateOperationTarget(
	options: BranchContextRepoAccess & {
		operation: BranchContextCreateOperation;
		isExplicitTargetBranch: boolean;
	},
): Promise<BranchContextCreateOperation> {
	const maxAttempts = 100;
	const requestedBranch = options.operation.branch;
	if (options.isExplicitTargetBranch) {
		return withBranchSelection(options.operation, exactBranchSelection(requestedBranch));
	}

	const collisions: BranchContextBranchSelectionCollision[] = [];
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const candidate = attempt === 1 ? requestedBranch : `${requestedBranch}-${attempt}`;
		const occupancy = await checkTargetBranchOccupancy({
			cwd: options.cwd,
			git: options.git,
			brmem: options.brmem,
			branch: candidate,
			key: options.operation.key,
			...optionalEntry("signal", options.signal),
		});
		if (!occupancy.collision.isLocalBranch && !occupancy.collision.hasAttachedPlan) {
			const selection =
				collisions.length === 0
					? exactBranchSelection(candidate)
					: {
							type: "auto-suffixed" as const,
							requestedBranch,
							selectedBranch: candidate,
							collisions,
						};
			return withBranchSelection(options.operation, selection);
		}
		collisions.push({ branch: candidate, ...occupancy.collision });
	}

	throw new Error(
		[
			"Could not find an available default target branch for branch context creation.",
			`Base branch: ${requestedBranch}`,
			`Attempts: ${maxAttempts}`,
			`Last attempted branch: ${requestedBranch}-${maxAttempts}`,
		].join("\n"),
	);
}

async function checkBranchRefFormat(
	git: GitGateway,
	cwd: string,
	targetBranch: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const refFormat = await git.validateBranchRef({ cwd, branch: targetBranch, signal });
	if (!refFormat.ok) {
		throw new Error(refFormat.error.message);
	}
}

async function resolveStartPoint(
	git: GitGateway,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const head = await git.headCommit({ cwd, signal });
	if (!head.ok) {
		throw new Error(head.error.message);
	}
	return head.value;
}

type ResolvedBranchContextBasis =
	| {
			type: "plain-git";
			startPoint: string;
			startRef: string;
			useHead: boolean;
	  }
	| {
			type: "graphite";
			startPoint: string;
			startRef: string;
			useHead: boolean;
			parentBranch: string;
	  };

interface ResolveBranchContextBasisOptions {
	git: GitGateway;
	cwd: string;
	creation: BranchContextCreationPolicy;
	signal?: AbortSignal;
}

async function resolveBranchContextBasis(
	options: ResolveBranchContextBasisOptions,
): Promise<ResolvedBranchContextBasis> {
	const { git, cwd, creation, signal } = options;
	switch (creation.type) {
		case "plain-git-current-head":
			return {
				type: "plain-git",
				startPoint: await resolveStartPoint(git, cwd, signal),
				startRef: "HEAD",
				useHead: true,
			};
		case "plain-git-explicit":
			return {
				type: "plain-git",
				startPoint: creation.startPoint,
				startRef: creation.startRef,
				useHead: false,
			};
		case "graphite-current-parent-current-head":
			return {
				type: "graphite",
				startPoint: await resolveStartPoint(git, cwd, signal),
				startRef: "HEAD",
				useHead: true,
				parentBranch: await resolveCurrentBranch(git, cwd, signal),
			};
		case "graphite-explicit":
			return {
				type: "graphite",
				startPoint: creation.startPoint,
				startRef: creation.startRef,
				parentBranch: creation.parentBranch,
				useHead: false,
			};
	}
}

interface SelectedBranchAvailabilityOptions extends BranchContextRepoAccess {
	operation: BranchContextCreateOperation;
}

async function assertSelectedTargetBranchStillAvailable(
	options: SelectedBranchAvailabilityOptions,
): Promise<void> {
	const occupancy = await checkTargetBranchOccupancy({
		cwd: options.cwd,
		git: options.git,
		brmem: options.brmem,
		branch: options.operation.branch,
		key: options.operation.key,
		stopAfterLocalBranch: true,
		...optionalEntry("signal", options.signal),
	});
	if (occupancy.localBranch !== undefined) {
		throw new Error(
			[
				"Target branch already exists; refusing to overwrite.",
				`Branch: ${options.operation.branch}`,
				`Ref: ${occupancy.localBranch.refName}`,
				`Command: ${occupancy.localBranch.displayCommand}`,
			].join("\n"),
		);
	}
	if (occupancy.collision.hasAttachedPlan) {
		throw new Error(
			formatStaleTargetBranchMemoryMessage({
				targetBranch: options.operation.branch,
				key: options.operation.key,
			}),
		);
	}
}

interface CheckTargetBranchOccupancyOptions extends BranchContextRepoAccess {
	branch: string;
	key: string;
	stopAfterLocalBranch?: boolean;
}

interface TargetBranchOccupancy {
	collision: Omit<BranchContextBranchSelectionCollision, "branch">;
	localBranch?: LocalBranchPresence;
}

interface LocalBranchPresence {
	refName: string;
	displayCommand: string;
}

async function checkTargetBranchOccupancy(
	options: CheckTargetBranchOccupancyOptions,
): Promise<TargetBranchOccupancy> {
	const localBranch = await checkLocalBranchPresence(options);
	if (localBranch !== undefined && options.stopAfterLocalBranch === true) {
		return {
			collision: { isLocalBranch: true, hasAttachedPlan: false },
			localBranch,
		};
	}
	const hasAttachedPlan = await checkAttachedPlanPresence(
		options.brmem,
		options.branch,
		options.key,
	);
	return {
		collision: {
			isLocalBranch: localBranch !== undefined,
			hasAttachedPlan,
		},
		...optionalEntry("localBranch", localBranch),
	};
}

async function checkLocalBranchPresence(
	options: Pick<CheckTargetBranchOccupancyOptions, "cwd" | "git" | "branch" | "signal">,
): Promise<LocalBranchPresence | undefined> {
	const localBranch = await options.git.localBranchPresence({
		cwd: options.cwd,
		branch: options.branch,
		...optionalEntry("signal", options.signal),
	});
	if (localBranch.type === "error") {
		throw new Error(localBranch.error.message);
	}
	if (localBranch.type === "absent") {
		return undefined;
	}
	return { refName: localBranch.refName, displayCommand: localBranch.displayCommand };
}

async function checkAttachedPlanPresence(
	brmem: BrmemGateway,
	branch: string,
	key: string,
): Promise<boolean> {
	const attachedPlan = await checkBranchContextEntryPresence(brmem, { branch, key });
	if (attachedPlan.type === "error") {
		throwBranchContextBrmemError(attachedPlan.error);
	}
	return attachedPlan.type === "present";
}

function exactBranchSelection(branch: string): BranchContextBranchSelection {
	return { type: "exact", requestedBranch: branch, selectedBranch: branch, collisions: [] };
}

function withBranchSelection(
	operation: BranchContextCreateOperation,
	branchSelection: BranchContextBranchSelection,
): BranchContextCreateOperation {
	const branch = branchSelection.selectedBranch;
	return { ...operation, branch, branchSelection };
}

export function formatBranchSelectionLines(
	selection: BranchContextBranchSelection | undefined,
): string[] {
	if (selection === undefined || selection.type === "exact") {
		return [];
	}
	return [
		`Default branch: ${selection.requestedBranch}`,
		`Selected target branch: ${selection.selectedBranch}`,
		`Default branch ${selection.requestedBranch} already exists or has an attached plan; selected ${selection.selectedBranch}.`,
	];
}

function formatStaleTargetBranchMemoryMessage(context: {
	targetBranch: string;
	key: string;
}): string {
	return [
		"Stale Branch Memory attachment exists for target branch; refusing to create branch context.",
		"Local branch is absent, but Branch Memory already contains the attached plan key.",
		`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`,
		`Branch: ${context.targetBranch}`,
		`Key: ${context.key}`,
		"Cleanup: run `brmem gc` to preview stale Branch Memory Snapshots, then `brmem gc --yes` to delete them.",
	].join("\n");
}

interface CreateBranchContextOptions {
	cwd: string;
	branch: string;
	basis: ResolvedBranchContextBasis;
	signal: AbortSignal | undefined;
}

interface CreatePlainGitBranchOptions {
	cwd: string;
	branch: string;
	startPoint: string;
	useHead: boolean;
	signal: AbortSignal | undefined;
}

interface CreateGraphiteBranchOptions extends CreatePlainGitBranchOptions {
	parentBranch: string;
}

async function createBranchContext(
	git: GitGateway,
	graphite: GraphiteBranchGateway,
	options: CreateBranchContextOptions,
): Promise<void> {
	const branchOptions = {
		cwd: options.cwd,
		branch: options.branch,
		startPoint: options.basis.startPoint,
		useHead: options.basis.useHead,
		signal: options.signal,
	};
	if (options.basis.type === "graphite") {
		await createGraphiteBranch(git, graphite, {
			...branchOptions,
			parentBranch: options.basis.parentBranch,
		});
		return;
	}
	await createPlainGitBranch(git, branchOptions);
}

async function createPlainGitBranch(
	git: GitGateway,
	options: CreatePlainGitBranchOptions,
): Promise<void> {
	const create = options.useHead
		? await git.createBranchAtHead({
				cwd: options.cwd,
				branch: options.branch,
				signal: options.signal,
			})
		: await git.createBranchAtStartPoint({
				cwd: options.cwd,
				branch: options.branch,
				startPoint: options.startPoint,
				signal: options.signal,
			});
	if (!create.ok) {
		throw new Error(create.error.message);
	}
}

async function createGraphiteBranch(
	git: GitGateway,
	graphite: GraphiteBranchGateway,
	options: CreateGraphiteBranchOptions,
): Promise<void> {
	const parentTracked = await graphite.checkBranchTracked({
		cwd: options.cwd,
		branch: options.parentBranch,
		signal: options.signal,
	});
	if (!parentTracked.ok) {
		throw new Error(parentTracked.error.message);
	}
	if (!parentTracked.tracked) {
		throw new Error(
			[
				"Current branch is not tracked by Graphite; refusing to stack a branch context on it.",
				`Parent branch: ${options.parentBranch}`,
				"No branch was created and no plan was attached.",
				`Track the parent first (gt track ${options.parentBranch} --parent <its-parent>) or pass --plain-git.`,
				"",
				parentTracked.detail,
			].join("\n"),
		);
	}
	await createPlainGitBranch(git, options);
	const track = await graphite.trackBranch({
		cwd: options.cwd,
		branch: options.branch,
		parentBranch: options.parentBranch,
		signal: options.signal,
	});
	if (!track.ok) {
		throw new Error(
			[
				"Created local Git branch but failed to track it with Graphite.",
				`Branch: ${options.branch}`,
				"No attached plan was stored.",
				"No cleanup was attempted; inspect the created branch manually.",
				"",
				track.error.message,
			].join("\n"),
		);
	}
}

async function resolveCurrentBranch(
	git: GitGateway,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const branch = await git.currentBranch({ cwd, signal });
	if (branch.type === "branch") return branch.branch;
	if (branch.type === "detached") {
		throw new Error(
			"Graphite branch creation requires a named current branch; the current checkout appears to be detached.",
		);
	}
	throw new Error(branch.error.message);
}

function evidenceCreationFromResolvedBasis(
	basis: ResolvedBranchContextBasis,
): BranchContextEvidenceCreation {
	return basis.type === "graphite"
		? { type: "graphite", startRef: basis.startRef, parentBranch: basis.parentBranch }
		: { type: "plain-git", startRef: basis.startRef };
}

function buildEvidence(input: {
	data: BranchContextAttachData;
	slug: string;
	creation: BranchContextEvidenceCreation;
	startPoint: string;
	branchSelection: BranchContextBranchSelection;
	/** Undefined means the source plan had no summary metadata. */
	summary: string | undefined;
}): BranchContextEvidence {
	const evidence = {
		slug: input.slug,
		branch: input.data.branch,
		startPoint: input.startPoint,
		creation: input.creation,
		namespace: input.data.namespace,
		key: input.data.key,
		refName: input.data.refName,
		commit: input.data.commit,
		sourceFile: input.data.sourceFile,
		branchSelection: input.branchSelection,
	};

	if (input.summary === undefined) {
		return evidence;
	}
	return { ...evidence, summary: input.summary };
}

function attachFailureTitle(_code: string): string {
	return "Created branch but failed to attach the plan in Branch Memory.";
}

function partialFailureError(input: {
	title: string;
	branch: string;
	creation: BranchContextEvidenceCreation;
	startPoint: string;
	namespace: string;
	key: string;
	sourceFile: string;
	cause: string;
}): Error {
	return new Error(
		[
			`Partial failure: ${input.title}`,
			`Created branch: ${input.branch}`,
			`Branch creation: ${evidenceCreationMethod(input.creation)}`,
			`Start point: ${input.startPoint}`,
			`Start ref: ${input.creation.startRef}`,
			...(input.creation.type === "graphite"
				? [`Graphite parent: ${input.creation.parentBranch}`]
				: []),
			`Namespace: ${input.namespace}`,
			`Key: ${input.key}`,
			`Source file: ${input.sourceFile}`,
			"No cleanup was attempted; inspect the created branch manually.",
			"",
			trimErrorText(input.cause),
		].join("\n"),
	);
}

function trimErrorText(value: string): string {
	if (value.length <= MAX_ERROR_CHARS) {
		return value;
	}
	return `…${value.slice(-MAX_ERROR_CHARS)}`;
}

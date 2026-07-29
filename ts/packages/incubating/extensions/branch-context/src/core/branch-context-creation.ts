import type { BranchContextAttachData } from "./branch-memory.ts";
import { attachBranchContext, AttachBranchContextError } from "./attach.ts";
import { checkBranchContextEntryPresence, throwBranchContextBrmemError } from "./branch-memory.ts";
import { BRANCH_CONTEXT_NAMESPACE, buildBranchContextPlanKey } from "./constants.ts";
import type { BrmemGateway } from "@nseng-ai/brmem";
import {
	type BranchCreationBasis,
	type BranchCreationEvidence,
	type BranchCreationProvider,
	type BuiltInBranchCreationMode,
} from "@nseng-ai/extension-kit/branch-creation";
import { type CommandExecApi, formatCommand } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { normalizeSummary, resolvePlanSourceFile } from "@nseng-ai/plans";
import type { BranchContextCreationContext } from "./context.ts";

export { BRANCH_CONTEXT_NAMESPACE, buildBranchContextPlanKey } from "./constants.ts";

const MAX_ERROR_CHARS = 4_000;

export function describeBranchContextGraphiteCreationSteps(parentBranch: string): string {
	return `Branch-context Graphite branch creation is \`git branch <target> HEAD\` plus \`gt track <target> --parent ${parentBranch} --no-interactive\`, not \`gt create\`.`;
}

export interface CreateBranchContextFromFileParams {
	slug: string;
	filePath: string;
	branchName?: string;
	basis: BranchCreationBasis;
	summary?: string;
}

export interface CreateBranchContextFromFileOptions {
	cwd: string;
	context: BranchContextCreationContext;
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
	basis: BranchCreationBasis;
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
	branchCreation: BranchCreationProvider;
}

export async function createBranchContextFromFile(
	pi: CommandExecApi,
	params: CreateBranchContextFromFileParams,
	options: CreateBranchContextFromFileOptions,
): Promise<BranchContextEvidence> {
	const operation = buildBranchContextCreateOperation(params);
	const { git, brmem, branchCreation } = options.context;
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
		branchCreation,
		...optionalEntry("signal", options.signal),
	});
}

export async function createBranchContextFromResolvedSource(
	options: CreateBranchContextFromResolvedSourceOptions,
): Promise<BranchContextEvidence> {
	await assertSelectedTargetBranchStillAvailable(options);
	const created = await options.branchCreation.createBranch({
		cwd: options.cwd,
		branch: options.operation.branch,
		basis: options.operation.basis,
		signal: options.signal,
	});
	if (!created.ok)
		throw new BranchContextCreationError(
			created.error.code,
			created.error.message,
			created.error.branchCreated,
		);
	const evidenceCreation = evidenceCreationFromProvider(created.value);

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
			creation: evidenceCreation,
			startPoint: created.value.startPoint,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: options.operation.key,
			sourceFile: options.sourceFile,
			cause: formatErrorMessage(error),
		});
	}

	return buildEvidence({
		data: attach,
		slug: options.operation.slug,
		creation: evidenceCreation,
		startPoint: created.value.startPoint,
		branchSelection: options.operation.branchSelection,
		summary: options.operation.summary,
	});
}

export class BranchContextCreationError extends Error {
	readonly code: string;
	readonly branchCreated: boolean;

	constructor(code: string, message: string, branchCreated: boolean) {
		super(message);
		this.name = "BranchContextCreationError";
		this.code = code;
		this.branchCreated = branchCreated;
	}
}

function evidenceCreationFromProvider(
	evidence: BranchCreationEvidence,
): BranchContextEvidenceCreation {
	if (evidence.relationship.type === "tracked-parent") {
		return {
			type: "graphite",
			startRef: evidence.startRef,
			parentBranch: evidence.relationship.parentBranch,
		};
	}
	return { type: "plain-git", startRef: evidence.startRef };
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
		basis: { ...params.basis },
	};
	if (branch !== slug) operationParams.branchName = branch;
	if (summary !== undefined) operationParams.summary = summary;
	const operation = {
		slug,
		filePath: params.filePath,
		branch,
		basis: { ...params.basis },
		namespace: BRANCH_CONTEXT_NAMESPACE,
		key: buildBranchContextPlanKey(slug),
		params: operationParams,
		branchSelection: exactBranchSelection(branch),
	};
	return summary === undefined ? operation : { ...operation, summary };
}

export async function resolveBranchContextCreatePreviewContext(
	_pi: CommandExecApi,
	options: {
		cwd: string;
		context: BranchContextCreationContext;
		basis: BranchCreationBasis;
		signal?: AbortSignal;
	},
): Promise<BranchContextCreatePreviewContext> {
	const startPoint =
		options.basis.type === "explicit"
			? options.basis.startPoint
			: await resolveStartPoint(options.context.git, options.cwd, options.signal);
	if (options.context.branchCreation.mode === "plain-git") return { type: "plain-git", startPoint };
	return {
		type: "graphite",
		startPoint,
		parent:
			options.basis.type === "explicit" && options.basis.parentBranch !== undefined
				? { type: "resolved", branch: options.basis.parentBranch }
				: { type: "current-parent-unresolved" },
	};
}

export function formatBranchContextCreatePreview(
	operation: BranchContextCreateOperation,
	context: BranchContextCreatePreviewContext,
): string {
	const graphiteParent =
		context.type === "graphite"
			? context.parent.type === "resolved"
				? context.parent.branch
				: "<current-graphite-parent>"
			: undefined;
	const lines = [
		"Target:",
		`Branch: ${operation.branch}`,
		`Branch creation: ${context.type}`,
		...formatBranchSelectionLines(operation.branchSelection),
		`Start point: ${context.startPoint}`,
		`Branch Memory namespace: ${operation.namespace}`,
		`Branch Memory key: ${operation.key}`,
		"",
		"Branch-context operations that would run:",
	];
	if (graphiteParent !== undefined)
		lines.push(formatCommand("gt", ["info", graphiteParent, "--no-interactive"]));
	lines.push(
		formatCommand("git", [
			"branch",
			operation.branch,
			operation.basis.type === "explicit" ? operation.basis.startPoint : "HEAD",
		]),
	);
	if (graphiteParent !== undefined)
		lines.push(
			formatCommand("gt", [
				"track",
				operation.branch,
				"--parent",
				graphiteParent,
				"--no-interactive",
			]),
		);
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
		`Branch creation: ${evidence.creation.type}`,
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
	if (evidence.summary !== undefined) lines.push(`Summary: ${evidence.summary}`);
	return lines.join("\n");
}

export function formatBranchContextCreateFailure(
	operation: BranchContextCreateOperation,
	error: unknown,
	options: { branchCreation: BuiltInBranchCreationMode; consequence?: string },
): string {
	return [
		"Failed to create branch context and attach plan.",
		`Branch: ${operation.branch}`,
		...formatBranchSelectionLines(operation.branchSelection),
		`Branch creation: ${options.branchCreation}`,
		...formatBasisDetails(operation.basis),
		`Namespace: ${operation.namespace}`,
		`Key: ${operation.key}`,
		`Source file: ${operation.filePath}`,
		...(options.consequence === undefined ? [] : [options.consequence]),
		"",
		formatErrorMessage(error),
	].join("\n");
}

function formatBasisDetails(basis: BranchCreationBasis): string[] {
	if (basis.type === "current-head") return [];
	return [
		`Start point: ${basis.startPoint}`,
		`Start ref: ${basis.startRef}`,
		...(basis.parentBranch === undefined ? [] : [`Graphite parent: ${basis.parentBranch}`]),
	];
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

function evidenceCreationMethod(creation: BranchContextEvidenceCreation): string {
	return creation.type;
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

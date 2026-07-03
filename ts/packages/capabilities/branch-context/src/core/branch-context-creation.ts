import type { BranchContextAttachData } from "./branch-memory.ts";
import { assertBrmemEntryAbsent, attachBranchContext, AttachBranchContextError } from "./attach.ts";
import { BRANCH_CONTEXT_NAMESPACE, buildBranchContextPlanKey } from "./constants.ts";
import type { BrmemGateway } from "@ns/brmem";
import type { GraphiteBranchGateway } from "@ns/capability-kit/graphite/branch";
import { type CommandExecApi, formatCommand } from "@ns/core/exec";
import type { GitGateway } from "@ns/capability-kit/git";
import { formatErrorMessage, optionalEntry } from "@ns/core/primitives";
import { normalizeSummary, resolvePlanSourceFile } from "@ns/plans";
import type { BranchContextContext } from "./context.ts";

export { BRANCH_CONTEXT_NAMESPACE, buildBranchContextPlanKey } from "./constants.ts";

const MAX_ERROR_CHARS = 4_000;

export const BRANCH_CREATION_METHODS = ["plain-git", "graphite"] as const;
export type BranchCreationMethod = (typeof BRANCH_CREATION_METHODS)[number];
export const DEFAULT_BRANCH_CREATION_METHOD: BranchCreationMethod = "plain-git";

export function describeBranchContextGraphiteCreationSteps(parentBranch: string): string {
	return `Branch-context Graphite branch creation is \`git branch <target> HEAD\` plus \`gt track <target> --parent ${parentBranch} --no-interactive\`, not \`gt create\`.`;
}

export interface CreateBranchContextFromFileParams {
	slug: string;
	filePath: string;
	branchName?: string;
	branchCreation?: BranchCreationMethod;
	summary?: string;
}

export interface CreateBranchContextFromFileOptions {
	cwd: string;
	context: BranchContextContext;
	signal?: AbortSignal;
}

export interface BranchContextEvidence {
	slug: string;
	branch: string;
	branchCreation: BranchCreationMethod;
	startPoint: string;
	namespace: string;
	key: string;
	refName: string;
	commit: string;
	sourceFile: string;
	summary?: string;
}

export interface BranchContextCreateOperation {
	slug: string;
	filePath: string;
	branch: string;
	branchCreation: BranchCreationMethod;
	namespace: string;
	key: string;
	params: CreateBranchContextFromFileParams;
	summary?: string;
}

export interface BranchContextCreatePreviewContext {
	startPoint: string;
	graphiteParentBranch?: string;
}

export interface CreateBranchContextFromResolvedSourceOptions {
	cwd: string;
	operation: BranchContextCreateOperation;
	sourceFile: string;
	git: GitGateway;
	brmem: BrmemGateway;
	graphite: GraphiteBranchGateway;
	signal?: AbortSignal;
}

export async function createBranchContextFromFile(
	pi: CommandExecApi,
	params: CreateBranchContextFromFileParams,
	options: CreateBranchContextFromFileOptions,
): Promise<BranchContextEvidence> {
	const operation = buildBranchContextCreateOperation(params);
	const { git, brmem, graphite } = options.context;
	await checkBranchRefFormat(git, options.cwd, operation.branch, options.signal);
	const sourceFile = await resolvePlanSourceFile(pi, {
		cwd: options.cwd,
		rawFilePath: operation.filePath,
		...optionalEntry("signal", options.signal),
		git,
	});
	return createBranchContextFromResolvedSource({
		cwd: options.cwd,
		operation,
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
	const startPoint = await resolveStartPoint(options.git, options.cwd, options.signal);
	await assertLocalBranchAbsent(options.git, options.cwd, options.operation.branch, options.signal);
	await assertBrmemEntryAbsent(options.brmem, options.operation.branch, options.operation.key, {
		formatPresentMessage: formatStaleTargetBranchMemoryMessage,
	});
	await createBranchContext(options.git, options.graphite, {
		cwd: options.cwd,
		method: options.operation.branchCreation,
		branch: options.operation.branch,
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
			branchCreation: options.operation.branchCreation,
			startPoint,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: options.operation.key,
			sourceFile: options.sourceFile,
			cause: formatErrorMessage(error),
		});
	}

	return buildEvidence({
		data: attach,
		slug: options.operation.slug,
		branchCreation: options.operation.branchCreation,
		startPoint,
		summary: options.operation.summary,
	});
}

export function buildBranchContextCreateOperation(
	params: CreateBranchContextFromFileParams,
): BranchContextCreateOperation {
	const slug = params.slug.trim();
	const branchCreation = params.branchCreation ?? DEFAULT_BRANCH_CREATION_METHOD;
	const branch = deriveTargetBranch(params.branchName, slug);
	const summary = normalizeSummary(params.summary);
	const operationParams: CreateBranchContextFromFileParams = {
		slug,
		filePath: params.filePath,
		branchCreation,
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
		branchCreation,
		namespace: BRANCH_CONTEXT_NAMESPACE,
		key: buildBranchContextPlanKey(slug),
		params: operationParams,
	};
	if (summary === undefined) {
		return operation;
	}
	return { ...operation, summary };
}

export async function resolveBranchContextCreatePreviewContext(
	_pi: CommandExecApi,
	options: { cwd: string; context: BranchContextContext; signal?: AbortSignal },
): Promise<BranchContextCreatePreviewContext> {
	return { startPoint: await resolveStartPoint(options.context.git, options.cwd, options.signal) };
}

export function formatBranchContextCreatePreview(
	operation: BranchContextCreateOperation,
	context: BranchContextCreatePreviewContext,
): string {
	const graphiteParentBranch = context.graphiteParentBranch ?? "<current-branch>";
	const lines = [
		"Target:",
		`Branch: ${operation.branch}`,
		`Branch creation: ${operation.branchCreation}`,
		`Start point: ${context.startPoint}`,
		`Branch Memory namespace: ${operation.namespace}`,
		`Branch Memory key: ${operation.key}`,
		"",
		"Branch-context operations that would run:",
	];
	if (operation.branchCreation === "graphite") {
		lines.push(formatCommand("gt", ["info", graphiteParentBranch, "--no-interactive"]));
	}
	lines.push(formatCommand("git", ["branch", operation.branch, "HEAD"]));
	if (operation.branchCreation === "graphite") {
		lines.push(
			formatCommand("gt", [
				"track",
				operation.branch,
				"--parent",
				graphiteParentBranch,
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
		`Branch creation: ${evidence.branchCreation}`,
		`Start point: ${evidence.startPoint}`,
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
): string {
	return [
		"Failed to create branch context and attach plan.",
		`Branch: ${operation.branch}`,
		`Branch creation: ${operation.branchCreation}`,
		`Namespace: ${operation.namespace}`,
		`Key: ${operation.key}`,
		`Source file: ${operation.filePath}`,
		"",
		formatErrorMessage(error),
	].join("\n");
}

export function deriveTargetBranch(branchName: string | undefined, slug: string): string {
	const trimmedBranchName = branchName?.trim();
	return trimmedBranchName && trimmedBranchName.length > 0 ? trimmedBranchName : slug;
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

async function assertLocalBranchAbsent(
	git: GitGateway,
	cwd: string,
	targetBranch: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const check = await git.localBranchPresence({ cwd, branch: targetBranch, signal });
	if (check.type === "absent") {
		return;
	}
	if (check.type === "present") {
		throw new Error(
			[
				"Target branch already exists; refusing to overwrite.",
				`Branch: ${targetBranch}`,
				`Ref: ${check.refName}`,
				`Command: ${check.displayCommand}`,
			].join("\n"),
		);
	}
	throw new Error(check.error.message);
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
	method: BranchCreationMethod;
	branch: string;
	signal: AbortSignal | undefined;
}

interface CreatePlainGitBranchOptions {
	cwd: string;
	branch: string;
	signal: AbortSignal | undefined;
}

type CreateGraphiteBranchOptions = CreatePlainGitBranchOptions;

async function createBranchContext(
	git: GitGateway,
	graphite: GraphiteBranchGateway,
	options: CreateBranchContextOptions,
): Promise<void> {
	if (options.method === "graphite") {
		await createGraphiteBranch(git, graphite, options);
		return;
	}
	await createPlainGitBranch(git, options);
}

async function createPlainGitBranch(
	git: GitGateway,
	options: CreatePlainGitBranchOptions,
): Promise<void> {
	const create = await git.createBranchAtHead({
		cwd: options.cwd,
		branch: options.branch,
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
	const parentBranch = await resolveCurrentBranch(git, options.cwd, options.signal);
	const parentTracked = await graphite.checkBranchTracked({
		cwd: options.cwd,
		branch: parentBranch,
		signal: options.signal,
	});
	if (!parentTracked.ok) {
		throw new Error(parentTracked.error.message);
	}
	if (!parentTracked.tracked) {
		throw new Error(
			[
				"Current branch is not tracked by Graphite; refusing to stack a branch context on it.",
				`Parent branch: ${parentBranch}`,
				"No branch was created and no plan was attached.",
				`Track the parent first (gt track ${parentBranch} --parent <its-parent>) or pass --plain-git.`,
				"",
				parentTracked.detail,
			].join("\n"),
		);
	}
	await createPlainGitBranch(git, options);
	const track = await graphite.trackBranch({
		cwd: options.cwd,
		branch: options.branch,
		parentBranch,
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

function buildEvidence(input: {
	data: BranchContextAttachData;
	slug: string;
	branchCreation: BranchCreationMethod;
	startPoint: string;
	summary: string | undefined;
}): BranchContextEvidence {
	const evidence = {
		slug: input.slug,
		branch: input.data.branch,
		branchCreation: input.branchCreation,
		startPoint: input.startPoint,
		namespace: input.data.namespace,
		key: input.data.key,
		refName: input.data.refName,
		commit: input.data.commit,
		sourceFile: input.data.sourceFile,
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
	branchCreation: BranchCreationMethod;
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
			`Branch creation: ${input.branchCreation}`,
			`Start point: ${input.startPoint}`,
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

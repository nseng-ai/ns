import type { BrmemPutData } from "./brmem-gateway.ts";
import { attachBranchContext, assertBrmemEntryAbsent, AttachBranchContextError } from "./attach.ts";
import { BRANCH_CONTEXT_NAMESPACE, buildBranchContextPlanKey } from "./constants.ts";
import type { BranchContextGraphiteGateway } from "./graphite-gateway.ts";
import { formatCommand, type CommandExecApi } from "@asdl/core/exec";
import type { GitGateway } from "@asdl/core/git";
import { formatErrorMessage } from "@asdl/core/primitives";
import { normalizeSummary, resolvePlanSourceFile } from "@asdl/plans";
import type { BranchContextContext } from "./context.ts";

export {
	BRANCH_CONTEXT_LEGACY_PLAN_KEY,
	BRANCH_CONTEXT_NAMESPACE,
	BRANCH_CONTEXT_PLAN_KEY,
	buildBranchContextPlanKey,
} from "./constants.ts";

const MAX_ERROR_CHARS = 4_000;

export const BRANCH_CREATION_METHODS = ["plain-git", "graphite"] as const;
export type BranchCreationMethod = (typeof BRANCH_CREATION_METHODS)[number];
export const DEFAULT_BRANCH_CREATION_METHOD: BranchCreationMethod = "plain-git";

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
	signal?: AbortSignal | undefined;
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

export async function createBranchContextFromFile(
	pi: CommandExecApi,
	params: CreateBranchContextFromFileParams,
	options: CreateBranchContextFromFileOptions,
): Promise<BranchContextEvidence> {
	const operation = buildBranchContextCreateOperation(params);
	const { git, brmem, graphite } = options.context;
	const sourceFile = await resolvePlanSourceFile(pi, {
		cwd: options.cwd,
		rawFilePath: operation.filePath,
		signal: options.signal,
		git,
	});

	await checkBranchRefFormat(git, options.cwd, operation.branch, options.signal);
	const startPoint = await resolveStartPoint(git, options.cwd, options.signal);
	await assertLocalBranchAbsent(git, options.cwd, operation.branch, options.signal);
	await assertBrmemEntryAbsent(brmem, options.cwd, operation.branch, operation.key, options.signal);
	await createBranchContext(git, graphite, {
		cwd: options.cwd,
		method: operation.branchCreation,
		branch: operation.branch,
		signal: options.signal,
	});

	let attach: BrmemPutData;
	try {
		attach = await attachBranchContext({
			brmem,
			cwd: options.cwd,
			branch: operation.branch,
			key: operation.key,
			sourceFile,
			signal: options.signal,
		});
	} catch (error) {
		throw partialFailureError({
			title: attachFailureTitle(error instanceof AttachBranchContextError ? error.code : "unknown"),
			branch: operation.branch,
			branchCreation: operation.branchCreation,
			startPoint,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: operation.key,
			sourceFile,
			cause: formatErrorMessage(error),
		});
	}

	return buildEvidence({
		data: attach,
		slug: operation.slug,
		branchCreation: operation.branchCreation,
		startPoint,
		summary: operation.summary,
	});
}

export function buildBranchContextCreateOperation(
	params: CreateBranchContextFromFileParams,
): BranchContextCreateOperation {
	const slug = params.slug.trim();
	const branchCreation = params.branchCreation ?? DEFAULT_BRANCH_CREATION_METHOD;
	const branch = deriveTargetBranch(params.branchName, slug);
	const branchError = validateTargetBranchName(branch);
	if (branchError !== undefined) {
		throw new Error(`Invalid target branch name: ${branchError}`);
	}

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
	options: { cwd: string; context: BranchContextContext; signal?: AbortSignal | undefined },
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
		"Branch-context commands that would run:",
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
		formatCommand("brmem", [
			"put",
			operation.key,
			"--namespace",
			operation.namespace,
			"--branch",
			operation.branch,
			"--file",
			operation.filePath,
			"--format",
			"json",
		]),
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

export function validateTargetBranchName(branch: string): string | undefined {
	if (branch.length === 0) {
		return "Branch name is required.";
	}
	if (/\s/.test(branch)) {
		return "Branch name must not contain whitespace.";
	}
	if (/[\x00-\x1F\x7F]/.test(branch)) {
		return "Branch name must not contain control characters.";
	}
	if (branch.startsWith("-")) {
		return "Branch name must not start with a hyphen.";
	}
	if (branch.startsWith("/") || branch.endsWith("/")) {
		return "Branch name must not start or end with a slash.";
	}
	if (branch.includes("//")) {
		return "Branch name must not contain consecutive slashes.";
	}
	if (branch.includes("..")) {
		return "Branch name must not contain `..`.";
	}
	if (branch.includes("@{")) {
		return "Branch name must not contain `@{`.";
	}
	if (/[~^:?*[\\]/.test(branch)) {
		return "Branch name must not contain Git ref metacharacters.";
	}
	if (branch.endsWith(".")) {
		return "Branch name must not end with a dot.";
	}
	if (
		branch
			.split("/")
			.some((segment) => segment === "" || segment === "." || segment.endsWith(".lock"))
	) {
		return "Branch name contains an invalid path segment.";
	}

	return undefined;
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

interface CreateGraphiteBranchOptions extends CreatePlainGitBranchOptions {}

async function createBranchContext(
	git: GitGateway,
	graphite: BranchContextGraphiteGateway,
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
	graphite: BranchContextGraphiteGateway,
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
	if (!branch.ok) {
		if (branch.error.code === "detached_head") {
			throw new Error(
				"Graphite branch creation requires a named current branch; the current checkout appears to be detached.",
			);
		}
		throw new Error(branch.error.message);
	}
	return branch.value;
}

function buildEvidence(input: {
	data: BrmemPutData;
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

function attachFailureTitle(code: string): string {
	if (code === "brmem_unavailable") {
		return "Created branch but no brmem command was available to attach the plan.";
	}
	if (code === "brmem_malformed_put" || code === "brmem_unexpected_put_data") {
		return "Created branch but could not parse Branch Memory storage result.";
	}
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

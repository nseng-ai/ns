import {
	RealBranchContextBrmemGateway,
	type BrmemPutData,
	type BranchContextBrmemGateway,
} from "./brmem-gateway.ts";
import { BRANCH_CONTEXT_NAMESPACE, BRANCH_CONTEXT_PLAN_KEY } from "./constants.ts";
import { RealBranchContextGraphiteGateway, type BranchContextGraphiteGateway } from "./graphite-gateway.ts";
import { formatCommand, type CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import { formatErrorMessage, isRecord } from "@asdl/core/primitives";
import { normalizeSummary, resolvePlanSourceFile, validatePlanSlug } from "@asdl/plans";

export { BRANCH_CONTEXT_NAMESPACE, BRANCH_CONTEXT_PLAN_KEY } from "./constants.ts";

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
	signal?: AbortSignal | undefined;
	git?: GitGateway | undefined;
	brmem?: BranchContextBrmemGateway | undefined;
	graphite?: BranchContextGraphiteGateway | undefined;
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
	rawParams: unknown,
	options: CreateBranchContextFromFileOptions,
): Promise<BranchContextEvidence> {
	const operation = buildBranchContextCreateOperation(rawParams);
	const git = options.git ?? new RealGitGateway(pi);
	const brmem = options.brmem ?? new RealBranchContextBrmemGateway(pi);
	const graphite = options.graphite ?? new RealBranchContextGraphiteGateway(pi);
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

	const attach = await attachBranchContext({
		brmem,
		cwd: options.cwd,
		branch: operation.branch,
		key: operation.key,
		sourceFile,
		signal: options.signal,
		skipPresenceCheck: true,
		failureContext: {
			branchCreation: operation.branchCreation,
			startPoint,
		},
	});

	return buildEvidence({ data: attach, slug: operation.slug, branchCreation: operation.branchCreation, startPoint, summary: operation.summary });
}

export function buildBranchContextCreateOperation(rawParams: unknown): BranchContextCreateOperation {
	const params = parseCreateBranchContextFromFileParams(rawParams);
	const slug = params.slug.trim();
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw new Error(`Invalid plan slug: ${slugError}`);
	}

	const branchCreation = params.branchCreation ?? DEFAULT_BRANCH_CREATION_METHOD;
	const branch = deriveTargetBranch(params.branchName, slug);
	const branchError = validateTargetBranchName(branch);
	if (branchError !== undefined) {
		throw new Error(`Invalid target branch name: ${branchError}`);
	}

	const summary = normalizeSummary(params.summary);
	const operationParams: CreateBranchContextFromFileParams = { slug, filePath: params.filePath, branchCreation };
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
		key: BRANCH_CONTEXT_PLAN_KEY,
		params: operationParams,
	};
	if (summary === undefined) {
		return operation;
	}
	return { ...operation, summary };
}

export async function resolveBranchContextCreatePreviewContext(
	pi: CommandExecApi,
	options: { cwd: string; signal?: AbortSignal | undefined; git?: GitGateway | undefined },
): Promise<BranchContextCreatePreviewContext> {
	const git = options.git ?? new RealGitGateway(pi);
	return { startPoint: await resolveStartPoint(git, options.cwd, options.signal) };
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
		lines.push(formatCommand("gt", ["track", operation.branch, "--parent", graphiteParentBranch, "--no-interactive"]));
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

export function formatBranchContextCreateFailure(operation: BranchContextCreateOperation, error: unknown): string {
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

export function parseCreateBranchContextFromFileParams(params: unknown): CreateBranchContextFromFileParams {
	if (!isRecord(params)) {
		throw new Error("createBranchContextFromFile parameters must be an object.");
	}

	const slug = params.slug;
	const filePath = params.filePath;
	const branchName = params.branchName;
	const branchCreation = params.branchCreation;
	const summary = params.summary;
	if (typeof slug !== "string") {
		throw new Error("createBranchContextFromFile requires string parameter `slug`.");
	}
	if (typeof filePath !== "string") {
		throw new Error("createBranchContextFromFile requires string parameter `filePath`.");
	}
	if (branchName !== undefined && typeof branchName !== "string") {
		throw new Error("createBranchContextFromFile parameter `branchName` must be a string when provided.");
	}
	const normalizedBranchCreation = normalizeBranchCreationMethod(branchCreation);
	if (summary !== undefined && typeof summary !== "string") {
		throw new Error("createBranchContextFromFile parameter `summary` must be a string when provided.");
	}
	const parsed: CreateBranchContextFromFileParams = { slug, filePath };
	if (branchName !== undefined) {
		parsed.branchName = branchName;
	}
	if (branchCreation !== undefined) {
		parsed.branchCreation = normalizedBranchCreation;
	}
	if (summary !== undefined) {
		parsed.summary = summary;
	}
	return parsed;
}

export function tryNormalizeBranchCreationMethod(value: unknown): BranchCreationMethod | undefined {
	return BRANCH_CREATION_METHODS.find((method) => method === value);
}

export function normalizeBranchCreationMethod(value: unknown): BranchCreationMethod {
	if (value === undefined) {
		return DEFAULT_BRANCH_CREATION_METHOD;
	}
	const normalized = tryNormalizeBranchCreationMethod(value);
	if (normalized !== undefined) {
		return normalized;
	}
	if (typeof value !== "string") {
		throw new Error("createBranchContextFromFile parameter `branchCreation` must be a string when provided.");
	}
	throw new Error("createBranchContextFromFile parameter `branchCreation` must be one of `plain-git` or `graphite`.");
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
	if (branch.split("/").some((segment) => segment === "" || segment === "." || segment.endsWith(".lock"))) {
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

async function resolveStartPoint(git: GitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
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

export async function assertBrmemEntryAbsent(
	brmem: BranchContextBrmemGateway,
	cwd: string,
	targetBranch: string,
	key: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const check = await brmem.attachmentPresence({ cwd, branch: targetBranch, key, signal });
	if (check.type === "absent") {
		return;
	}
	if (check.type === "present") {
		throw new Error(
			[
				"Attached plan already exists on target branch; refusing to overwrite.",
				`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`,
				`Branch: ${targetBranch}`,
				`Key: ${key}`,
				`Command: ${check.displayCommand}`,
			].join("\n"),
		);
	}
	throw new Error(check.error.message);
}

export interface AttachBranchContextOptions {
	brmem: BranchContextBrmemGateway;
	cwd: string;
	branch: string;
	key: string;
	sourceFile: string;
	signal?: AbortSignal | undefined;
	skipPresenceCheck?: boolean | undefined;
	failureContext?: {
		branchCreation: BranchCreationMethod;
		startPoint: string;
	};
}

export async function attachBranchContext(options: AttachBranchContextOptions): Promise<BrmemPutData> {
	if (options.skipPresenceCheck !== true) {
		await assertBrmemEntryAbsent(options.brmem, options.cwd, options.branch, options.key, options.signal);
	}
	const attach = await options.brmem.attachPlan({
		cwd: options.cwd,
		branch: options.branch,
		key: options.key,
		sourceFile: options.sourceFile,
		signal: options.signal,
	});
	if (attach.ok) {
		return attach.value;
	}
	if (options.failureContext !== undefined) {
		throw partialFailureError({
			title: attachFailureTitle(attach.error.code),
			branch: options.branch,
			branchCreation: options.failureContext.branchCreation,
			startPoint: options.failureContext.startPoint,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: options.key,
			sourceFile: options.sourceFile,
			cause: attach.error.message,
		});
	}
	throw new Error(attach.error.message);
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

async function createBranchContext(git: GitGateway, graphite: BranchContextGraphiteGateway, options: CreateBranchContextOptions): Promise<void> {
	if (options.method === "graphite") {
		await createGraphiteBranch(git, graphite, options);
		return;
	}
	await createPlainGitBranch(git, options);
}

async function createPlainGitBranch(git: GitGateway, options: CreatePlainGitBranchOptions): Promise<void> {
	const create = await git.createBranchAtHead({ cwd: options.cwd, branch: options.branch, signal: options.signal });
	if (!create.ok) {
		throw new Error(create.error.message);
	}
}

async function createGraphiteBranch(git: GitGateway, graphite: BranchContextGraphiteGateway, options: CreateGraphiteBranchOptions): Promise<void> {
	const parentBranch = await resolveCurrentBranch(git, options.cwd, options.signal);
	const parentTracked = await graphite.checkBranchTracked({ cwd: options.cwd, branch: parentBranch, signal: options.signal });
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
	const track = await graphite.trackBranch({ cwd: options.cwd, branch: options.branch, parentBranch, signal: options.signal });
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

async function resolveCurrentBranch(git: GitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const branch = await git.currentBranch({ cwd, signal });
	if (!branch.ok) {
		if (branch.error.code === "detached_head") {
			throw new Error("Graphite branch creation requires a named current branch; the current checkout appears to be detached.");
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


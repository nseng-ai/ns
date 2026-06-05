import { formatCommand, type ExecResult } from "./command-runtime.ts";
import { RealPlannedBranchGitGateway, type PlannedBranchGitGateway } from "./git-gateway.ts";
import {
	formatCommandFailure,
	normalizeSummary,
	parseBrmemPutData,
	resolvePlanSourceFile,
	runBrmem,
	validatePlanSlug,
	type PlanCommandExecApi,
	type BrmemPutData,
	type ExecOptions,
} from "./plan-persistence.ts";

export const PLAN_BRANCH_NAMESPACE = "planned-branch";

const GT_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;

export type BranchCreationMethod = "plain-git" | "graphite";

export interface CreatePlannedBranchFromFileParams {
	slug: string;
	filePath: string;
	branchName?: string;
	branchCreation?: BranchCreationMethod;
	summary?: string;
}

export interface CreatePlannedBranchFromFileOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	git?: PlannedBranchGitGateway | undefined;
}

export interface PlannedBranchEvidence {
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

export interface PlannedBranchCreateOperation {
	slug: string;
	filePath: string;
	branch: string;
	branchCreation: BranchCreationMethod;
	namespace: string;
	key: string;
	params: CreatePlannedBranchFromFileParams;
	summary?: string;
}

export interface PlannedBranchCreatePreviewContext {
	startPoint: string;
	graphiteParentBranch?: string;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

export async function createPlannedBranchFromFile(
	pi: PlanCommandExecApi,
	rawParams: unknown,
	options: CreatePlannedBranchFromFileOptions,
): Promise<PlannedBranchEvidence> {
	const operation = buildPlannedBranchCreateOperation(rawParams);
	const git = options.git ?? new RealPlannedBranchGitGateway(pi);
	const sourceFile = await resolvePlanSourceFile(pi, { cwd: options.cwd, rawFilePath: operation.filePath, signal: options.signal, git });

	await checkBranchRefFormat(git, options.cwd, operation.branch, options.signal);
	const startPoint = await resolveStartPoint(git, options.cwd, options.signal);
	await assertLocalBranchAbsent(git, options.cwd, operation.branch, options.signal);
	await assertBrmemEntryAbsent(pi, options.cwd, operation.branch, operation.key, options.signal);
	await createPlanBranch(pi, git, {
		cwd: options.cwd,
		method: operation.branchCreation,
		branch: operation.branch,
		signal: options.signal,
	});

	const put = await runBrmem(pi, {
		cwd: options.cwd,
		args: ["put", operation.key, "--namespace", operation.namespace, "--branch", operation.branch, "--file", sourceFile, "--format", "json"],
		signal: options.signal,
	});
	if (put.type === "unavailable") {
		throw partialFailureError({
			title: "Created branch but no brmem command was available to attach the plan.",
			branch: operation.branch,
			branchCreation: operation.branchCreation,
			startPoint,
			namespace: operation.namespace,
			key: operation.key,
			sourceFile,
			cause: put.message,
		});
	}
	if (put.result.code !== 0 || put.result.killed) {
		throw partialFailureError({
			title: "Created branch but failed to attach the plan in Branch Memory.",
			branch: operation.branch,
			branchCreation: operation.branchCreation,
			startPoint,
			namespace: operation.namespace,
			key: operation.key,
			sourceFile,
			cause: formatCommandFailure("brmem put failed", put.displayCommand, put.result),
		});
	}

	try {
		const data = parseBrmemPutData(put.result.stdout);
		assertPutDataMatchesCommand(data, { branch: operation.branch, key: operation.key, sourceFile });
		return buildEvidence({ data, slug: operation.slug, branchCreation: operation.branchCreation, startPoint, summary: operation.summary });
	} catch (error) {
		throw partialFailureError({
			title: "Created branch but could not parse Branch Memory storage result.",
			branch: operation.branch,
			branchCreation: operation.branchCreation,
			startPoint,
			namespace: operation.namespace,
			key: operation.key,
			sourceFile,
			cause: error instanceof Error ? error.message : String(error),
		});
	}
}

export function buildPlannedBranchCreateOperation(rawParams: unknown): PlannedBranchCreateOperation {
	const params = parseCreatePlannedBranchFromFileParams(rawParams);
	const slug = params.slug.trim();
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw new Error(`Invalid plan slug: ${slugError}`);
	}

	const branchCreation = params.branchCreation ?? "plain-git";
	const branch = deriveTargetBranch(params.branchName, slug);
	const branchError = validateTargetBranchName(branch);
	if (branchError !== undefined) {
		throw new Error(`Invalid target branch name: ${branchError}`);
	}

	const summary = normalizeSummary(params.summary);
	const operationParams: CreatePlannedBranchFromFileParams = { slug, filePath: params.filePath, branchCreation };
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
		namespace: PLAN_BRANCH_NAMESPACE,
		key: `${slug}.md`,
		params: operationParams,
	};
	if (summary === undefined) {
		return operation;
	}
	return { ...operation, summary };
}

export async function resolvePlannedBranchCreatePreviewContext(
	pi: PlanCommandExecApi,
	options: { cwd: string; signal?: AbortSignal | undefined; git?: PlannedBranchGitGateway | undefined },
): Promise<PlannedBranchCreatePreviewContext> {
	const git = options.git ?? new RealPlannedBranchGitGateway(pi);
	return { startPoint: await resolveStartPoint(git, options.cwd, options.signal) };
}

export function formatPlannedBranchCreatePreview(
	operation: PlannedBranchCreateOperation,
	context: PlannedBranchCreatePreviewContext,
): string {
	const lines = [
		"Target:",
		`Branch: ${operation.branch}`,
		`Branch creation: ${operation.branchCreation}`,
		`Start point: ${context.startPoint}`,
		`Branch Memory namespace: ${operation.namespace}`,
		`Branch Memory key: ${operation.key}`,
		"",
		"Planned-branch commands that would run:",
		formatCommand("git", ["branch", operation.branch, "HEAD"]),
	];
	if (operation.branchCreation === "graphite") {
		lines.push(formatCommand("gt", ["track", operation.branch, "--parent", context.graphiteParentBranch ?? "<current-branch>", "--no-interactive"]));
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

export function formatPlannedBranchEvidence(evidence: PlannedBranchEvidence): string {
	const lines = [
		"Created planned branch and attached plan.",
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

export function formatPlannedBranchCreateFailure(operation: PlannedBranchCreateOperation, error: unknown): string {
	return [
		"Failed to create planned branch and attach plan.",
		`Branch: ${operation.branch}`,
		`Branch creation: ${operation.branchCreation}`,
		`Namespace: ${operation.namespace}`,
		`Key: ${operation.key}`,
		`Source file: ${operation.filePath}`,
		"",
		formatErrorMessage(error),
	].join("\n");
}

export function parseCreatePlannedBranchFromFileParams(params: unknown): CreatePlannedBranchFromFileParams {
	if (!isRecord(params)) {
		throw new Error("createPlannedBranchFromFile parameters must be an object.");
	}

	const slug = params.slug;
	const filePath = params.filePath;
	const branchName = params.branchName;
	const branchCreation = params.branchCreation;
	const summary = params.summary;
	if (typeof slug !== "string") {
		throw new Error("createPlannedBranchFromFile requires string parameter `slug`.");
	}
	if (typeof filePath !== "string") {
		throw new Error("createPlannedBranchFromFile requires string parameter `filePath`.");
	}
	if (branchName !== undefined && typeof branchName !== "string") {
		throw new Error("createPlannedBranchFromFile parameter `branchName` must be a string when provided.");
	}
	const normalizedBranchCreation = normalizeBranchCreationMethod(branchCreation);
	if (summary !== undefined && typeof summary !== "string") {
		throw new Error("createPlannedBranchFromFile parameter `summary` must be a string when provided.");
	}

	const parsed: CreatePlannedBranchFromFileParams = { slug, filePath };
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

export function normalizeBranchCreationMethod(value: unknown): BranchCreationMethod {
	if (value === undefined) {
		return "plain-git";
	}
	if (value === "plain-git" || value === "graphite") {
		return value;
	}
	if (typeof value !== "string") {
		throw new Error("createPlannedBranchFromFile parameter `branchCreation` must be a string when provided.");
	}
	throw new Error("createPlannedBranchFromFile parameter `branchCreation` must be one of `plain-git` or `graphite`.");
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
	git: PlannedBranchGitGateway,
	cwd: string,
	targetBranch: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const refFormat = await git.validateBranchRef({ cwd, branch: targetBranch, signal });
	if (!refFormat.ok) {
		throw new Error(refFormat.error.message);
	}
}

async function resolveStartPoint(git: PlannedBranchGitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const head = await git.headCommit({ cwd, signal });
	if (!head.ok) {
		throw new Error(head.error.message);
	}
	return head.value;
}

async function assertLocalBranchAbsent(
	git: PlannedBranchGitGateway,
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

async function assertBrmemEntryAbsent(
	pi: PlanCommandExecApi,
	cwd: string,
	targetBranch: string,
	key: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const check = await runBrmem(pi, {
		cwd,
		args: ["check", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", targetBranch, "--format", "json"],
		signal,
	});
	if (check.type === "unavailable") {
		throw new Error(check.message);
	}
	if (check.result.killed) {
		throw new Error(formatCommandFailure("brmem check timed out or was killed", check.displayCommand, check.result));
	}
	if (check.result.code === 0) {
		throw new Error(
			[
				"Attached plan already exists on target branch; refusing to overwrite.",
				`Namespace: ${PLAN_BRANCH_NAMESPACE}`,
				`Branch: ${targetBranch}`,
				`Key: ${key}`,
				`Command: ${check.displayCommand}`,
			].join("\n"),
		);
	}
	if (check.result.code !== 1) {
		throw new Error(formatCommandFailure("brmem check failed", check.displayCommand, check.result));
	}
}

interface CreatePlanBranchOptions {
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

async function createPlanBranch(pi: PlanCommandExecApi, git: PlannedBranchGitGateway, options: CreatePlanBranchOptions): Promise<void> {
	if (options.method === "graphite") {
		await createGraphiteBranch(pi, git, options);
		return;
	}
	await createPlainGitBranch(git, options);
}

async function createPlainGitBranch(git: PlannedBranchGitGateway, options: CreatePlainGitBranchOptions): Promise<void> {
	const create = await git.createBranchAtHead({ cwd: options.cwd, branch: options.branch, signal: options.signal });
	if (!create.ok) {
		throw new Error(create.error.message);
	}
}

async function createGraphiteBranch(pi: PlanCommandExecApi, git: PlannedBranchGitGateway, options: CreateGraphiteBranchOptions): Promise<void> {
	const parentBranch = await resolveCurrentBranch(git, options.cwd, options.signal);
	await createPlainGitBranch(git, options);
	const track = await runGt(pi, { cwd: options.cwd, args: ["track", options.branch, "--parent", parentBranch, "--no-interactive"], signal: options.signal });
	if (track.result.code !== 0 || track.result.killed) {
		throw new Error(
			[
				"Created local Git branch but failed to track it with Graphite.",
				`Branch: ${options.branch}`,
				"No attached plan was stored.",
				"No cleanup was attempted; inspect the created branch manually.",
				"",
				formatCommandFailure("gt track failed", track.displayCommand, track.result),
			].join("\n"),
		);
	}
}

async function resolveCurrentBranch(git: PlannedBranchGitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const branch = await git.sourceBranch({ cwd, signal });
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
}): PlannedBranchEvidence {
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

function assertPutDataMatchesCommand(data: BrmemPutData, expected: { branch: string; key: string; sourceFile: string }): void {
	const mismatches: string[] = [];
	if (data.namespace !== PLAN_BRANCH_NAMESPACE) {
		mismatches.push(`namespace ${JSON.stringify(data.namespace)} != ${JSON.stringify(PLAN_BRANCH_NAMESPACE)}`);
	}
	if (data.key !== expected.key) {
		mismatches.push(`key ${JSON.stringify(data.key)} != ${JSON.stringify(expected.key)}`);
	}
	if (data.branch !== expected.branch) {
		mismatches.push(`branch ${JSON.stringify(data.branch)} != ${JSON.stringify(expected.branch)}`);
	}
	if (data.sourceFile !== expected.sourceFile) {
		mismatches.push(`source_file ${JSON.stringify(data.sourceFile)} != ${JSON.stringify(expected.sourceFile)}`);
	}
	if (mismatches.length > 0) {
		throw new Error(`Unexpected brmem put JSON data: ${mismatches.join(", ")}.`);
	}
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

interface RunCommandOptions {
	cwd: string;
	args: string[];
	signal?: AbortSignal | undefined;
}

async function runGt(pi: PlanCommandExecApi, options: RunCommandOptions): Promise<CommandRun> {
	const displayCommand = formatCommand("gt", options.args);
	try {
		const result = await pi.exec("gt", options.args, execOptions(options.cwd, GT_TIMEOUT_MS, options.signal));
		return { result, displayCommand };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`gt command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`);
	}
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function trimErrorText(value: string): string {
	if (value.length <= MAX_ERROR_CHARS) {
		return value;
	}
	return `…${value.slice(-MAX_ERROR_CHARS)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}


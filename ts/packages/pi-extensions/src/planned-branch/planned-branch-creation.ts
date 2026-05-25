import { formatCommand, type ExecResult } from "../command-runtime.ts";
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

export const PLAN_BRANCH_NAMESPACE = "brmem-plans";

const GIT_TIMEOUT_MS = 10_000;
const GT_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;

export type BranchCreationMethod = "plain-git" | "graphite";

export type CreatePlannedBranchFromFileParams = {
	slug: string;
	filePath: string;
	branchName?: string;
	branchCreation?: BranchCreationMethod;
	summary?: string;
};

export type CreatePlannedBranchFromFileOptions = {
	cwd: string;
	signal?: AbortSignal | undefined;
};

export type PlannedBranchEvidence = {
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
};

type CommandRun = {
	result: ExecResult;
	displayCommand: string;
};

export async function createPlannedBranchFromFile(
	pi: PlanCommandExecApi,
	rawParams: unknown,
	options: CreatePlannedBranchFromFileOptions,
): Promise<PlannedBranchEvidence> {
	const params = parseCreatePlannedBranchFromFileParams(rawParams);
	const slug = params.slug.trim();
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw new Error(`Invalid plan slug: ${slugError}`);
	}

	const branchCreation = params.branchCreation ?? "plain-git";
	const targetBranch = deriveTargetBranch(params.branchName, slug);
	const branchError = validateTargetBranchName(targetBranch);
	if (branchError !== undefined) {
		throw new Error(`Invalid target branch name: ${branchError}`);
	}

	const sourceFile = await resolvePlanSourceFile(pi, options.cwd, params.filePath, options.signal);
	const key = `${slug}.md`;

	await checkBranchRefFormat(pi, options.cwd, targetBranch, options.signal);
	const startPoint = await resolveStartPoint(pi, options.cwd, options.signal);
	await assertLocalBranchAbsent(pi, options.cwd, targetBranch, options.signal);
	await assertBrmemEntryAbsent(pi, options.cwd, targetBranch, key, options.signal);
	await createPlanBranch(pi, options.cwd, {
		method: branchCreation,
		branch: targetBranch,
		signal: options.signal,
	});

	const put = await runBrmem(
		pi,
		options.cwd,
		["put", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", targetBranch, "--file", sourceFile, "--format", "json"],
		options.signal,
	);
	if (put.result.code !== 0 || put.result.killed) {
		throw partialFailureError({
			title: "Created branch but failed to attach the plan in Branch Memory.",
			branch: targetBranch,
			branchCreation,
			startPoint,
			namespace: PLAN_BRANCH_NAMESPACE,
			key,
			sourceFile,
			cause: formatCommandFailure("brmem put failed", put.displayCommand, put.result),
		});
	}

	try {
		const data = parseBrmemPutData(put.result.stdout);
		assertPutDataMatchesCommand(data, { branch: targetBranch, key, sourceFile });
		const summary = normalizeSummary(params.summary);
		return buildEvidence({ data, slug, branchCreation, startPoint, summary });
	} catch (error) {
		throw partialFailureError({
			title: "Created branch but could not parse Branch Memory storage result.",
			branch: targetBranch,
			branchCreation,
			startPoint,
			namespace: PLAN_BRANCH_NAMESPACE,
			key,
			sourceFile,
			cause: error instanceof Error ? error.message : String(error),
		});
	}
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
	pi: PlanCommandExecApi,
	cwd: string,
	targetBranch: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const refFormat = await runGit(pi, cwd, ["check-ref-format", "--branch", targetBranch], signal);
	if (refFormat.result.code !== 0 || refFormat.result.killed) {
		throw new Error(formatCommandFailure("git check-ref-format failed", refFormat.displayCommand, refFormat.result));
	}
}

async function resolveStartPoint(pi: PlanCommandExecApi, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const head = await runGit(pi, cwd, ["rev-parse", "HEAD"], signal);
	if (head.result.code !== 0 || head.result.killed) {
		throw new Error(formatCommandFailure("git rev-parse HEAD failed", head.displayCommand, head.result));
	}

	const startPoint = firstNonEmptyLine(head.result.stdout);
	if (startPoint === undefined) {
		throw new Error(`git rev-parse HEAD returned no commit.\nCommand: ${head.displayCommand}`);
	}
	return startPoint;
}

async function assertLocalBranchAbsent(
	pi: PlanCommandExecApi,
	cwd: string,
	targetBranch: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const branchRef = `refs/heads/${targetBranch}`;
	const check = await runGit(pi, cwd, ["rev-parse", "--verify", branchRef], signal);
	if (check.result.killed) {
		throw new Error(formatCommandFailure("git branch existence check was killed", check.displayCommand, check.result));
	}
	if (check.result.code === 0) {
		throw new Error(
			[
				"Target branch already exists; refusing to overwrite.",
				`Branch: ${targetBranch}`,
				`Ref: ${branchRef}`,
				`Command: ${check.displayCommand}`,
			].join("\n"),
		);
	}
	if (check.result.code === 1 || isMissingRevisionResult(check.result)) {
		return;
	}
	throw new Error(formatCommandFailure("git branch existence check failed", check.displayCommand, check.result));
}

async function assertBrmemEntryAbsent(
	pi: PlanCommandExecApi,
	cwd: string,
	targetBranch: string,
	key: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const check = await runBrmem(
		pi,
		cwd,
		["check", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", targetBranch, "--format", "json"],
		signal,
	);
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

async function createPlanBranch(
	pi: PlanCommandExecApi,
	cwd: string,
	input: {
		method: BranchCreationMethod;
		branch: string;
		signal: AbortSignal | undefined;
	},
): Promise<void> {
	if (input.method === "graphite") {
		await createGraphiteBranch(pi, cwd, input.branch, input.signal);
		return;
	}
	await createPlainGitBranch(pi, cwd, input.branch, input.signal);
}

async function createPlainGitBranch(
	pi: PlanCommandExecApi,
	cwd: string,
	targetBranch: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const create = await runGit(pi, cwd, ["branch", targetBranch, "HEAD"], signal);
	if (create.result.code !== 0 || create.result.killed) {
		throw new Error(formatCommandFailure("git branch failed", create.displayCommand, create.result));
	}
}

async function createGraphiteBranch(
	pi: PlanCommandExecApi,
	cwd: string,
	targetBranch: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	const parentBranch = await resolveCurrentBranch(pi, cwd, signal);
	await createPlainGitBranch(pi, cwd, targetBranch, signal);
	const track = await runGt(pi, cwd, ["track", targetBranch, "--parent", parentBranch, "--no-interactive"], signal);
	if (track.result.code !== 0 || track.result.killed) {
		throw new Error(
			[
				"Created local Git branch but failed to track it with Graphite.",
				`Branch: ${targetBranch}`,
				"No attached plan was stored.",
				"No cleanup was attempted; inspect the created branch manually.",
				"",
				formatCommandFailure("gt track failed", track.displayCommand, track.result),
			].join("\n"),
		);
	}
}

async function resolveCurrentBranch(pi: PlanCommandExecApi, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const branch = await runGit(pi, cwd, ["branch", "--show-current"], signal);
	if (branch.result.code !== 0 || branch.result.killed) {
		throw new Error(formatCommandFailure("git branch --show-current failed", branch.displayCommand, branch.result));
	}

	const currentBranch = firstNonEmptyLine(branch.result.stdout);
	if (currentBranch === undefined) {
		throw new Error("Graphite branch creation requires a named current branch; the current checkout appears to be detached.");
	}
	return currentBranch;
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

async function runGit(
	pi: PlanCommandExecApi,
	cwd: string,
	args: string[],
	signal: AbortSignal | undefined,
): Promise<CommandRun> {
	const displayCommand = formatCommand("git", args);
	try {
		const result = await pi.exec("git", args, execOptions(cwd, GIT_TIMEOUT_MS, signal));
		return { result, displayCommand };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`git command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`);
	}
}

async function runGt(
	pi: PlanCommandExecApi,
	cwd: string,
	args: string[],
	signal: AbortSignal | undefined,
): Promise<CommandRun> {
	const displayCommand = formatCommand("gt", args);
	try {
		const result = await pi.exec("gt", args, execOptions(cwd, GT_TIMEOUT_MS, signal));
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

function trimErrorText(value: string): string {
	if (value.length <= MAX_ERROR_CHARS) {
		return value;
	}
	return `…${value.slice(-MAX_ERROR_CHARS)}`;
}

function isMissingRevisionResult(result: ExecResult): boolean {
	if (result.code !== 128) {
		return false;
	}
	const output = `${result.stderr}\n${result.stdout}`;
	return output.includes("Needed a single revision");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstNonEmptyLine(value: string): string | undefined {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

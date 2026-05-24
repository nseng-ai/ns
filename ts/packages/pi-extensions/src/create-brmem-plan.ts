import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { formatCommand, formatOutputSection, tailText, type ExecResult } from "./command-runtime.ts";

export type { ExecResult } from "./command-runtime.ts";

const COMMAND_NAME = "create-brmem-plan";
const TOOL_NAME = "persist_brmem_plan";
const PLAN_NAMESPACE = "plans";
const BRMEM_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;

const GENERIC_SLUG_WORDS = new Set([
	"plan",
	"task",
	"tasks",
	"work",
	"implementation",
	"implement",
	"changes",
	"change",
	"update",
	"updates",
]);

type NotifyLevel = "info" | "warning" | "error" | "success";

type ExecOptions = {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
};

type TextContent = {
	type: "text";
	text: string;
};

type ToolResult = {
	content: TextContent[];
	details?: unknown;
};

export type ToolContext = {
	cwd: string;
};

export type ToolDefinition = {
	name: string;
	label?: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: Record<string, unknown>;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
		ctx: ToolContext,
	): Promise<ToolResult> | ToolResult;
};

export type CommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerTool(definition: ToolDefinition): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendUserMessage(content: string): void;
};

type BrmemCommandCandidate = {
	command: string;
	prefixArgs: string[];
};

type BrmemRun = {
	result: ExecResult;
	displayCommand: string;
};

type PersistBrmemPlanParams = {
	slug: string;
	filePath: string;
	summary?: string;
};

type PersistBrmemPlanDetails = {
	namespace: string;
	key: string;
	slug: string;
	branch: string;
	refName: string;
	commit: string;
	sourceFile: string;
	summary?: string;
};

type BrmemPutData = {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
	commit: string;
	sourceFile: string;
};

export function buildCreateBrmemPlanPrompt(steering: string): string {
	const trimmedSteering = steering.trim();
	const steeringBlock = trimmedSteering
		? `User steering for this planning request:\n\n\`\`\`text\n${trimmedSteering}\n\`\`\``
		: "User steering for this planning request: (none)";

	return `This is a /create-brmem-plan request. Create a detailed implementation plan and persist it into Branch Memory.

${steeringBlock}

Workflow:
1. Inspect the codebase and documentation as needed for the requested work.
2. Produce a detailed Markdown implementation plan.
3. Write the completed plan to a temporary Markdown file outside the repository.
4. Read or otherwise inspect the completed temp file.
5. Choose a semantic slug from the final plan content.
6. Call persist_brmem_plan to store the plan in Branch Memory.
7. Report the persisted Branch Memory namespace, key, branch, ref, and commit.

Durable storage contract:
- Branch Memory namespace: ${PLAN_NAMESPACE}
- Entry key: <semantic-slug>.md
- Branch: current Git branch, as resolved by brmem
- Overwrite behavior: refuse if the entry already exists
- Working-tree behavior: no checked-in plan file is created

Do not create a checked-in plan file. The plan file you create before persistence must live outside the repository, preferably under the OS temp directory.

Slug rules:
- The command did not provide a slug; you must generate the final slug.
- Use kebab-case.
- Use 3–7 words.
- Make it specific to the work described by the final plan.
- Do not use dates or random IDs.
- Do not use generic-only slugs such as plan, task, implementation-plan, or work-plan.

After writing the temp file, read or otherwise inspect the completed file before choosing the slug. Choose the slug from the final plan content, not from the original command text alone.

When the plan is ready, call persist_brmem_plan with:
- slug: the semantic slug, without \`.md\`
- filePath: absolute path to the temp Markdown file
- summary: one-sentence summary of the plan

Exact tool call shape:
\`\`\`json
{
  "slug": "semantic-kebab-case-slug",
  "filePath": "/absolute/path/to/temp-plan.md",
  "summary": "One-sentence summary of the plan."
}
\`\`\`

If persistence fails, stop and surface the error. Do not retry with a different slug unless the error clearly asks for a corrected slug and the corrected slug still reflects the final plan content.`;
}

export function validatePlanSlug(slug: string): string | undefined {
	const normalized = slug.trim();
	if (normalized.length === 0) {
		return "Slug is required.";
	}

	if (normalized.toLowerCase().endsWith(".md")) {
		return "Pass the slug without the .md suffix.";
	}

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
		return "Slug must be lowercase kebab-case using only a-z, 0-9, and single hyphens.";
	}

	if (/^(?:19|20)\d{2}-\d{1,2}-\d{1,2}$/.test(normalized)) {
		return "Slug must not be a date.";
	}

	const tokens = normalized.split("-");
	if (tokens.length < 3) {
		return "Slug must contain at least 3 words.";
	}
	if (tokens.length > 7) {
		return "Slug must contain at most 7 words.";
	}

	if (tokens.some((token) => /^(?:19|20)\d{2}$/.test(token))) {
		return "Slug must not contain date-like year tokens.";
	}

	if (tokens.every((token) => GENERIC_SLUG_WORDS.has(token))) {
		return "Slug must include at least one specific, non-generic word.";
	}

	return undefined;
}

export function normalizePlanFilePath(rawPath: string): string {
	const trimmed = rawPath.trim();
	const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
	return withoutAt;
}

export function isPathInside(parent: string, child: string): boolean {
	const relativePath = relative(resolve(parent), resolve(child));
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export default function createBrmemPlanExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a detailed implementation plan and persist it in branch-scoped Branch Memory.",
		handler: async (args, ctx) => handleCreateBrmemPlanCommand(pi, args, ctx),
	});

	pi.registerTool(buildPersistBrmemPlanTool(pi));
}

async function handleCreateBrmemPlanCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting brmem-backed planning turn…", "info");
	}
	pi.sendUserMessage(buildCreateBrmemPlanPrompt(steering));
}

function buildPersistBrmemPlanTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: TOOL_NAME,
		label: "Persist brmem Plan",
		description:
			"Persist a completed temp Markdown plan into branch-scoped Branch Memory under namespace `plans`. Use only after you have written and reviewed the final plan file and chosen a semantic slug from its content. Refuses to overwrite existing plans.",
		promptSnippet: "Persist a reviewed temp Markdown plan into Branch Memory namespace `plans`.",
		promptGuidelines: [
			"Use persist_brmem_plan only for `/create-brmem-plan` workflows after creating and reviewing a temp plan file.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				slug: {
					type: "string",
					description: "Semantic kebab-case slug without the .md suffix.",
				},
				filePath: {
					type: "string",
					description: "Absolute path to the completed temporary Markdown plan file.",
				},
				summary: {
					type: "string",
					description: "One-sentence summary of the plan.",
				},
			},
			required: ["slug", "filePath"],
		},
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return persistBrmemPlan(pi, params, ctx, signal);
		},
	};
}

async function persistBrmemPlan(
	pi: ExtensionAPI,
	rawParams: unknown,
	ctx: ToolContext,
	signal: AbortSignal | undefined,
): Promise<ToolResult> {
	const params = parsePersistBrmemPlanParams(rawParams);
	const slug = params.slug.trim();
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw new Error(`Invalid Branch Memory plan slug: ${slugError}`);
	}

	const sourceFile = await resolvePlanSourceFile(pi, ctx.cwd, params.filePath, signal);
	const key = `${slug}.md`;

	const check = await runBrmem(pi, ctx.cwd, ["check", key, "--namespace", PLAN_NAMESPACE, "--format", "json"], {
		signal,
	});
	if (check.result.killed) {
		throw new Error(formatCommandFailure("brmem check timed out or was killed", check.displayCommand, check.result));
	}
	if (check.result.code === 0) {
		throw new Error(
			[
				"Branch Memory plan already exists; refusing to overwrite.",
				`Namespace: ${PLAN_NAMESPACE}`,
				`Key: ${key}`,
				`Command: ${check.displayCommand}`,
			].join("\n"),
		);
	}
	if (check.result.code !== 1) {
		throw new Error(formatCommandFailure("brmem check failed", check.displayCommand, check.result));
	}

	const put = await runBrmem(
		pi,
		ctx.cwd,
		["put", key, "--namespace", PLAN_NAMESPACE, "--file", sourceFile, "--format", "json"],
		{ signal },
	);
	if (put.result.code !== 0 || put.result.killed) {
		throw new Error(formatCommandFailure("brmem put failed", put.displayCommand, put.result));
	}

	const data = parseBrmemPutData(put.result.stdout);
	const summary = normalizeSummary(params.summary);
	const details = buildDetails({ data, slug, summary });
	const content = formatSuccessContent(details);

	return {
		content: [{ type: "text", text: content }],
		details,
	};
}

function parsePersistBrmemPlanParams(params: unknown): PersistBrmemPlanParams {
	if (!isRecord(params)) {
		throw new Error("persist_brmem_plan parameters must be an object.");
	}

	const slug = params.slug;
	const filePath = params.filePath;
	const summary = params.summary;
	if (typeof slug !== "string") {
		throw new Error("persist_brmem_plan requires string parameter `slug`.");
	}
	if (typeof filePath !== "string") {
		throw new Error("persist_brmem_plan requires string parameter `filePath`.");
	}
	if (summary !== undefined && typeof summary !== "string") {
		throw new Error("persist_brmem_plan parameter `summary` must be a string when provided.");
	}

	if (summary === undefined) {
		return { slug, filePath };
	}
	return { slug, filePath, summary };
}

async function resolvePlanSourceFile(
	pi: ExtensionAPI,
	cwd: string,
	rawFilePath: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const normalizedPath = normalizePlanFilePath(rawFilePath);
	if (!isAbsolute(normalizedPath)) {
		throw new Error(`Plan file path must be absolute; got ${normalizedPath || "(empty)"}.`);
	}

	let fileStat: Awaited<ReturnType<typeof stat>>;
	try {
		fileStat = await stat(normalizedPath);
	} catch {
		throw new Error(`Plan file does not exist or is not accessible: ${normalizedPath}`);
	}
	if (!fileStat.isFile()) {
		throw new Error(`Plan file must be a regular file: ${normalizedPath}`);
	}

	const realFilePath = await realpathIfPossible(normalizedPath);
	const repoRoot = await resolveGitRepoRoot(pi, cwd, signal);
	if (repoRoot !== undefined) {
		const realRepoRoot = await realpathIfPossible(repoRoot);
		if (isPathInside(realRepoRoot, realFilePath)) {
			throw new Error(`Plan file must be a temp file outside the repository; got ${realFilePath} inside ${realRepoRoot}.`);
		}
	}

	return realFilePath;
}

async function resolveGitRepoRoot(pi: ExtensionAPI, cwd: string, signal: AbortSignal | undefined): Promise<string | undefined> {
	let result: ExecResult;
	try {
		result = await pi.exec("git", ["rev-parse", "--show-toplevel"], execOptions(cwd, GIT_TIMEOUT_MS, signal));
	} catch {
		return undefined;
	}

	if (result.code !== 0 || result.killed) {
		return undefined;
	}

	const root = firstNonEmptyLine(result.stdout);
	return root ? resolve(root) : undefined;
}

async function runBrmem(
	pi: ExtensionAPI,
	cwd: string,
	args: string[],
	options: { signal: AbortSignal | undefined } = { signal: undefined },
): Promise<BrmemRun> {
	const failures: string[] = [];
	for (const candidate of resolveBrmemCommandCandidates(cwd)) {
		const commandArgs = [...candidate.prefixArgs, ...args];
		const displayCommand = formatCommand(candidate.command, commandArgs);
		try {
			const result = await pi.exec(candidate.command, commandArgs, execOptions(cwd, BRMEM_TIMEOUT_MS, options.signal));
			if (isLikelyCommandNotFound(result)) {
				failures.push(formatCommandFailure("brmem command candidate was unavailable", displayCommand, result));
				continue;
			}
			return { result, displayCommand };
		} catch (error) {
			failures.push(formatStartupFailure(displayCommand, error));
		}
	}

	throw new Error(
		[
			"No brmem command available. Tried all configured brmem command candidates.",
			...failures.map((failure) => `\n${failure}`),
		].join("\n"),
	);
}

function resolveBrmemCommandCandidates(cwd: string): BrmemCommandCandidate[] {
	const candidates: BrmemCommandCandidate[] = [];
	const seen = new Set<string>();

	const add = (candidate: BrmemCommandCandidate) => {
		const key = JSON.stringify(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push(candidate);
		}
	};

	const venvRoot = findAncestorContaining(cwd, join(".venv", "bin", "brmem"));
	if (venvRoot) {
		add({ command: join(venvRoot, ".venv", "bin", "brmem"), prefixArgs: [] });
	}

	add({ command: "brmem", prefixArgs: [] });

	const projectRoot = findAncestorContaining(cwd, "pyproject.toml");
	if (projectRoot) {
		add({ command: "uv", prefixArgs: ["run", "--directory", projectRoot, "brmem"] });
	}

	return candidates;
}

function findAncestorContaining(startDir: string, relativePath: string): string | undefined {
	let current = resolve(startDir);
	for (;;) {
		if (existsSync(join(current, relativePath))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

function parseBrmemPutData(stdout: string): BrmemPutData {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Malformed brmem put JSON: ${message}\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
	}

	if (!isRecord(parsed)) {
		throw malformedBrmemPutEnvelope(stdout, "expected an envelope object");
	}

	const envelopeExitCode = parsed.exit_code;
	if (typeof envelopeExitCode === "number" && envelopeExitCode !== 0) {
		throw malformedBrmemPutEnvelope(stdout, `expected envelope exit_code 0, got ${envelopeExitCode}`);
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		throw malformedBrmemPutEnvelope(stdout, "expected a data object");
	}

	const namespace = data.namespace;
	const key = data.key;
	const branch = data.branch;
	const refName = data.ref_name;
	const commit = data.commit;
	const sourceFile = data.source_file;
	if (
		typeof namespace !== "string" ||
		typeof key !== "string" ||
		typeof branch !== "string" ||
		typeof refName !== "string" ||
		typeof commit !== "string" ||
		typeof sourceFile !== "string"
	) {
		throw malformedBrmemPutEnvelope(
			stdout,
			"expected string fields data.namespace, data.key, data.branch, data.ref_name, data.commit, and data.source_file",
		);
	}

	return { namespace, key, branch, refName, commit, sourceFile };
}

function malformedBrmemPutEnvelope(stdout: string, reason: string): Error {
	return new Error(`Malformed brmem put JSON: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
}

function buildDetails(input: { data: BrmemPutData; slug: string; summary: string | undefined }): PersistBrmemPlanDetails {
	const details = {
		namespace: input.data.namespace,
		key: input.data.key,
		slug: input.slug,
		branch: input.data.branch,
		refName: input.data.refName,
		commit: input.data.commit,
		sourceFile: input.data.sourceFile,
	};

	if (input.summary === undefined) {
		return details;
	}
	return { ...details, summary: input.summary };
}

function formatSuccessContent(details: PersistBrmemPlanDetails): string {
	const lines = [
		"Stored Branch Memory plan.",
		`Namespace: ${details.namespace}`,
		`Key: ${details.key}`,
		`Branch: ${details.branch}`,
		`Ref: ${details.refName}`,
		`Commit: ${details.commit}`,
		`Source file: ${details.sourceFile}`,
	];
	if (details.summary !== undefined) {
		lines.push(`Summary: ${details.summary}`);
	}
	return lines.join("\n");
}

function normalizeSummary(summary: string | undefined): string | undefined {
	if (summary === undefined) {
		return undefined;
	}
	const trimmed = summary.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}

function formatCommandFailure(title: string, displayCommand: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	return tailText(
		[
			`${title} (${status}).`,
			`Command: ${displayCommand}`,
			formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
			formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
}

function formatStartupFailure(displayCommand: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return tailText(`brmem command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`, {
		maxChars: MAX_ERROR_CHARS,
		maxLines: 80,
	});
}

function isLikelyCommandNotFound(result: ExecResult): boolean {
	if (result.code !== 127 || result.killed) {
		return false;
	}

	const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
	return output.includes("command not found") || output.includes("not found") || output.includes("no such file");
}

async function realpathIfPossible(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
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

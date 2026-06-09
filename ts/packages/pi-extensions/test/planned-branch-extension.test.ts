import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import registerPlannedBranchExtension, {
	CREATE_PLANNED_BRANCH_USAGE,
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	PLAN_BRANCH_NAMESPACE,
	buildWriteGrilledPlanPrompt,
	buildWritePlanPrompt,
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	formatCreatePlannedBranchPreview,
	formatSavedPlanFileEvidence,
	isPathInside,
	normalizePlanFilePath,
	normalizeRepoOriginUrl,
	parseCreatePlannedBranchArgs,
	validatePlanSlug,
	writeSavedPlanFile,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
	type SavedPlanFileEvidence,
	type ToolContext,
	type ToolDefinition,
} from "../src/planned-branch-extension.ts";
import { buildPlanContentSlugPrompt } from "@asdl/planned-branch";
import { formatPlanBranchEvidence } from "../src/planned-branch-output.ts";
import { buildSavedPlanContentSlugPrompt } from "../src/planned-branch/saved-plan-content-slug.ts";
import { buildSlugModelArgs, SLUG_MODEL_MODEL, SLUG_MODEL_PROVIDER } from "../src/model-slug.ts";
import type { ExecOptions } from "@asdl/plans";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "../../../..");
const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_BRANCH = "source-branch";
const TARGET_BRANCH = "planned-branches/wire-create-planned-branch-command";
const IMPL_BRANCH = `planned-branches/${PLAN_SLUG}`;
const IMPL_REF = `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${IMPL_BRANCH.replaceAll("/", "---")}:${PLAN_KEY}`;
const DEFAULT_PLAN_CONTENT = "# Test Plan\n\nDo the work.\n";
const IMPL_PLAN_CONTENT = "# Impl Plan\n\n- Load the attached plan.\n- Implement from it.\n";
type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type SendMessage = NonNullable<ExtensionAPI["sendMessage"]>;
type SentMessage = Parameters<SendMessage>[0] & { options?: Parameters<SendMessage>[1] };
type ToolUpdate = Parameters<NonNullable<Parameters<ToolDefinition["execute"]>[3]>>[0];

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

type ScriptedExec =
	| {
			command: string;
			args: string[];
			result: Partial<ExecResult>;
	  }
	| {
			command: string;
			args: string[];
			error: Error;
	  };

interface Notification {
	message: string;
	level: string | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly execCalls: ExecCall[] = [];
	readonly sentMessages: SentMessage[] = [];
	readonly sentUserMessages: string[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];
	private readonly events: string[] | undefined;

	constructor(script: ScriptedExec[] = [], events?: string[]) {
		this.script = [...script];
		this.events = events;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if ("error" in expected) {
			throw expected.error;
		}

		return execResult(expected.result);
	}

	sendMessage(message: Parameters<SendMessage>[0], options?: Parameters<SendMessage>[1]): void {
		this.events?.push("message");
		if (options === undefined) {
			this.sentMessages.push(message);
			return;
		}
		this.sentMessages.push({ ...message, options });
	}

	sendUserMessage(content: string): void {
		this.events?.push("send");
		this.sentUserMessages.push(content);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

interface ResolveWritePlanPromptStepOptions {
	content?: string;
	result?: Partial<ExecResult>;
}

function resolveWritePlanPromptStep(options: ResolveWritePlanPromptStepOptions = {}): ScriptedExec {
	const content = options.content ?? DEFAULT_WRITE_PLAN_PROMPT_BODY;
	const result = options.result ?? {};
	return step("asdl", ["exec", "resolve-prompt", "plans-write", "--format", "json"], {
		stdout: JSON.stringify({
			exit_code: 0,
			data: {
				name: "plans-write",
				content,
				provenance: {
					source: "repo",
					repo_prompt_path: `${ROOT}/.asdl/prompts/plans-write.md`,
					prompt_path: `${ROOT}/.asdl/prompts/plans-write.md`,
					default_name: null,
				},
			},
		}),
		...result,
	});
}

function planSlugArgs(content: string): string[] {
	return buildSlugModelArgs(buildPlanContentSlugPrompt(content));
}

function planSlugStep(content: string, slug: string = PLAN_SLUG, result: Partial<ExecResult> = { stdout: `${slug}\n` }): ScriptedExec {
	return step("pi", planSlugArgs(content), result);
}

function planSlugExecCall(content: string): { command: string; args: string[] } {
	return { command: "pi", args: planSlugArgs(content) };
}

function savedPlanSlugArgs(content: string): string[] {
	return buildSlugModelArgs(buildSavedPlanContentSlugPrompt(content));
}

interface SavedPlanSlugStepOptions {
	slug?: string;
	result?: Partial<ExecResult>;
}

function savedPlanSlugStep(content: string, options: SavedPlanSlugStepOptions = {}): ScriptedExec {
	const slug = options.slug ?? PLAN_SLUG;
	const result = options.result ?? { stdout: `${slug}\n` };
	return step("pi", savedPlanSlugArgs(content), result);
}

function contentSlugEvidence(slug: string = PLAN_SLUG): { slug: string; rawOutput: string; provider: string; model: string } {
	return { slug, rawOutput: `${slug}\n`, provider: SLUG_MODEL_PROVIDER, model: SLUG_MODEL_MODEL };
}

function savedPlanFileContent(fileName: string): string {
	return `# ${fileName}\n`;
}

function gitRootStep(root: string = ROOT): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${root}\n` });
}

function gitCurrentBranchStep(branch: string = SOURCE_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n`, ...result });
}

function gitOriginStep(result: Partial<ExecResult> = { stdout: "git@github.com:owner/repo.git\n" }): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], result);
}

function refFormatStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["check-ref-format", "--branch", branch], result);
}

function headStep(result: Partial<ExecResult> = { stdout: `${START_POINT}\n` }): ScriptedExec {
	return step("git", ["rev-parse", "HEAD"], result);
}

function localBranchCheckStep(branch: string, result: Partial<ExecResult>): ScriptedExec {
	return step("git", ["rev-parse", "--verify", `refs/heads/${branch}`], result);
}

function brmemCheckStep(branch: string, key: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["check", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function gitBranchStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", branch, "HEAD"], result);
}

function gtTrackStep(branch: string, parent: string = SOURCE_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("gt", ["track", branch, "--parent", parent, "--no-interactive"], result);
}

function gitCheckoutStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["checkout", branch], result);
}

function brmemPutStep(branch: string, key: string, filePath: string, result: Partial<ExecResult>): ScriptedExec {
	return step(
		"brmem",
		["put", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--file", filePath, "--format", "json"],
		result,
	);
}

function gitSymbolicHeadStep(branch: string = IMPL_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${branch}\n`, ...result });
}

function gitDefaultSymbolicStep(result: Partial<ExecResult> = { stdout: "origin/master\n" }): ScriptedExec {
	return step("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], result);
}

function brmemListStep(branch: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function brmemGetStep(branch: string, key: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["get", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

async function makeTempDir(prefix = "planned-branch-extension-"): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
	tempDirs.push(dir);
	return dir;
}

async function makeNamedPlanFile(fileName = `${PLAN_SLUG}.md`, content = DEFAULT_PLAN_CONTENT): Promise<string> {
	const dir = await makeTempDir();
	const filePath = join(dir, fileName);
	await writeFile(filePath, content, "utf8");
	return filePath;
}

function planStoreDirectory(planStoreRoot: string, sourceBranch: string, origin = "git@github.com:owner/repo.git"): string {
	const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
	const branchKey = encodeBranchForPlanPath(sourceBranch);
	return join(planStoreRoot, repoKey, branchKey);
}

async function writePlanStoreFile(
	directoryPath: string,
	fileName: string,
	modifiedTimeMs: number,
	content = savedPlanFileContent(fileName),
): Promise<string> {
	await mkdir(directoryPath, { recursive: true });
	const filePath = join(directoryPath, fileName);
	await writeFile(filePath, content, "utf8");
	const modified = new Date(modifiedTimeMs);
	await utimes(filePath, modified, modified);
	return filePath;
}

function sourcePlanEvidence(input: { slug: string; filePath: string; sourceBranch: string; origin?: string }): SavedPlanFileEvidence {
	const origin = input.origin ?? "git@github.com:owner/repo.git";
	return {
		slug: input.slug,
		repoRoot: ROOT,
		repoKey: buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin)),
		repoIdentitySource: "origin-url",
		sourceBranch: input.sourceBranch,
		branchKey: encodeBranchForPlanPath(input.sourceBranch),
		filePath: input.filePath,
	};
}

function sourcePlanToolResultEntry(evidence: SavedPlanFileEvidence): unknown {
	return sourcePlanToolResultEntryForTool(evidence, "write_saved_plan_file");
}

function sourcePlanToolResultEntryForTool(evidence: SavedPlanFileEvidence, toolName: string): unknown {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName,
			isError: false,
			content: [],
			details: evidence,
		},
	};
}

function plannedBranchOutputMessageEntry(content: string): unknown {
	return {
		type: "message",
		message: {
			role: "custom",
			customType: "planned-branch-output",
			display: true,
			content,
		},
	};
}

function putEnvelope(input: { branch: string; key: string; filePath: string; commit?: string; refName?: string }): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: PLAN_BRANCH_NAMESPACE,
			key: input.key,
			branch: input.branch,
			ref_name: input.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			commit: input.commit ?? "abc123",
			source_file: input.filePath,
		},
	});
}

function listEnvelope(
	branch: string,
	entries: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>,
): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: PLAN_BRANCH_NAMESPACE,
			key: null,
			branch,
			base: false,
			entries: entries.map((entry) => {
				const entryBranch = entry.branch ?? branch;
				return {
					namespace: entry.namespace ?? PLAN_BRANCH_NAMESPACE,
					key: entry.key,
					branch: entryBranch,
					ref_name: entry.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${entryBranch.replaceAll("/", "---")}:${entry.key}`,
				};
			}),
		},
	});
}

function getEnvelope(input: { branch: string; key: string; content: string; refName?: string }): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: PLAN_BRANCH_NAMESPACE,
			key: input.key,
			branch: input.branch,
			content: input.content,
			ref_name: input.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			target: input.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			at: null,
		},
	});
}

function implLoadSuccessScript(input: { branch?: string; key?: string; content?: string; refName?: string } = {}): ScriptedExec[] {
	const branch = input.branch ?? IMPL_BRANCH;
	const key = input.key ?? PLAN_KEY;
	const content = input.content ?? IMPL_PLAN_CONTENT;
	const listEntry = input.refName === undefined ? { key } : { key, refName: input.refName };
	const getStdout = input.refName === undefined ? getEnvelope({ branch, key, content }) : getEnvelope({ branch, key, content, refName: input.refName });
	return [
		gitRootStep(),
		gitSymbolicHeadStep(branch),
		gitDefaultSymbolicStep(),
		brmemListStep(branch, { stdout: listEnvelope(branch, [listEntry]) }),
		brmemGetStep(branch, key, { stdout: getStdout }),
	];
}

function successScript(input: { branch: string; key: string; filePath: string; putStdout?: string }): ScriptedExec[] {
	return [
		gitRootStep(),
		refFormatStep(input.branch),
		headStep(),
		localBranchCheckStep(input.branch, { code: 1, stderr: "absent" }),
		brmemCheckStep(input.branch, input.key, { code: 1, stderr: "absent" }),
		gitBranchStep(input.branch),
		brmemPutStep(input.branch, input.key, input.filePath, {
			stdout: input.putStdout ?? putEnvelope({ branch: input.branch, key: input.key, filePath: input.filePath }),
		}),
	];
}

function graphiteSuccessScript(input: { branch: string; key: string; filePath: string; putStdout?: string }): ScriptedExec[] {
	return [
		gitRootStep(),
		refFormatStep(input.branch),
		headStep(),
		localBranchCheckStep(input.branch, { code: 1, stderr: "absent" }),
		brmemCheckStep(input.branch, input.key, { code: 1, stderr: "absent" }),
		gitCurrentBranchStep(),
		gitBranchStep(input.branch),
		gtTrackStep(input.branch),
		brmemPutStep(input.branch, input.key, input.filePath, {
			stdout: input.putStdout ?? putEnvelope({ branch: input.branch, key: input.key, filePath: input.filePath }),
		}),
	];
}

function createContext(
	events: string[] = [],
	options: {
		hasUI?: boolean;
		cwd?: string;
		confirm?: (title: string, message?: string) => Promise<boolean>;
		sessionEntries?: unknown[];
		sessionFile?: string;
		shouldCancelNewSession?: boolean;
	} = {},
): {
	ctx: CommandContext;
	notifications: Notification[];
	statuses: Array<{ key: string; value: string | undefined }>;
	replacementUserMessages: string[];
	newSessionParentSessions: Array<string | undefined>;
	waits: () => number;
} {
	const replacementUserMessages: string[] = [];
	const newSessionParentSessions: Array<string | undefined> = [];
	const notifications: Notification[] = [];
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	let waitCount = 0;
	const ui: CommandContext["ui"] = {
		notify(message, level): void {
			events.push("notify");
			notifications.push({ message, level });
		},
		setStatus(key, value): void {
			events.push("status");
			statuses.push({ key, value });
		},
	};
	if (options.confirm !== undefined) {
		ui.confirm = async (title, message) => {
			events.push("confirm");
			return options.confirm?.(title, message) ?? false;
		};
	}

	const ctx: CommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		ui,
		async waitForIdle(): Promise<void> {
			events.push("wait");
			waitCount += 1;
		},
		async newSession(newSessionOptions): Promise<{ cancelled: boolean }> {
			events.push("new-session");
			newSessionParentSessions.push(newSessionOptions?.parentSession);
			if (options.shouldCancelNewSession === true) {
				return { cancelled: true };
			}
			await newSessionOptions?.withSession?.({
				...ctx,
				async sendMessage(): Promise<void> {
					events.push("replacement-message");
				},
				async sendUserMessage(content: string): Promise<void> {
					events.push("replacement-send");
					replacementUserMessages.push(content);
				},
			});
			return { cancelled: false };
		},
	};
	const sessionEntries = options.sessionEntries;
	if (sessionEntries !== undefined || options.sessionFile !== undefined) {
		ctx.sessionManager = {
			getBranch: () => [...(sessionEntries ?? [])],
			getSessionFile: () => options.sessionFile,
		};
	}
	return { ctx, notifications, statuses, replacementUserMessages, newSessionParentSessions, waits: () => waitCount };
}

function createToolContext(options: { hasUI?: boolean; cwd?: string } = {}): {
	ctx: ToolContext;
	statuses: Array<{ key: string; value: string | undefined }>;
} {
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	return {
		ctx: {
			cwd: options.cwd ?? ROOT,
			hasUI: options.hasUI ?? true,
			ui: {
				setStatus(key, value): void {
					statuses.push({ key, value });
				},
			},
		},
		statuses,
	};
}

function registeredTool(pi: FakePi, name = "write_saved_plan_file"): ToolDefinition {
	const tool = pi.tools.get(name);
	expect(tool).toBeDefined();
	if (!tool) {
		throw new Error(`${name} was not registered`);
	}
	return tool;
}

describe("validatePlanSlug", () => {
	test("accepts specific 3-7 word kebab slugs", () => {
		for (const slug of [
			"branch-scoped-plan-extension",
			"attached-plan-command",
			"semantic-plan-persistence-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeUndefined();
		}
	});

	test("rejects invalid slug shapes", () => {
		for (const slug of [
			"",
			"Branch-Scoped-Plan",
			"branch scoped plan",
			"branch-scoped-plan.md",
			"attached-plan",
			"one-two-three-four-five-six-seven-eight",
			"implementation-plan-task",
			"branch-2026-plan-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeDefined();
		}
	});
});

describe("source branch plan path helpers", () => {
	test("normalizes repository origin URLs deterministically", () => {
		expect(normalizeRepoOriginUrl("git@github.com:owner/repo.git")).toBe("ssh://git@github.com/owner/repo");
		expect(normalizeRepoOriginUrl("HTTPS://github.com/Owner/Repo.git")).toBe("https://github.com/Owner/Repo");
		expect(normalizeRepoOriginUrl("https://github.com/owner/repo.git///")).toBe("https://github.com/owner/repo");
	});

	test("encodes branch names as one safe path segment", () => {
		expect(encodeBranchForPlanPath("main")).toBe("main");
		expect(encodeBranchForPlanPath("planned-branches/add-widget")).toBe("planned-branches---add-widget");
		expect(encodeBranchForPlanPath("feature/add widget+docs")).toBe("feature---add-widget-docs");
	});

	test("builds GitHub repo plan store repo keys from owner and repo", () => {
		const scpLike = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@github.com:owner/repo.git"));
		const https = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("https://github.com/owner/repo.git"));
		const mixedCaseHttps = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("HTTPS://github.com/Owner/Repo.git"));
		const different = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@github.com:owner/other.git"));

		expect(scpLike).toBe("gh--owner--repo");
		expect(https).toBe(scpLike);
		expect(mixedCaseHttps).toBe(scpLike);
		expect(different).toBe("gh--owner--other");
	});

	test("builds deterministic non-GitHub fallback plan store repo keys without hashes", () => {
		expect(buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@gitlab.com:Owner/Repo.git"))).toBe(
			"ssh-git-gitlab.com-Owner-Repo",
		);
		expect(buildRepoPlanStoreKey("/repo", "/repo")).toBe("repo");
	});

	test("finds the newest saved Markdown plan file", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "planned-branches/add-widget";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "older-source-plan.md", 1_700_000_000_000);
		const newestPath = await writePlanStoreFile(directoryPath, "newer-source-plan.md", 1_800_000_000_000);
		await writePlanStoreFile(directoryPath, "ignored-source-plan.txt", 1_900_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const evidence = await findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot });

		pi.assertDone();
		expect(evidence).toMatchObject({
			slug: "newer-source-plan",
			filePath: newestPath,
			fileName: "newer-source-plan.md",
			repoKey: "gh--owner--repo",
			sourceBranch,
			branchKey: "planned-branches---add-widget",
			directoryPath,
		});
	});

	test("reports a clear error when the local plan store directory is missing", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		await expect(findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot })).rejects.toThrow(
			/No local plan store directory exists[\s\S]*Create a saved plan first/,
		);
		pi.assertDone();
	});

	test("reports a clear error when no Markdown saved plans exist", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await mkdir(directoryPath, { recursive: true });
		await writeFile(join(directoryPath, "notes.txt"), "not a plan", "utf8");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		await expect(findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot })).rejects.toThrow(
			/No Markdown saved plan files exist[\s\S]*Create a saved plan first/,
		);
		pi.assertDone();
	});

	test("treats the latest filename stem as a locator even when it is not a valid branch slug", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "valid-source-plan.md", 1_700_000_000_000);
		const latestPath = await writePlanStoreFile(directoryPath, "bad.md", 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const evidence = await findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot });

		pi.assertDone();
		expect(evidence.slug).toBe("bad");
		expect(evidence.filePath).toBe(latestPath);
	});

	test("tie-breaks exact matching mtimes by filename path", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "alpha-source-plan.md", 1_800_000_000_000);
		const expectedPath = await writePlanStoreFile(directoryPath, "zeta-source-plan.md", 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const evidence = await findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot });

		pi.assertDone();
		expect(evidence.slug).toBe("zeta-source-plan");
		expect(evidence.filePath).toBe(expectedPath);
	});

});

describe("planned-branch:create argument parsing", () => {
	test("parses empty args and supported flags", () => {
		expect(parseCreatePlannedBranchArgs("")).toEqual({ help: false, dryRun: false, yes: false });
		expect(parseCreatePlannedBranchArgs("--dry-run --yes --graphite --branch planned-branches/add-widget /tmp/my-source-plan.md")).toEqual({
			help: false,
			dryRun: true,
			yes: true,
			branchCreation: "graphite",
			branchName: "planned-branches/add-widget",
			filePath: "/tmp/my-source-plan.md",
		});
		expect(parseCreatePlannedBranchArgs("-y --plain-git --branch=planned-branches/add-widget @/tmp/my-source-plan.md")).toEqual({
			help: false,
			dryRun: false,
			yes: true,
			branchCreation: "plain-git",
			branchName: "planned-branches/add-widget",
			filePath: "@/tmp/my-source-plan.md",
		});
		expect(parseCreatePlannedBranchArgs("--help").help).toBe(true);
		expect(parseCreatePlannedBranchArgs("-h").help).toBe(true);
	});

	test("rejects parse errors before mutation", () => {
		expect(() => parseCreatePlannedBranchArgs("--graphite --plain-git")).toThrow("Cannot pass both");
		expect(() => parseCreatePlannedBranchArgs("--unknown")).toThrow("Unknown flag");
		expect(() => parseCreatePlannedBranchArgs("--branch")).toThrow("Missing value");
		expect(() => parseCreatePlannedBranchArgs("/tmp/one.md /tmp/two.md")).toThrow("at most one");
	});
});

describe("buildWritePlanPrompt", () => {
	test("includes local plan store instructions without branch creation", () => {
		const prompt = buildWritePlanPrompt("add a tiny docs note plan for testing");

		expect(prompt).toContain("/plans:write request");
		expect(prompt).toContain("add a tiny docs note plan for testing");
		expect(prompt).toContain("write_saved_plan_file");
		expect(prompt).toContain("~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md");
		expect(prompt).toContain("completely fresh downstream implementation session");
		expect(prompt).toContain("self-contained");
		expect(prompt).toContain("Do not rely on this conversation");
		expect(prompt).toContain("Embed all relevant context discovered during planning");
		expect(prompt).toContain("External research/context contract");
		expect(prompt).toContain("web searches");
		expect(prompt).toContain("GitHub issues/PRs");
		expect(prompt).toContain("Do not merely link to external resources");
		expect(prompt).toContain("Do not include secrets");
		expect(prompt).toContain("Recommended saved plan sections");
		expect(prompt).toContain("External/off-repo research context");
		expect(prompt).toContain("Validation commands and expected results");
		expect(prompt).toContain("do not generate or pass a slug");
		expect(prompt).toContain("Codex-backed slug model");
		expect(prompt).toContain('"content": "# Plan');
		expect(prompt).not.toContain('"slug": "semantic-kebab-case-slug"');
		expect(prompt).not.toContain("create_brmem_plan_branch_from_file");
		expect(prompt).not.toContain("branchCreation");
	});

	test("renders empty steering as none", () => {
		expect(buildWritePlanPrompt("   ")).toContain("User steering for this planning request: (none)");
	});

	test("uses custom static prompt body without changing dynamic header", () => {
		const prompt = buildWritePlanPrompt("steer me", "Custom plan body\n");

		expect(prompt).toBe(`This is a /plans:write request. Write a detailed implementation plan and save it in the local plan store.\n\nUser steering for this planning request:\n\n\`\`\`text\nsteer me\n\`\`\`\n\nCustom plan body\n`);
	});

	test("checked-in write-plan prompt policy is an intentional repo override", async () => {
		const promptPath = join(REPO_ROOT, ".asdl", "prompts", "plans-write.md");
		const checkedInContent = await readFile(promptPath, "utf8");

		expect(checkedInContent).not.toBe(DEFAULT_WRITE_PLAN_PROMPT_BODY);
		expect(DEFAULT_WRITE_PLAN_PROMPT_BODY).not.toContain("Subagent orchestration opportunities:");
		expect(checkedInContent).toContain("Subagent orchestration opportunities:");
		expect(checkedInContent).toContain(
			"`Subagent orchestration opportunities: none` with a one-sentence rationale",
		);
		expect(checkedInContent).toContain("launch-readiness quality bar");
		expect(checkedInContent).toContain("Prefer ordered waves");
		expect(checkedInContent).toContain("recommend sequential dispatch and parent validation");
		expect(checkedInContent).toContain("Subagent model routing:");
		expect(checkedInContent).toContain("For implementation/editing subagents:");
		expect(checkedInContent).toContain(
			"Do not set `dispatch_runner_subagent.model` to a cheap/review model.",
		);
		expect(checkedInContent).toContain("Never reuse review model guidance for implementation");
		expect(checkedInContent).toContain("Closeout review plan:");
		expect(checkedInContent).toContain(
			"exactly one in-session style review subagent per applicable review family",
		);
		expect(checkedInContent).toContain(
			"exclusively for review-only subagents after implementation is complete",
		);
		expect(checkedInContent).toContain("single in-session `typescript-style` review subagent");
		expect(checkedInContent).toContain("single in-session `dignified-python` review subagent");
		expect(checkedInContent).toContain(
			"Do not tell the implementation agent to repeat TypeScript/Python style review subagents",
		);
		expect(checkedInContent).toContain("the final PR review is the final style/quality checkstep");
		expect(checkedInContent).not.toContain(
			"repeat the relevant in-session review subagent after easy fixes",
		);
		expect(checkedInContent).toContain("dispatch_runner_subagent.model");
		expect(checkedInContent).toContain("default_model");
		expect(checkedInContent).toContain("openai-codex/gpt-5.4-mini:medium");
	});
});

describe("buildWriteGrilledPlanPrompt", () => {
	test("includes structured grill requirements and save/no-save contract", () => {
		const prompt = buildWriteGrilledPlanPrompt("plan the grilled command variant");

		expect(prompt).toContain("/plans:grill-and-write");
		expect(prompt).toContain("plan the grilled command variant");
		expect(prompt).toContain("write_saved_plan_file");
		expect(prompt).toContain("grill_ask");
		expect(prompt).toContain("3–7");
		expect(prompt).toContain("Inspect repository evidence before asking");
		expect(prompt).toContain("If grill_ask is unavailable");
		expect(prompt).toContain("ui_unavailable");
		expect(prompt).toContain("status_request");
		expect(prompt).toContain("end_grill");
		expect(prompt).toContain("do not call write_saved_plan_file");
		expect(prompt).toContain("material requirements remain unresolved");
		expect(prompt).toContain("do not save");
		expect(prompt).toContain("Do not include a full Q&A transcript or special Q&A section");
		expect(prompt).toContain("Do not create a branch or write Branch Memory");
		expect(prompt).not.toContain("GRILL_UI_CONTRACT");
	});

	test("renders empty steering as none", () => {
		expect(buildWriteGrilledPlanPrompt("   ")).toContain("User steering for this planning request: (none)");
	});
});

describe("formatCreatePlannedBranchPreview", () => {
	test("reports latest saved plan and target details", () => {
		const text = formatCreatePlannedBranchPreview({
			mode: "latest",
			slug: PLAN_SLUG,
			savedPlanFileStem: "local-filename-plan",
			filePath: `/plans/gh--owner--repo/main/local-filename-plan.md`,
			fileName: "local-filename-plan.md",
			targetBranch: TARGET_BRANCH,
			branchCreation: "graphite",
			slugEvidence: contentSlugEvidence(),
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "main",
			branchKey: "main",
			modifiedTimeMs: 1_800_000_000_000,
		});

		expect(text).toContain("Latest saved plan from local plan store:");
		expect(text).toContain("Path: /plans/gh--owner--repo/main/local-filename-plan.md");
		expect(text).toContain("Saved-plan file stem: local-filename-plan");
		expect(text).toContain(`Content-derived slug: ${PLAN_SLUG}`);
		expect(text).toContain(`Slug model: ${SLUG_MODEL_PROVIDER}/${SLUG_MODEL_MODEL}`);
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain("Modified: 2027-01-15T08:00:00.000Z");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Branch Memory key: ${PLAN_KEY}`);
	});

	test("reports session-derived latest saved plan", () => {
		const text = formatCreatePlannedBranchPreview({
			mode: "session",
			slug: PLAN_SLUG,
			savedPlanFileStem: "session-file-plan",
			filePath: `/plans/gh--owner--repo/main/session-file-plan.md`,
			fileName: "session-file-plan.md",
			targetBranch: TARGET_BRANCH,
			branchCreation: "plain-git",
			slugEvidence: contentSlugEvidence(),
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "main",
			branchKey: "main",
			modifiedTimeMs: 1_800_000_000_000,
		});

		expect(text).toContain("Saved plan from current session:");
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain("Source branch: main");
		expect(text).toContain("Modified: 2027-01-15T08:00:00.000Z");
	});
});

describe("formatPlanBranchEvidence", () => {
	test("reports all created branch and Branch Memory evidence", () => {
		const text = formatPlanBranchEvidence({
			slug: PLAN_SLUG,
			branch: TARGET_BRANCH,
			branchCreation: "graphite",
			startPoint: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/planned-branches---wire-create-planned-branch-command:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: "/tmp/plan.md",
			summary: "Plan the branch-creating flow.",
		});

		expect(text).toContain("Created planned branch and attached plan.");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Start point: ${START_POINT}`);
		expect(text).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain("Ref: refs/brmem/ns/planned-branch/planned-branches---wire-create-planned-branch-command");
		expect(text).toContain("Commit: abc123");
		expect(text).toContain("Source file: /tmp/plan.md");
		expect(text).toContain("Summary: Plan the branch-creating flow.");
	});
});

describe("formatSavedPlanFileEvidence", () => {
	test("reports all local plan store evidence", () => {
		const text = formatSavedPlanFileEvidence({
			slug: PLAN_SLUG,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "planned-branches/add-widget",
			branchKey: "planned-branches---add-widget",
			filePath: "/plans/gh--owner--repo/planned-branches---add-widget/branch-scoped-plan-extension.md",
			summary: "Plan the local plan store file.",
		});

		expect(text).toContain("Saved plan file in local plan store.");
		expect(text).toContain("Path: /plans/gh--owner--repo/planned-branches---add-widget/branch-scoped-plan-extension.md");
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain(`Repo root: ${ROOT}`);
		expect(text).toContain("Repo identity source: origin-url");
		expect(text).toContain("Source branch: planned-branches/add-widget");
		expect(text).toContain("Branch path segment: planned-branches---add-widget");
		expect(text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(text).toContain("Summary: Plan the local plan store file.");
	});
});

describe("isPathInside", () => {
	test("handles sibling prefixes correctly", () => {
		expect(isPathInside("/repo", "/repo/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo/nested/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo-other/file.md")).toBe(false);
		expect(isPathInside("/repo", "/repo2/file.md")).toBe(false);
	});
});

describe("normalizePlanFilePath", () => {
	test("strips leading @ and expands current-user home shorthand", () => {
		const scenarioPath = join(homedir(), ".claude", "plans", "where-would-we-host-mossy-lampson.md");

		expect(normalizePlanFilePath("@/tmp/my-source-plan.md")).toBe("/tmp/my-source-plan.md");
		expect(normalizePlanFilePath("~")).toBe(homedir());
		expect(normalizePlanFilePath("~/.claude/plans/where-would-we-host-mossy-lampson.md")).toBe(scenarioPath);
		expect(normalizePlanFilePath("@~/.claude/plans/where-would-we-host-mossy-lampson.md")).toBe(scenarioPath);
		expect(normalizePlanFilePath("relative-source-plan.md")).toBe("relative-source-plan.md");
	});
});

describe("plan workflow commands", () => {
	test("registers plans write commands, planned-branch workflow commands, and write tool", () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"planned-branch:create",
			"planned-branch:impl",
			"planned-branch:up-and-impl",
			"plans:grill-and-write",
			"plans:write",
		]);
		expect([...pi.commands.keys()].filter((name) => name.startsWith("plans:"))).toEqual(["plans:write", "plans:grill-and-write"]);
		expect(pi.tools.has("write_saved_plan_file")).toBe(true);
		expect([...pi.tools.keys()]).toEqual(["write_saved_plan_file"]);
	});

	test("plans:grill-and-write waits for idle and dispatches embedded prompt without prompt resolution", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:grill-and-write");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  plan the grilled command variant  ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([buildWriteGrilledPlanPrompt("plan the grilled command variant")]);
		expect(pi.sentUserMessages[0]).toContain("grill_ask");
		expect(pi.sentUserMessages[0]).toContain("write_saved_plan_file");
		expect(context.notifications).toEqual([
			{ message: "Starting /plans:grill-and-write planning grill…", level: "info" },
		]);
	});

	test("plans:grill-and-write with empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:grill-and-write");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWriteGrilledPlanPrompt("")]);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("plans:write waits for idle, resolves prompt, and dispatches the generated prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([resolveWritePlanPromptStep()], events);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  add a tiny docs note plan for testing  ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.execCalls).toEqual([
			{
				command: "asdl",
				args: ["exec", "resolve-prompt", "plans-write", "--format", "json"],
				options: { cwd: ROOT, timeout: 10_000 },
			},
		]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toBe(buildWritePlanPrompt("add a tiny docs note plan for testing"));
		expect(pi.sentUserMessages[0]).toContain("write_saved_plan_file");
		expect(pi.sentUserMessages[0]).toContain("~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md");
		expect(pi.sentUserMessages[0]).toContain("completely fresh downstream implementation session");
		expect(pi.sentUserMessages[0]).toContain("External research/context contract");
		expect(pi.sentUserMessages[0]).not.toContain("create_brmem_plan_branch_from_file");
		expect(pi.sentUserMessages[0]).not.toContain("branchCreation");
		expect(context.notifications).toEqual([{ message: "Starting /plans:write planning turn…", level: "info" }]);
	});

	test("plans:write with empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep()]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("plans:write uses custom resolved prompt body", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep({ content: "Custom plan body\n" })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		const context = createContext();

		await command?.handler("customize this", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("customize this", "Custom plan body\n")]);
		expect(context.notifications).toEqual([{ message: "Starting /plans:write planning turn…", level: "info" }]);
	});

	test("plans:write falls back and warns when resolver fails", async () => {
		const pi = new FakePi([
			resolveWritePlanPromptStep({ result: { code: 1, stdout: "", stderr: "prompt_not_found: missing" } }),
		]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		const context = createContext();

		await command?.handler("fallback please", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("fallback please")]);
		expect(context.notifications).toEqual([
			{ message: "Starting /plans:write planning turn…", level: "info" },
			{
				message:
					"Falling back to built-in /plans:write prompt body because asdl exec resolve-prompt failed with exit code 1: prompt_not_found: missing",
				level: "warning",
			},
		]);
	});

	test("plans:write falls back without UI warning when resolver returns malformed JSON", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep({ result: { stdout: "not json" } })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		const context = createContext([], { hasUI: false });

		await command?.handler("malformed", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("malformed")]);
		expect(context.notifications).toEqual([]);
	});

	test("planned-branch:impl waits, loads the attached plan, and sends an implementation prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi(implLoadSuccessScript({ refName: IMPL_REF }), events);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:impl");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["symbolic-ref", "--short", "HEAD"] },
			{ command: "git", args: ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"] },
			{ command: "brmem", args: ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", IMPL_BRANCH, "--format", "json"] },
			{ command: "brmem", args: ["get", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", IMPL_BRANCH, "--format", "json"] },
		]);
		expect(context.notifications).toEqual([{ message: "Loading attached planned-branch plan…", level: "info" }]);
		expect(context.statuses).toEqual([
			{ key: "planned-branch:impl", value: "loading attached plan…" },
			{ key: "planned-branch:impl", value: undefined },
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.customType).toBe("planned-branch-output");
		expect(pi.sentMessages[0]?.content).toContain("Loaded attached planned-branch plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentMessages[0]?.content).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(pi.sentMessages[0]?.content).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain(`Ref: ${IMPL_REF}`);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("The attached planned-branch plan has been loaded by the planning-layer reader.");
		expect(pi.sentUserMessages[0]).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentUserMessages[0]).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(pi.sentUserMessages[0]).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentUserMessages[0]).toContain(`Ref: ${IMPL_REF}`);
		expect(pi.sentUserMessages[0]).toContain(`Bytes: ${new TextEncoder().encode(IMPL_PLAN_CONTENT).length}`);
		expect(pi.sentUserMessages[0]).toContain(IMPL_PLAN_CONTENT);
		expect(pi.sentUserMessages[0]).toContain("Create an implementation checklist");
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("planned-branch:impl passes a requested slug into attached-plan selection", async () => {
		const pi = new FakePi(implLoadSuccessScript());
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:impl");
		const context = createContext();

		await command?.handler(`  ${PLAN_SLUG}  `, context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("planned-branch:impl falls back to the latest saved plan when no plan is attached", async () => {
		const planStoreRoot = await makeTempDir("impl-source-plan-store-");
		const directoryPath = planStoreDirectory(planStoreRoot, SOURCE_BRANCH);
		const planContent = "# Saved Impl Plan\n\n- Implement from the saved plan.\n";
		const filePath = await writePlanStoreFile(directoryPath, PLAN_KEY, 1_800_000_000_000, planContent);
		const pi = new FakePi([
			gitRootStep(),
			gitSymbolicHeadStep(SOURCE_BRANCH),
			gitDefaultSymbolicStep(),
			brmemListStep(SOURCE_BRANCH, { stdout: listEnvelope(SOURCE_BRANCH, []) }),
			gitRootStep(),
			gitCurrentBranchStep(SOURCE_BRANCH),
			gitOriginStep(),
		]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:impl");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Loaded saved planned-branch plan from local plan store.");
		expect(pi.sentMessages[0]?.content).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain(`Ref: ${filePath}`);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("The saved planned-branch plan from the local plan store has been loaded");
		expect(pi.sentUserMessages[0]).toContain(`Namespace: local-plan-store`);
		expect(pi.sentUserMessages[0]).toContain(`Ref: ${filePath}`);
		expect(pi.sentUserMessages[0]).toContain(`----- BEGIN SAVED PLAN -----\n${planContent}\n----- END SAVED PLAN -----`);
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("planned-branch:impl presents load failures without sending an implementation prompt", async () => {
		const pi = new FakePi([gitRootStep(), gitSymbolicHeadStep("main"), gitDefaultSymbolicStep({ stdout: "origin/main\n" })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:impl");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.customType).toBe("planned-branch-output");
		expect(pi.sentMessages[0]?.content).toContain("Failed to load planned-branch plan.");
		expect(pi.sentMessages[0]?.content).toContain("Refusing to implement directly on trunk (`main`)");
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
		expect(context.statuses.at(-1)).toEqual({ key: "planned-branch:impl", value: undefined });
	});

	test("planned-branch:create help displays usage without mutation", async () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");
		const context = createContext();

		await command?.handler("--help", context.ctx);

		expect(context.waits()).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(CREATE_PLANNED_BRANCH_USAGE);
	});

	test("planned-branch:create dry-run resolves latest local plan store without mutating", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const filePath = await writePlanStoreFile(directoryPath, `${PLAN_KEY}`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep(), planSlugStep(savedPlanFileContent(PLAN_KEY))]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext();

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "git", args: ["config", "--get", "remote.origin.url"] },
			planSlugExecCall(savedPlanFileContent(PLAN_KEY)),
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Dry run: no branch was created and no plan was attached.");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${filePath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(context.statuses.at(-1)).toEqual({ key: "planned-branch:create", value: undefined });
	});

	test("planned-branch:create dry-run prefers session-created plan over newer disk mtime", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const newerDiskSlug = "harden-cp-autobranch-validation";
		const sessionKey = `${sessionSlug}.md`;
		const contentSlug = "add-session-planned-branch";
		const sessionPath = await writePlanStoreFile(directoryPath, sessionKey, 1_700_000_000_000);
		await writePlanStoreFile(directoryPath, `${newerDiskSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep(), planSlugStep(savedPlanFileContent(sessionKey), contentSlug)]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Saved plan from current session:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${sessionPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${sessionSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${contentSlug}.md`);
		expect(pi.sentMessages[0]?.content).not.toContain(`${newerDiskSlug}.md`);
	});

	test("planned-branch:create explicit path wins over session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const explicitSlug = "harden-cp-autobranch-validation";
		const sessionPath = await writePlanStoreFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const explicitKey = `${explicitSlug}.md`;
		const contentSlug = "add-docs-portal-site";
		const explicitPath = await writePlanStoreFile(directoryPath, explicitKey, 1_800_000_000_000);
		const pi = new FakePi([planSlugStep(savedPlanFileContent(explicitKey), contentSlug)]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }))],
		});

		await command?.handler(`--dry-run ${explicitPath}`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(savedPlanFileContent(explicitKey))]);
		expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${explicitPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${explicitSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain("Saved plan from current session:");
	});

	test("planned-branch:create explicit path dry-run uses a content-derived slug instead of the filename", async () => {
		const savedPlanStem = "where-would-we-host-mossy-lampson";
		const contentSlug = "add-docs-portal-site";
		const content = "# Add Docs Portal Site\n\nBuild the docs portal and deploy it.\n";
		const filePath = await makeNamedPlanFile(`${savedPlanStem}.md`, content);

		for (const rawPath of [filePath, `@${filePath}`]) {
			const pi = new FakePi([planSlugStep(content, contentSlug)]);
			registerPlannedBranchExtension(pi);
			const command = pi.commands.get("planned-branch:create");

			await command?.handler(`--dry-run ${rawPath}`, createContext().ctx);

			pi.assertDone();
			expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(content)]);
			expect(pi.sentMessages).toHaveLength(1);
			expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
			expect(pi.sentMessages[0]?.content).toContain(`Path: ${filePath}`);
			expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${savedPlanStem}`);
			expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
			expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
			expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${contentSlug}.md`);
			expect(pi.sentMessages[0]?.content).not.toContain(`Branch: ${savedPlanStem}`);
		}
	});

	test("planned-branch:create dry-run repairs overlong model slug output", async () => {
		const filePath = await makeNamedPlanFile();
		const rawOutput = "asdl docs site slot page conventions skeleton theme foundation\n";
		const repairedSlug = "asdl-docs-site-slot-page-conventions-skeleton";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, repairedSlug, { stdout: rawOutput })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --dry-run`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["pi"]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${repairedSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${repairedSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${repairedSlug}.md`);
	});

	test("planned-branch:create ignores missing session file and falls back to disk latest", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const missingSlug = "submit-dirty-worktree-checkpoint";
		const diskSlug = "harden-cp-autobranch-validation";
		const missingPath = join(directoryPath, `${missingSlug}.md`);
		const diskKey = `${diskSlug}.md`;
		const diskPath = await writePlanStoreFile(directoryPath, diskKey, 1_800_000_000_000);
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
			planSlugStep(savedPlanFileContent(diskKey), diskSlug),
		]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: missingSlug, filePath: missingPath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Latest saved plan from local plan store:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${diskPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${diskSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${diskSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain("Saved plan from current session:");
	});

	test("planned-branch:create rejects wrong repo or branch session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const sessionPath = await writePlanStoreFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const wrongBranchEvidence = {
			...sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }),
			sourceBranch: "other-branch",
			branchKey: "other-branch",
		};
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(wrongBranchEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Failed to resolve saved plan file or derive branch slug.");
		expect(pi.sentMessages[0]?.content).toContain("different repo or branch");
		expect(pi.sentMessages[0]?.content).toContain("sourceBranch");
		expect(pi.sentMessages[0]?.content).toContain("branchKey");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("planned-branch:create rejects outside-plan-store session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const outsidePath = await makeNamedPlanFile(`${PLAN_KEY}`);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: PLAN_SLUG, filePath: outsidePath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("outside the current local plan store directory");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("planned-branch:create rejects wrong branch key even when source branch matches", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const sessionPath = await writePlanStoreFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const wrongBranchKeyEvidence = {
			...sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }),
			branchKey: "wrong-branch-key",
		};
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(wrongBranchKeyEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("branchKey");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("planned-branch:create rejects basename and slug mismatch in session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionPath = await writePlanStoreFile(directoryPath, `${PLAN_SLUG}.md`, 1_700_000_000_000);
		const mismatchEvidence = sourcePlanEvidence({ slug: "submit-dirty-worktree-checkpoint", filePath: sessionPath, sourceBranch });
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(mismatchEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("basename must match slug");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("planned-branch:create ignores stale cancellation output while using tool result evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const staleSlug = "harden-cp-autobranch-validation";
		const contentSlug = "restore-session-plan-selection";
		const sessionKey = `${sessionSlug}.md`;
		const sessionPath = await writePlanStoreFile(directoryPath, sessionKey, 1_700_000_000_000);
		const stalePath = await writePlanStoreFile(directoryPath, `${staleSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep(), planSlugStep(savedPlanFileContent(sessionKey), contentSlug)]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], {
			sessionEntries: [
				sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch })),
				plannedBranchOutputMessageEntry(
					`Cancelled: no branch was created and no plan was attached.\n\nLatest saved plan from local plan store:\nPath: ${stalePath}\nSlug: ${staleSlug}`,
				),
			],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Saved plan from current session:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${sessionPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${sessionSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Path: ${stalePath}`);
	});

	test("planned-branch:create creates without interactive confirmation", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), ...successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath })], events);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created planned branch and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
	});

	test("planned-branch:create fails on target branch collision without prompting", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([
			planSlugStep(DEFAULT_PLAN_CONTENT),
			gitRootStep(),
			refFormatStep(PLAN_SLUG),
			headStep(),
			localBranchCheckStep(PLAN_SLUG, { code: 0, stdout: `${START_POINT}\n` }),
		], events);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			planSlugExecCall(DEFAULT_PLAN_CONTENT),
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["check-ref-format", "--branch", PLAN_SLUG] },
			{ command: "git", args: ["rev-parse", "HEAD"] },
			{ command: "git", args: ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`] },
		]);
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["branch", PLAN_SLUG, "HEAD"]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Target branch already exists; refusing to overwrite.");
	});

	test("planned-branch:create --yes creates a plain-git planned branch using the content slug when the filename differs", async () => {
		const savedPlanStem = "where-would-we-host-mossy-lampson";
		const filePath = await makeNamedPlanFile(`${savedPlanStem}.md`);
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), ...successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			planSlugExecCall(DEFAULT_PLAN_CONTENT),
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["check-ref-format", "--branch", PLAN_SLUG] },
			{ command: "git", args: ["rev-parse", "HEAD"] },
			{ command: "git", args: ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`] },
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", PLAN_SLUG, "--format", "json"] },
			{ command: "git", args: ["branch", PLAN_SLUG, "HEAD"] },
			{
				command: "brmem",
				args: ["put", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", PLAN_SLUG, "--file", filePath, "--format", "json"],
			},
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created planned branch and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Branch: ${savedPlanStem}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Key: ${savedPlanStem}.md`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("planned-branch:create --graphite uses Graphite branch creation", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), ...graphiteSuccessScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");
		const context = createContext();

		await command?.handler(`${filePath} --yes --graphite`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({
			command: "git",
			args: ["branch", "--show-current"],
		});
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({
			command: "git",
			args: ["branch", PLAN_SLUG, "HEAD"],
		});
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({
			command: "gt",
			args: ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"],
		});
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["status", "--porcelain=v1", "--untracked-files=normal"]);
		expect(pi.execCalls.map((call) => call.args[0])).not.toContain("create");
		expect(pi.execCalls.map((call) => call.args[0])).not.toContain("checkout");
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("planned-branch:create extension options default to Graphite without a branch prefix", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), ...graphiteSuccessScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath })]);
		registerPlannedBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
		});
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toContain("gt");
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({
			command: "gt",
			args: ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"],
		});
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("planned-branch:up-and-impl creates with Graphite, checks out the branch, and dispatches impl in a new session", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi(
			[planSlugStep(DEFAULT_PLAN_CONTENT), ...graphiteSuccessScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }), gitCheckoutStep(PLAN_SLUG)],
			events,
		);
		registerPlannedBranchExtension(pi, { plannedBranchDefaultCreation: "graphite" });
		const command = pi.commands.get("planned-branch:up-and-impl");
		const context = createContext(events, { sessionFile: "/sessions/source.jsonl" });

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			planSlugExecCall(DEFAULT_PLAN_CONTENT),
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["check-ref-format", "--branch", PLAN_SLUG] },
			{ command: "git", args: ["rev-parse", "HEAD"] },
			{ command: "git", args: ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`] },
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", PLAN_SLUG, "--format", "json"] },
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "git", args: ["branch", PLAN_SLUG, "HEAD"] },
			{ command: "gt", args: ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"] },
			{
				command: "brmem",
				args: ["put", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", PLAN_SLUG, "--file", filePath, "--format", "json"],
			},
			{ command: "git", args: ["checkout", PLAN_SLUG] },
		]);
		expect(pi.sentMessages[0]?.content).toContain("Created planned branch and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.replacementUserMessages).toEqual([`/planned-branch:impl ${PLAN_KEY}`]);
		expect(context.newSessionParentSessions).toEqual(["/sessions/source.jsonl"]);
		expect(events.indexOf("new-session")).toBeGreaterThan(events.indexOf("status"));
		expect(events.indexOf("replacement-send")).toBeGreaterThan(events.indexOf("new-session"));
		expect(context.statuses.at(-1)).toEqual({ key: "planned-branch:up-and-impl", value: undefined });
	});

	test("planned-branch:up-and-impl dry-run previews checkout and new-session implementation", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		registerPlannedBranchExtension(pi, { plannedBranchDefaultCreation: "graphite" });
		const command = pi.commands.get("planned-branch:up-and-impl");
		const context = createContext();

		await command?.handler(`${filePath} --dry-run`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		expect(pi.sentMessages[0]?.content).toContain("Dry run: no branch was created");
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
		expect(pi.sentMessages[0]?.content).toContain(`git checkout ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).not.toContain("gt up");
		expect(pi.sentMessages[0]?.content).toContain("/new");
		expect(pi.sentMessages[0]?.content).toContain(`/planned-branch:impl ${PLAN_KEY}`);
	});

	test("planned-branch:up-and-impl supports plain Git creation before checkout", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), ...successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }), gitCheckoutStep(PLAN_SLUG)]);
		registerPlannedBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
		});
		const command = pi.commands.get("planned-branch:up-and-impl");
		const context = createContext();

		await command?.handler(`${filePath} --yes --plain-git`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).not.toContain("gt");
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({ command: "git", args: ["checkout", PLAN_SLUG] });
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.replacementUserMessages).toEqual([`/planned-branch:impl ${PLAN_KEY}`]);
	});

	test("planned-branch:create --plain-git override keeps the slug branch under the Graphite default", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), ...successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath })]);
		registerPlannedBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
		});
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes --plain-git`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).not.toContain("gt");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("planned-branch:create plannedBranchPrefix remains opt-in", async () => {
		const filePath = await makeNamedPlanFile();
		const prefixedBranch = `planned-branches/${PLAN_SLUG}`;
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), ...graphiteSuccessScript({ branch: prefixedBranch, key: PLAN_KEY, filePath })]);
		registerPlannedBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
			plannedBranchPrefix: "planned-branches/",
		});
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toContain("gt");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${prefixedBranch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("planned-branch:create passes explicit target branch while keeping key from slug", async () => {
		const filePath = await makeNamedPlanFile();
		const branch = "planned-branches/custom-target";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), ...successScript({ branch, key: PLAN_KEY, filePath })]);
		registerPlannedBranchExtension(pi, { plannedBranchPrefix: "planned-branches/" });
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes --branch ${branch}`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).toContainEqual(["branch", branch, "HEAD"]);
		expect(pi.execCalls.map((call) => call.args)).toContainEqual([
			"put",
			PLAN_KEY,
			"--namespace",
			PLAN_BRANCH_NAMESPACE,
			"--branch",
			branch,
			"--file",
			filePath,
			"--format",
			"json",
		]);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${branch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
	});

	test("planned-branch:create accepts invalid filename stems up to model slug generation", async () => {
		const filePath = await makeNamedPlanFile("bad.md");
		const contentSlug = "add-docs-portal-site";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, contentSlug)]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --dry-run`, createContext().ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
		expect(pi.sentMessages[0]?.content).toContain("Saved-plan file stem: bad");
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${contentSlug}.md`);
	});

	test("planned-branch:create fails when model slug generation fails without fallback", async () => {
		const filePath = await makeNamedPlanFile("where-would-we-host-mossy-lampson.md");
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, PLAN_SLUG, { code: 1, stderr: "model unavailable" })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["pi"]);
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(false);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Failed to resolve saved plan file or derive branch slug.");
		expect(pi.sentMessages[0]?.content).toContain("Failed to derive planned-branch slug from plan content.");
		expect(pi.sentMessages[0]?.content).toContain("No filename or deterministic fallback was attempted.");
	});

	test("planned-branch:create rejects relative explicit paths before primitive mutation", async () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler("relative-source-plan.md --yes", createContext().ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Plan file path must be absolute or home-relative");
	});

	test("planned-branch:create surfaces primitive failures without retrying", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitRootStep(), refFormatStep(PLAN_SLUG, { code: 1, stderr: "invalid ref" })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			planSlugExecCall(DEFAULT_PLAN_CONTENT),
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["check-ref-format", "--branch", PLAN_SLUG] },
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Failed to create planned branch and attach the plan.");
		expect(pi.sentMessages[0]?.content).toContain("git check-ref-format failed");
	});
});

describe("write_saved_plan_file tool", () => {
	test("describes the local plan store contract and strict parameters", () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");
		const parameters = tool.parameters as {
			properties?: Record<string, unknown>;
			required?: string[];
			additionalProperties?: boolean;
		};

		expect(tool.description).toContain("~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md");
		expect(tool.description).toContain("refuses to overwrite");
		expect(tool.description).toContain("does not create branches or write Branch Memory");
		expect(tool.description).toContain("self-contained");
		expect(tool.description).toContain("Codex-backed slug model");
		expect(tool.promptSnippet).toContain("local plan store");
		expect(tool.promptSnippet).toContain("self-contained");
		expect(tool.promptGuidelines?.join("\n")).toContain("/plans:write");
		expect(tool.promptGuidelines?.join("\n")).toContain("/plans:grill-and-write");
		expect(tool.promptGuidelines?.join("\n")).toContain("Do not generate or pass");
		expect(tool.promptGuidelines?.join("\n")).toContain("fresh downstream implementation session");
		expect(tool.promptGuidelines?.join("\n")).toContain("external/off-repo research");
		const contentParameter = parameters.properties?.content as { description?: string } | undefined;
		expect(contentParameter?.description).toContain("self-contained");
		expect(contentParameter?.description).toContain("external research");
		expect(parameters.required).toEqual(["content"]);
		expect(parameters.additionalProperties).toBe(false);
		expect(Object.keys(parameters.properties ?? {})).toEqual(["content", "summary"]);
	});

	test("derives the saved-plan filename slug with the Codex slug model before writing", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "planned-branches/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const content = "# Branch Scoped Plan Extension\n\nPersist saved plans from final content.\n";
		const pi = new FakePi([
			savedPlanSlugStep(content),
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep({ stdout: `${origin}\n` }),
		]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const tool = registeredTool(pi, "write_saved_plan_file");

		const result = await tool.execute(
			"tool-call",
			{ content, summary: "Plan the local plan store file." },
			undefined,
			undefined,
			{ cwd: ROOT },
		);

		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const expectedPath = join(planStoreRoot, repoKey, branchKey, PLAN_KEY);

		pi.assertDone();
		expect(pi.execCalls[0]?.command).toBe("pi");
		expect(pi.execCalls[0]?.args).toEqual(savedPlanSlugArgs(content));
		expect(pi.execCalls[0]?.options).toMatchObject({ cwd: ROOT, timeout: 60_000 });
		expect(result.content[0]?.text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(result.content[0]?.text).toContain(`Slug model: ${SLUG_MODEL_PROVIDER}/${SLUG_MODEL_MODEL}`);
		expect(result.details).toMatchObject({
			slug: PLAN_SLUG,
			filePath: expectedPath,
			slugEvidence: contentSlugEvidence(),
		});
		expect(await readFile(expectedPath, "utf8")).toBe(content);
	});

	test("streams progress while deriving the saved-plan slug and writing the plan file", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "planned-branches/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const content = "# Branch Scoped Plan Extension\n\nPersist saved plans from final content.\n";
		const pi = new FakePi([
			savedPlanSlugStep(content),
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep({ stdout: `${origin}\n` }),
		]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const tool = registeredTool(pi, "write_saved_plan_file");
		const updates: ToolUpdate[] = [];
		const toolContext = createToolContext({ hasUI: true });

		const result = await tool.execute(
			"tool-call",
			{ content, summary: "Plan the local plan store file." },
			undefined,
			(update) => updates.push(update),
			toolContext.ctx,
		);

		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const expectedPath = join(planStoreRoot, repoKey, branchKey, PLAN_KEY);
		const updateTexts = updates.flatMap((update) => update.content ?? []).map((item) => item.text);
		const validationIndex = updateTexts.findIndex((text) => text.includes("Validating saved plan input"));
		const slugIndex = updateTexts.findIndex((text) => text.includes("Deriving saved-plan filename slug with Codex"));
		const writingIndex = updateTexts.findIndex((text) => text.includes("Writing plan file"));

		pi.assertDone();
		expect(validationIndex).toBeGreaterThan(-1);
		expect(slugIndex).toBeGreaterThan(validationIndex);
		expect(writingIndex).toBeGreaterThan(slugIndex);
		expect(updateTexts.join("\n")).toContain(PLAN_SLUG);
		expect(updates.map((update) => update.details)).toContainEqual({ phase: "validating" });
		expect(updates.map((update) => update.details)).toContainEqual({ phase: "deriving-slug" });
		expect(updates.map((update) => update.details)).toContainEqual({ phase: "writing-file", slug: PLAN_SLUG });
		expect(toolContext.statuses).toContainEqual({ key: "plans:write", value: "Validating saved plan input…" });
		expect(toolContext.statuses).toContainEqual({ key: "plans:write", value: "Deriving saved-plan filename slug with Codex…" });
		expect(toolContext.statuses).toContainEqual({
			key: "plans:write",
			value: `Derived slug ${PLAN_SLUG}; resolving repo/branch and writing plan file…`,
		});
		expect(toolContext.statuses).toContainEqual({ key: "plans:write", value: "Writing plan file…" });
		expect(toolContext.statuses.at(-1)).toEqual({ key: "plans:write", value: undefined });
		expect(result.content[0]?.text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(result.content[0]?.text).toContain(`Slug model: ${SLUG_MODEL_PROVIDER}/${SLUG_MODEL_MODEL}`);
		expect(result.details).toMatchObject({
			slug: PLAN_SLUG,
			filePath: expectedPath,
			slugEvidence: contentSlugEvidence(),
		});
		expect(await readFile(expectedPath, "utf8")).toBe(content);
	});

	test("rejects assistant-provided saved-plan slugs so /plans:write cannot bypass Codex slugging", async () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");

		await expect(
			tool.execute("tool-call", { slug: PLAN_SLUG, content: DEFAULT_PLAN_CONTENT }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("derives `slug` from content through Codex");
		expect(pi.execCalls).toEqual([]);
	});

	test("clears write-plan status when validation fails", async () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");
		const toolContext = createToolContext({ hasUI: true });

		await expect(tool.execute("tool-call", { content: 42 }, undefined, undefined, toolContext.ctx)).rejects.toThrow(
			"requires string parameter `content`",
		);

		expect(pi.execCalls).toEqual([]);
		expect(toolContext.statuses).toEqual([
			{ key: "plans:write", value: "Validating saved plan input…" },
			{ key: "plans:write", value: undefined },
		]);
	});

	test("renders tool-call argument streaming progress without dumping plan content", () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");
		const renderCall = tool.renderCall;

		expect(renderCall).toBeDefined();
		if (renderCall === undefined) {
			throw new Error("write_saved_plan_file renderCall was not registered");
		}

		const distinctivePlanBody = "SECRET_PLAN_BODY_SHOULD_NOT_RENDER";
		const content = `# Plan\n\n${distinctivePlanBody}\n\n${"Details ".repeat(1_800)}`;
		const missingContent = renderCall({}, undefined, { executionStarted: false, argsComplete: false });
		const receivingContent = renderCall({ content }, undefined, { executionStarted: false, argsComplete: false });
		const savingContent = renderCall({ content }, undefined, { executionStarted: true, argsComplete: true });

		const missingText = missingContent.render(100).join("\n");
		const receivingText = receivingContent.render(100).join("\n");
		const savingText = savingContent.render(100).join("\n");

		expect(missingText).toContain("write_saved_plan_file");
		expect(missingText).toContain("receiving saved-plan content from model");
		expect(receivingText).toContain("receiving saved-plan content from model");
		expect(receivingText).toMatch(/\d+(?:\.\d)?k tokens \(est\.\)/);
		expect(receivingText).not.toContain("chars");
		expect(receivingText).not.toContain(distinctivePlanBody);
		expect(savingText).toContain("saving reviewed plan");
		expect(savingText).toMatch(/\d+(?:\.\d)?k tokens \(est\.\)/);
		expect(savingText).not.toContain("chars");
		expect(savingText).not.toContain(distinctivePlanBody);
	});

	test("renders partial write-plan progress with an in-progress heading", () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");
		const renderResult = tool.renderResult;

		expect(renderResult).toBeDefined();
		if (renderResult === undefined) {
			throw new Error("write_saved_plan_file renderResult was not registered");
		}

		const partial = renderResult(
			{ content: [{ type: "text", text: "Deriving saved-plan filename slug with Codex…" }] },
			{ isPartial: true },
			undefined,
			undefined,
		);
		const final = renderResult({ content: [{ type: "text", text: "Path: /tmp/plan.md" }] }, { isPartial: false }, undefined, undefined);

		expect(partial.render(100).join("\n")).toContain("Saving planned-branch plan…");
		expect(partial.render(100).join("\n")).toContain("Deriving saved-plan filename slug with Codex…");
		expect(final.render(100).join("\n").trimEnd()).toBe("Path: /tmp/plan.md");
	});
});

describe("writeSavedPlanFile", () => {
	test("writes a source branch saved plan file with origin identity evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "planned-branches/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ stdout: `${origin}\n` })]);

		const evidence = await writeSavedPlanFile(
			pi,
			{
				slug: PLAN_SLUG,
				content: "# Test Plan\n\nDo the work.\n",
				summary: "Plan the local plan store file.",
			},
			{ cwd: ROOT, planStoreRoot },
		);

		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const expectedPath = join(planStoreRoot, repoKey, branchKey, PLAN_KEY);

		pi.assertDone();
		expect(evidence).toEqual({
			slug: PLAN_SLUG,
			repoRoot: ROOT,
			repoKey,
			repoIdentitySource: "origin-url",
			sourceBranch,
			branchKey,
			filePath: expectedPath,
			summary: "Plan the local plan store file.",
		});
		expect(await readFile(expectedPath, "utf8")).toBe("# Test Plan\n\nDo the work.\n");
	});

	test("falls back to real repo root identity when origin is absent", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ code: 1, stderr: "no origin" })]);

		const evidence = await writeSavedPlanFile(
			pi,
			{ slug: PLAN_SLUG, content: "# Test Plan\n" },
			{ cwd: ROOT, planStoreRoot },
		);

		pi.assertDone();
		expect(evidence.repoIdentitySource).toBe("repo-root");
		expect(evidence.repoKey).toBe(buildRepoPlanStoreKey(ROOT, ROOT));
		expect(await readFile(evidence.filePath, "utf8")).toBe("# Test Plan\n");
	});

	test("refuses to overwrite an existing local plan store file", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "planned-branches/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const filePath = join(planStoreRoot, repoKey, branchKey, PLAN_KEY);
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, "# Existing Plan\n", "utf8");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ stdout: `${origin}\n` })]);

		await expect(
			writeSavedPlanFile(pi, { slug: PLAN_SLUG, content: "# New Plan\n" }, { cwd: ROOT, planStoreRoot }),
		).rejects.toThrow("refusing to overwrite");

		pi.assertDone();
		expect(await readFile(filePath, "utf8")).toBe("# Existing Plan\n");
	});

	test("rejects invalid slug before git commands or filesystem writes", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const pi = new FakePi();

		await expect(
			writeSavedPlanFile(pi, { slug: "Bad Slug", content: "# Test Plan\n" }, { cwd: ROOT, planStoreRoot }),
		).rejects.toThrow("Invalid saved plan slug");
		expect(pi.execCalls).toEqual([]);
	});

	test("rejects detached HEAD with a clear named-branch message", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep("", { stdout: "\n" })]);

		await expect(
			writeSavedPlanFile(pi, { slug: PLAN_SLUG, content: "# Test Plan\n" }, { cwd: ROOT, planStoreRoot }),
		).rejects.toThrow("check out a named branch");

		pi.assertDone();
	});
});

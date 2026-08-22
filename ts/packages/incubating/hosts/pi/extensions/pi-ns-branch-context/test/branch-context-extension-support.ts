const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
import { buildRawTextModelArgs } from "@nseng-ai/extension-kit/model-slug";
import { brmemCheckJson } from "@nseng-ai/extension-kit/brmem-cli/testing";
import { afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	BRANCH_CONTEXT_NAMESPACE,
	buildBranchContextPlanKey,
	buildPlanContentSlugPrompt,
	createBranchContextContext,
	type BranchContextEvidence,
	type LoadedAttachedPlan,
} from "@nseng-ai/branch-context/api";
import { FakeBrmemGateway } from "@nseng-ai/brmem";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import type { RawPiExecOptions, RawPiExecResult } from "../src/host-types.ts";

type ExecResultFixture = Partial<RawPiExecResult>;
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	normalizeRepoOriginUrl,
	type SavedPlanFileEvidence,
	type SelectedSavedPlanFile,
} from "@nseng-ai/plans/api";
import {
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	type BranchContextExtensionOptions,
	type BranchContextOperations,
	type CommandContext,
	type ExtensionAPI,
	type ToolDefinition,
} from "../src/extension.ts";

export { brmemCheckJson as brmemCheckEnvelope } from "@nseng-ai/extension-kit/brmem-cli/testing";

export const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(TEST_DIR, "../../../../../../../..");
export const ROOT = "/repo";
const MODEL_ROOT = mkdtempSync(join(tmpdir(), "branch-context-root-"));
writeFileSync(
	join(MODEL_ROOT, "ns.toml"),
	'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
);
export const PLAN_SLUG = "branch-scoped-plan-extension";
export const PLAN_KEY = buildBranchContextPlanKey(PLAN_SLUG);
export const LEGACY_PLAN_KEY = "plan.md";
export const START_POINT = "0123456789abcdef0123456789abcdef01234567";
export const SOURCE_BRANCH = "source-branch";
export const TARGET_BRANCH = "branch-contexts/wire-create-branch-context-command";
export const IMPL_BRANCH = `branch-contexts/${PLAN_SLUG}`;
export const IMPL_REF = `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${IMPL_BRANCH.replaceAll("/", "---")}:${PLAN_KEY}`;
export const DEFAULT_PLAN_CONTENT = "# Test Plan\n\nDo the work.\n";
export const IMPL_PLAN_CONTENT = "# Impl Plan\n\n- Load the attached plan.\n- Implement from it.\n";
export type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
export type SendMessage = NonNullable<ExtensionAPI["sendMessage"]>;
export type SentMessage = Parameters<SendMessage>[0] & { options?: Parameters<SendMessage>[1] };

export interface ExecCall {
	command: string;
	args: string[];
	options: RawPiExecOptions | undefined;
}

export type ScriptedExec =
	| {
			command: string;
			args: string[];
			result: ExecResultFixture;
	  }
	| {
			command: string;
			args: string[];
			error: Error;
	  };

export interface Notification {
	message: string;
	level: string | undefined;
}

export class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly execCalls: ExecCall[] = [];
	readonly defaultBranchAvailabilityProbeCalls: ExecCall[] = [];
	readonly sentMessages: SentMessage[] = [];
	readonly sentUserMessages: string[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;
	private readonly events: string[] | undefined;
	// Mutated in place (never reassigned) so state is shared with the
	// Object.create-based BranchContextPiCommandApi delegation adapter.
	private readonly activeTools: string[] = [];

	constructor(script: ScriptedExec[] = [], events?: string[]) {
		this.script = new ScriptedQueue(script, (step) => step);
		this.events = events;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	seedActiveTools(names: string[]): void {
		this.activeTools.splice(0, this.activeTools.length, ...names);
	}

	getActiveTools(): string[] {
		return [...this.activeTools];
	}

	setActiveTools(names: string[]): void {
		this.events?.push(`set-active:${names.join(",")}`);
		this.activeTools.splice(0, this.activeTools.length, ...names);
	}

	async exec(
		command: string,
		args: string[],
		options?: RawPiExecOptions,
	): Promise<RawPiExecResult> {
		const defaultResult = defaultBranchAvailabilityResult(command, args);
		if (defaultResult !== undefined) {
			this.defaultBranchAvailabilityProbeCalls.push({ command, args: [...args], options });
			return defaultResult;
		}
		if (command === "git" && sameArgs(args, ["rev-parse", "--show-toplevel"])) {
			const next = this.script.peek();
			if (next === undefined || next.command !== "git" || !sameArgs(next.args, args)) {
				return execResult({ stdout: `${MODEL_ROOT}\n` });
			}
		}
		this.execCalls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
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
		this.script.assertDone();
	}
}

export interface BranchMemoryEntrySeed {
	branch: string;
	key: string;
	content?: string;
}

export function branchContextExtensionTestOptions(
	operations: BranchContextOperations,
	entries: readonly BranchMemoryEntrySeed[] = [],
): BranchContextExtensionOptions {
	return {
		branchContextOperations: operations,
		shouldResolveTargetBranchInPreview: true,
		createBranchContextContext(pi, cwd) {
			return {
				...createBranchContextContext(createPiCommandExecApi(pi), {
					cwd,
				}),
				brmem: new FakeBrmemGateway({
					currentBranch: SOURCE_BRANCH,
					entries: entries.map((entry) => ({
						namespace: BRANCH_CONTEXT_NAMESPACE,
						branch: entry.branch,
						key: entry.key,
						content: entry.content ?? IMPL_PLAN_CONTENT,
					})),
				}),
			};
		},
	};
}

export interface BranchContextOperationFakes {
	operations: BranchContextOperations;
	loadPlanCalls: Array<Parameters<BranchContextOperations["loadBranchContextPlan"]>>;
	createBranchCalls: Array<Parameters<BranchContextOperations["createBranchContextFromFile"]>>;
	selectPlanCalls: Array<Parameters<BranchContextOperations["resolveSelectedSavedPlanFile"]>>;
}

export function createBranchContextOperationFakes(
	overrides: Partial<BranchContextOperations> = {},
): BranchContextOperationFakes {
	const loadPlanCalls: Array<Parameters<BranchContextOperations["loadBranchContextPlan"]>> = [];
	const createBranchCalls: Array<
		Parameters<BranchContextOperations["createBranchContextFromFile"]>
	> = [];
	const selectPlanCalls: Array<
		Parameters<BranchContextOperations["resolveSelectedSavedPlanFile"]>
	> = [];
	return {
		loadPlanCalls,
		createBranchCalls,
		selectPlanCalls,
		operations: {
			async loadBranchContextPlan(...args) {
				loadPlanCalls.push(args);
				if (overrides.loadBranchContextPlan !== undefined) {
					return overrides.loadBranchContextPlan(...args);
				}
				return attachedPlan();
			},
			async createBranchContextFromFile(...args) {
				createBranchCalls.push(args);
				if (overrides.createBranchContextFromFile !== undefined) {
					return overrides.createBranchContextFromFile(...args);
				}
				return branchContextEvidenceFromParams(args[1]);
			},
			async resolveSelectedSavedPlanFile(...args) {
				selectPlanCalls.push(args);
				if (overrides.resolveSelectedSavedPlanFile !== undefined) {
					return overrides.resolveSelectedSavedPlanFile(...args);
				}
				const options = args[1];
				return explicitSelectedPlanFile(
					options.explicitPath ?? "/tmp/branch-scoped-plan-extension.md",
				);
			},
		},
	};
}

export function attachedPlan(input: Partial<LoadedAttachedPlan> = {}): LoadedAttachedPlan {
	const content = input.content ?? IMPL_PLAN_CONTENT;
	return {
		branch: input.branch ?? IMPL_BRANCH,
		namespace: input.namespace ?? BRANCH_CONTEXT_NAMESPACE,
		selectedKey: input.selectedKey ?? PLAN_KEY,
		refName: input.refName ?? IMPL_REF,
		content,
		byteCount: input.byteCount ?? new TextEncoder().encode(content).length,
		availableKeys: input.availableKeys ?? [input.selectedKey ?? PLAN_KEY],
		source: input.source ?? "attached",
		...(input.sourceFile === undefined ? {} : { sourceFile: input.sourceFile }),
	};
}

export function branchContextEvidence(
	input: Partial<BranchContextEvidence> = {},
): BranchContextEvidence {
	return {
		slug: input.slug ?? PLAN_SLUG,
		branch: input.branch ?? PLAN_SLUG,
		startPoint: input.startPoint ?? START_POINT,
		creation: input.creation ?? {
			type: "plain-git",
			startRef: "HEAD",
		},
		namespace: input.namespace ?? BRANCH_CONTEXT_NAMESPACE,
		key: input.key ?? PLAN_KEY,
		refName:
			input.refName ??
			`refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${(input.branch ?? PLAN_SLUG).replaceAll("/", "---")}:${input.key ?? PLAN_KEY}`,
		commit: input.commit ?? "abc123",
		sourceFile: input.sourceFile ?? "/tmp/plan.md",
		branchSelection: input.branchSelection ?? {
			type: "exact",
			requestedBranch: input.branch ?? PLAN_SLUG,
			selectedBranch: input.branch ?? PLAN_SLUG,
			collisions: [],
		},
		...(input.summary === undefined ? {} : { summary: input.summary }),
	};
}

export function branchContextEvidenceFromParams(rawParams: unknown): BranchContextEvidence {
	const params = rawParams as {
		slug: string;
		filePath: string;
		creation: { type: "plain-git-current-head" } | { type: "graphite-current-parent-current-head" };
		branchName?: string;
		summary?: string;
	};
	return branchContextEvidence({
		slug: params.slug,
		branch: params.branchName ?? params.slug,
		creation:
			params.creation.type === "graphite-current-parent-current-head"
				? {
						type: "graphite",
						startRef: "HEAD",
						parentBranch: "main",
					}
				: { type: "plain-git", startRef: "HEAD" },
		key: buildBranchContextPlanKey(params.slug),
		sourceFile: params.filePath,
		...(params.summary === undefined ? {} : { summary: params.summary }),
	});
}

export function explicitSelectedPlanFile(
	filePath = "/tmp/branch-scoped-plan-extension.md",
	fileName = PLAN_KEY,
): SelectedSavedPlanFile {
	const sourceBranch = SOURCE_BRANCH;
	const branchKey = encodeBranchForPlanPath(sourceBranch);
	return {
		type: "explicit",
		plan: {
			format: "legacy",
			slug: fileName.replace(/\.md$/, ""),
			filePath,
			fileName,
			fileStem: fileName.replace(/\.md$/, ""),
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			repoDirectoryPath: "/plans/gh--owner--repo",
			sourceBranch,
			branchKey,
			directoryPath: `/plans/gh--owner--repo/${branchKey}`,
			content: DEFAULT_PLAN_CONTENT,
		},
	};
}

export function savedPlanEvidence(
	input: Partial<SavedPlanFileEvidence> = {},
): SavedPlanFileEvidence {
	const sourceBranch = input.sourceBranch ?? SOURCE_BRANCH;
	const slug = input.slug ?? PLAN_SLUG;
	return {
		slug,
		repoRoot: input.repoRoot ?? ROOT,
		repoKey:
			input.repoKey ??
			buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl("git@github.com:owner/repo.git")),
		repoIdentitySource: input.repoIdentitySource ?? "origin-url",
		sourceBranch,
		branchKey: input.branchKey ?? encodeBranchForPlanPath(sourceBranch),
		filePath: input.filePath ?? `/tmp/${slug}.md`,
	};
}

export const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

export function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function execResult(overrides: ExecResultFixture = {}): RawPiExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function defaultBranchAvailabilityResult(
	command: string,
	args: string[],
): RawPiExecResult | undefined {
	if (
		command === "git" &&
		args.length === 3 &&
		args[0] === "rev-parse" &&
		args[1] === "--verify" &&
		args[2]?.startsWith("refs/heads/") === true
	) {
		return execResult({ code: 1, stderr: "fatal: Needed a single revision\n" });
	}
	if (
		command === "git" &&
		args.length === 3 &&
		args[0] === "check-ref-format" &&
		args[1] === "--branch"
	) {
		return execResult();
	}
	if (
		command === "git" &&
		args.length === 3 &&
		args[0] === "cat-file" &&
		args[1] === "-e" &&
		args[2]?.startsWith(`refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/`) === true
	) {
		return execResult({ code: 1, stderr: "missing branch memory entry\n" });
	}
	if (
		command === "brmem" &&
		args[0] === "check" &&
		args.includes("--format") &&
		args.at(-1) === "json"
	) {
		return execResult({ stdout: brmemCheckJson(false) });
	}
	return undefined;
}

export function step(
	command: string,
	args: string[],
	result: ExecResultFixture = {},
): ScriptedExec {
	return { command, args, result };
}

export function planSlugArgs(content: string): string[] {
	return buildRawTextModelArgs(buildPlanContentSlugPrompt(content), TEST_MODEL_SELECTION);
}

export function planSlugStep(
	content: string,
	slug: string = PLAN_SLUG,
	result: ExecResultFixture = { stdout: `${slug}\n` },
): ScriptedExec {
	return step("pi", planSlugArgs(content), result);
}

export function planSlugExecCall(content: string): { command: string; args: string[] } {
	return { command: "pi", args: planSlugArgs(content) };
}

export function contentSlugEvidence(slug: string = PLAN_SLUG): {
	slug: string;
	rawOutput: string;
	provider: string;
	model: string;
} {
	return {
		slug,
		rawOutput: `${slug}\n`,
		provider: TEST_MODEL_SELECTION.provider,
		model: TEST_MODEL_SELECTION.modelId,
	};
}

export function savedPlanFileContent(fileName: string): string {
	return `# ${fileName}\n`;
}

export function gitRootStep(root: string = ROOT): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${root}\n` });
}

export function gitCurrentBranchStep(
	branch: string = SOURCE_BRANCH,
	result: ExecResultFixture = {},
): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n`, ...result });
}

export function gitOriginStep(
	result: ExecResultFixture = { stdout: "git@github.com:owner/repo.git\n" },
): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], result);
}

export function gitCheckoutStep(branch: string, result: ExecResultFixture = {}): ScriptedExec {
	return step("git", ["checkout", branch], result);
}

export function brmemListAttachedPlansStep(
	branch: string,
	entries: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>,
	result: ExecResultFixture = {},
): ScriptedExec {
	return step(
		"brmem",
		["list", "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--format", "json"],
		{
			stdout: brmemListEnvelope(branch, entries),
			...result,
		},
	);
}

function brmemListEnvelope(
	branch: string,
	entries: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>,
): string {
	return JSON.stringify({
		status: "ok",
		exitCode: 0,
		data: {
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: null,
			branch,
			base: false,
			entries: entries.map((entry) => {
				const entryBranch = entry.branch ?? branch;
				return {
					namespace: entry.namespace ?? BRANCH_CONTEXT_NAMESPACE,
					key: entry.key,
					branch: entryBranch,
					ref_name:
						entry.refName ??
						`refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${entryBranch.replaceAll("/", "---")}:${entry.key}`,
				};
			}),
		},
	});
}

export async function makeTempDir(prefix = "branch-context-extension-"): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
	tempDirs.push(dir);
	return dir;
}

export async function makeNamedPlanFile(
	fileName = `${PLAN_SLUG}.md`,
	content = DEFAULT_PLAN_CONTENT,
): Promise<string> {
	const dir = await makeTempDir();
	const filePath = join(dir, fileName);
	await writeFile(filePath, content, "utf8");
	return filePath;
}

export async function makeStoredPlanFile(
	fileName = `${PLAN_SLUG}--26-03-19T12-00-00--1.md`,
	content = DEFAULT_PLAN_CONTENT,
): Promise<{ filePath: string; planStoreRoot: string }> {
	const planStoreRoot = await makeTempDir("source-plan-store-");
	const directoryPath = planStoreDirectory(planStoreRoot, SOURCE_BRANCH);
	const filePath = await writePlanStoreFile(directoryPath, fileName, 1_800_000_000_000, content);
	return { filePath, planStoreRoot };
}

export async function makeRepoPrompt(content = DEFAULT_WRITE_PLAN_PROMPT_BODY): Promise<string> {
	const dir = await makeTempDir();
	const promptDir = join(dir, ".ns", "prompts");
	await mkdir(promptDir, { recursive: true });
	await writeBranchContextPointManifest(dir);
	await writeFile(join(promptDir, "branch-context.plans-write.md"), content, "utf8");
	return dir;
}

export async function makeRepoPromptDirectory(): Promise<string> {
	const dir = await makeTempDir();
	await mkdir(join(dir, ".ns", "prompts", "branch-context.plans-write.md"), { recursive: true });
	await writeBranchContextPointManifest(dir);
	return dir;
}

export async function makeRepoPromptSymlink(): Promise<string> {
	const dir = await makeTempDir();
	const target = await makeTempDir("branch-context-prompt-target-");
	await mkdir(join(dir, ".ns", "prompts"), { recursive: true });
	await writeBranchContextPointManifest(dir);
	await writeFile(join(target, "branch-context.plans-write.md"), "linked prompt\n", "utf8");
	await symlink(
		join(target, "branch-context.plans-write.md"),
		join(dir, ".ns", "prompts", "branch-context.plans-write.md"),
	);
	return dir;
}

async function writeBranchContextPointManifest(repoRoot: string): Promise<void> {
	const extensionDir = join(repoRoot, ".ns", "extensions", "branch-context");
	await mkdir(extensionDir, { recursive: true });
	await writeFile(
		join(extensionDir, "package.json"),
		JSON.stringify({
			ns: {
				group: "branch-context",
				points: [
					{
						path: ["plans-write"],
						accepts: "prompt",
						semantics: "override",
					},
				],
			},
		}),
		"utf8",
	);
}

export function planStoreDirectory(
	planStoreRoot: string,
	sourceBranch: string,
	origin = "git@github.com:owner/repo.git",
): string {
	const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
	const branchKey = encodeBranchForPlanPath(sourceBranch);
	return join(planStoreRoot, repoKey, branchKey);
}

export async function writePlanStoreFile(
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

export function branchContextOutputMessageEntry(content: string, details?: unknown): unknown {
	return {
		type: "message",
		message: {
			role: "custom",
			customType: "branch-context-output",
			display: true,
			content,
			...(details === undefined ? {} : { details }),
		},
	};
}

export function createContext(
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
	wasSessionReplaced: () => boolean;
	waits: () => number;
} {
	const replacementUserMessages: string[] = [];
	const newSessionParentSessions: Array<string | undefined> = [];
	const notifications: Notification[] = [];
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	let waitCount = 0;
	let isSessionReplaced = false;
	function assertActiveSession(): void {
		if (isSessionReplaced) {
			throw new Error(
				"stale extension context after session replacement; use withSession for post-replacement work",
			);
		}
	}
	const ui: CommandContext["ui"] = {
		notify(message, level): void {
			assertActiveSession();
			events.push("notify");
			notifications.push({ message, level });
		},
		setStatus(key, value): void {
			assertActiveSession();
			events.push("status");
			statuses.push({ key, value });
		},
	};
	if (options.confirm !== undefined) {
		ui.confirm = async (title, message) => {
			assertActiveSession();
			events.push("confirm");
			return options.confirm?.(title, message) ?? false;
		};
	}

	const ctx: CommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		ui,
		async waitForIdle(): Promise<void> {
			assertActiveSession();
			events.push("wait");
			waitCount += 1;
		},
		async newSession(newSessionOptions): Promise<{ cancelled: boolean }> {
			assertActiveSession();
			events.push("new-session");
			newSessionParentSessions.push(newSessionOptions?.parentSession);
			if (options.shouldCancelNewSession === true) {
				return { cancelled: true };
			}
			isSessionReplaced = true;
			await newSessionOptions?.withSession?.({
				...ctx,
				ui: {
					notify(message, level): void {
						events.push("replacement-notify");
						notifications.push({ message, level });
					},
					setStatus(key, value): void {
						events.push("replacement-status");
						statuses.push({ key, value });
					},
				},
				...(sessionEntries === undefined && options.sessionFile === undefined
					? {}
					: {
							sessionManager: {
								getBranch: () => [...(sessionEntries ?? [])],
								getSessionFile: () => options.sessionFile,
							},
						}),
				async waitForIdle(): Promise<void> {
					events.push("replacement-wait");
				},
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
			getBranch: () => {
				assertActiveSession();
				return [...(sessionEntries ?? [])];
			},
			getSessionFile: () => {
				assertActiveSession();
				return options.sessionFile;
			},
		};
	}
	return {
		ctx,
		notifications,
		statuses,
		replacementUserMessages,
		newSessionParentSessions,
		wasSessionReplaced: () => isSessionReplaced,
		waits: () => waitCount,
	};
}

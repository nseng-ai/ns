import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BRANCH_CONTEXT_NAMESPACE, buildBranchContextPlanKey, buildPlanContentSlugPrompt, type BranchContextEvidence, type LoadedAttachedPlan } from "@asdl/branch-context";
import type { ExecOptions, ExecResult } from "@asdl/core/exec";
import {
	DEFAULT_FAST_MODEL,
	buildRepoPlanStoreKey,
	buildSavedPlanContentSlugPrompt,
	buildSlugModelArgs,
	encodeBranchForPlanPath,
	normalizeRepoOriginUrl,
	type SavedPlanFileEvidence,
	type SelectedSavedPlanFile,
} from "@asdl/plans";
import {
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	type BranchContextOperations,
	type CommandContext,
	type ExtensionAPI,
	type ToolContext,
	type ToolDefinition,
} from "../src/branch-context-extension.ts";

export const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(TEST_DIR, "../../../..");
export const ROOT = "/repo";
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
export type ToolUpdate = Parameters<NonNullable<Parameters<ToolDefinition["execute"]>[3]>>[0];

export interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

export type ScriptedExec =
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

export interface Notification {
	message: string;
	level: string | undefined;
}

export class FakePi implements ExtensionAPI {
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

export interface BranchContextOperationFakes {
	operations: BranchContextOperations;
	loadPlanCalls: Array<Parameters<BranchContextOperations["loadBranchContextPlan"]>>;
	createBranchCalls: Array<Parameters<BranchContextOperations["createBranchContextFromFile"]>>;
	writePlanCalls: Array<Parameters<BranchContextOperations["writeSavedPlanFile"]>>;
	selectPlanCalls: Array<Parameters<BranchContextOperations["resolveSelectedSavedPlanFile"]>>;
}

export function createBranchContextOperationFakes(
	overrides: Partial<BranchContextOperations> = {},
): BranchContextOperationFakes {
	const loadPlanCalls: Array<Parameters<BranchContextOperations["loadBranchContextPlan"]>> = [];
	const createBranchCalls: Array<Parameters<BranchContextOperations["createBranchContextFromFile"]>> = [];
	const writePlanCalls: Array<Parameters<BranchContextOperations["writeSavedPlanFile"]>> = [];
	const selectPlanCalls: Array<Parameters<BranchContextOperations["resolveSelectedSavedPlanFile"]>> = [];
	return {
		loadPlanCalls,
		createBranchCalls,
		writePlanCalls,
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
			async writeSavedPlanFile(...args) {
				writePlanCalls.push(args);
				if (overrides.writeSavedPlanFile !== undefined) {
					return overrides.writeSavedPlanFile(...args);
				}
				return savedPlanEvidence({ slug: paramsSlug(args[1]) });
			},
			async resolveSelectedSavedPlanFile(...args) {
				selectPlanCalls.push(args);
				if (overrides.resolveSelectedSavedPlanFile !== undefined) {
					return overrides.resolveSelectedSavedPlanFile(...args);
				}
				const options = args[1];
				return explicitSelectedPlanFile(options.explicitPath ?? "/tmp/branch-scoped-plan-extension.md");
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

export function branchContextEvidence(input: Partial<BranchContextEvidence> = {}): BranchContextEvidence {
	return {
		slug: input.slug ?? PLAN_SLUG,
		branch: input.branch ?? PLAN_SLUG,
		branchCreation: input.branchCreation ?? "plain-git",
		startPoint: input.startPoint ?? START_POINT,
		namespace: input.namespace ?? BRANCH_CONTEXT_NAMESPACE,
		key: input.key ?? PLAN_KEY,
		refName: input.refName ?? `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${(input.branch ?? PLAN_SLUG).replaceAll("/", "---")}:${input.key ?? PLAN_KEY}`,
		commit: input.commit ?? "abc123",
		sourceFile: input.sourceFile ?? "/tmp/plan.md",
		...(input.summary === undefined ? {} : { summary: input.summary }),
	};
}

export function branchContextEvidenceFromParams(rawParams: unknown): BranchContextEvidence {
	const params = rawParams as { slug: string; filePath: string; branchCreation: "plain-git" | "graphite"; branchName?: string; summary?: string };
	return branchContextEvidence({
		slug: params.slug,
		branch: params.branchName ?? params.slug,
		branchCreation: params.branchCreation,
		key: buildBranchContextPlanKey(params.slug),
		sourceFile: params.filePath,
		...(params.summary === undefined ? {} : { summary: params.summary }),
	});
}

export function explicitSelectedPlanFile(filePath = "/tmp/branch-scoped-plan-extension.md", fileName = PLAN_KEY): SelectedSavedPlanFile {
	return { type: "explicit", filePath, fileName, savedPlanFileStem: fileName.replace(/\.md$/, "") };
}

export function savedPlanEvidence(input: Partial<SavedPlanFileEvidence> = {}): SavedPlanFileEvidence {
	const sourceBranch = input.sourceBranch ?? SOURCE_BRANCH;
	const slug = input.slug ?? PLAN_SLUG;
	return {
		slug,
		repoRoot: input.repoRoot ?? ROOT,
		repoKey: input.repoKey ?? buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl("git@github.com:owner/repo.git")),
		repoIdentitySource: input.repoIdentitySource ?? "origin-url",
		sourceBranch,
		branchKey: input.branchKey ?? encodeBranchForPlanPath(sourceBranch),
		filePath: input.filePath ?? `/tmp/${slug}.md`,
	};
}

export function paramsSlug(rawParams: unknown): string {
	if (typeof rawParams === "object" && rawParams !== null && "slug" in rawParams && typeof rawParams.slug === "string") {
		return rawParams.slug;
	}
	return PLAN_SLUG;
}

export const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

export function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

export function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

export interface ResolveWritePlanPromptStepOptions {
	content?: string;
	result?: Partial<ExecResult>;
}

export function resolveWritePlanPromptStep(options: ResolveWritePlanPromptStepOptions = {}): ScriptedExec {
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

export function planSlugArgs(content: string): string[] {
	return buildSlugModelArgs(buildPlanContentSlugPrompt(content));
}

export function planSlugStep(content: string, slug: string = PLAN_SLUG, result: Partial<ExecResult> = { stdout: `${slug}\n` }): ScriptedExec {
	return step("pi", planSlugArgs(content), result);
}

export function planSlugExecCall(content: string): { command: string; args: string[] } {
	return { command: "pi", args: planSlugArgs(content) };
}

export function savedPlanSlugArgs(content: string): string[] {
	return buildSlugModelArgs(buildSavedPlanContentSlugPrompt(content));
}

export interface SavedPlanSlugStepOptions {
	slug?: string;
	result?: Partial<ExecResult>;
}

export function savedPlanSlugStep(content: string, options: SavedPlanSlugStepOptions = {}): ScriptedExec {
	const slug = options.slug ?? PLAN_SLUG;
	const result = options.result ?? { stdout: `${slug}\n` };
	return step("pi", savedPlanSlugArgs(content), result);
}

export function contentSlugEvidence(slug: string = PLAN_SLUG): { slug: string; rawOutput: string; provider: string; model: string } {
	return { slug, rawOutput: `${slug}\n`, provider: DEFAULT_FAST_MODEL.provider, model: DEFAULT_FAST_MODEL.modelId };
}

export function savedPlanFileContent(fileName: string): string {
	return `# ${fileName}\n`;
}

export function gitRootStep(root: string = ROOT): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${root}\n` });
}

export function gitCurrentBranchStep(branch: string = SOURCE_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n`, ...result });
}

export function gitOriginStep(result: Partial<ExecResult> = { stdout: "git@github.com:owner/repo.git\n" }): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], result);
}

export function gitCheckoutStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["checkout", branch], result);
}

export function brmemListAttachedPlansStep(
	branch: string,
	entries: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>,
	result: Partial<ExecResult> = {},
): ScriptedExec {
	return step("brmem", ["list", "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--format", "json"], {
		stdout: brmemListEnvelope(branch, entries),
		...result,
	});
}

function brmemListEnvelope(branch: string, entries: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>): string {
	return JSON.stringify({
		exit_code: 0,
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
					ref_name: entry.refName ?? `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${entryBranch.replaceAll("/", "---")}:${entry.key}`,
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

export async function makeNamedPlanFile(fileName = `${PLAN_SLUG}.md`, content = DEFAULT_PLAN_CONTENT): Promise<string> {
	const dir = await makeTempDir();
	const filePath = join(dir, fileName);
	await writeFile(filePath, content, "utf8");
	return filePath;
}

export function planStoreDirectory(planStoreRoot: string, sourceBranch: string, origin = "git@github.com:owner/repo.git"): string {
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

export function sourcePlanEvidence(input: { slug: string; filePath: string; sourceBranch: string; origin?: string }): SavedPlanFileEvidence {
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

export function sourcePlanToolResultEntry(evidence: SavedPlanFileEvidence): unknown {
	return sourcePlanToolResultEntryForTool(evidence, "write_saved_plan_file");
}

export function sourcePlanToolResultEntryForTool(evidence: SavedPlanFileEvidence, toolName: string): unknown {
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

export function createToolContext(options: { hasUI?: boolean; cwd?: string } = {}): {
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

export function registeredTool(pi: FakePi, name = "write_saved_plan_file"): ToolDefinition {
	const tool = pi.tools.get(name);
	expect(tool).toBeDefined();
	if (!tool) {
		throw new Error(`${name} was not registered`);
	}
	return tool;
}

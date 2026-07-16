/**
 * Herdr dispatch-prompt core: creates a Graphite-tracked branch, stores a
 * Branch Memory payload, and opens the branch in a new Herdr workspace.
 *
 * ns owns: Graphite branch creation, Branch Memory payload, slot checkout,
 *          Pi launch command building.
 * Herdr owns: workspace creation, process launch, explicit pane targeting.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	checkBrmemEntry,
	putBrmemEntryFromFile,
	type BrmemCommandErrorInfo,
	type BrmemPutData,
} from "@nseng-ai/capability-kit/brmem-cli";
import {
	commandSucceeded,
	execApiToCommandRunner,
	type CommandExecApi,
	formatCommand,
	formatCommandDetails,
	formatCommandFailure,
	formatShellArg,
} from "@nseng-ai/foundation/command";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { runGraphiteCommand } from "@nseng-ai/capability-kit/graphite/branch";
import {
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "@nseng-ai/foundation/branch-slug";
import {
	generateRawTextWithModel,
	formatRawTextModelFailure,
} from "@nseng-ai/capability-kit/model-slug";
import {
	MODEL_OPERATION_IDS,
	loadModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/capability-kit/model-policy";
import { getPiLaunchOptions, type PiLaunchOptions } from "@nseng-ai/capability-kit/cmux/pi-launch";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { TextResult } from "@nseng-ai/foundation/primitives";
import type { CommandContext } from "@nseng-ai/capability-kit/cmux/types";

import { HERDR_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME } from "./command-surfaces.ts";
import { openBranchInHerdrWorkspace } from "./slot.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import type { SlotClient } from "@nseng-ai/slots/api";

type DispatchPromptRuntime = CommandExecApi & Pick<HerdrPiCommandApi, "getThinkingLevel">;

const COMMAND_NAME = HERDR_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME;
const DISPATCH_PROMPT_NAMESPACE = "herdr-dispatch";
const DISPATCH_PROMPT_KEY = "prompt.md";

export interface BranchCreateResult {
	branchName: string;
	parentBranch: string;
	startPoint: string;
}

export interface DispatchPromptPayloadOptions {
	stagingDir?: string;
	now?: () => number;
	shouldCleanupStagingFile?: boolean;
	slotClient?: SlotClient;
}

interface ResolvedDispatchPromptPayloadOptions {
	stagingDir?: string;
	now: () => number;
	shouldCleanupStagingFile: boolean;
}

type StoredDispatchPromptPayload = BrmemPutData;
type BrmemErrorInfo = BrmemCommandErrorInfo;

export type DispatchPromptStorageResult =
	| { ok: true; value: StoredDispatchPromptPayload }
	| { ok: false; error: BrmemErrorInfo };

type DispatchPromptPresenceResult =
	| { type: "present"; displayCommand: string }
	| { type: "absent" }
	| { type: "error"; error: BrmemErrorInfo };

interface StagedPayloadFile {
	filePath: string;
	cleanup(): Promise<void>;
}

export interface HandleHerdrSlotDispatchPromptOptions {
	pi: DispatchPromptRuntime;
	herdr: HerdrGateway;
	payloadOptions: ResolvedDispatchPromptPayloadOptions;
	slotClient?: SlotClient;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotDispatchPrompt(
	options: HandleHerdrSlotDispatchPromptOptions,
): Promise<void> {
	const { pi, herdr, payloadOptions, args, ctx } = options;
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}

	options.notifyProgress("Generating branch name…");
	await ctx.waitForIdle();

	const branch = await createTrackedBranchForPrompt(pi, ctx.cwd, prompt);
	if ("error" in branch) {
		ctx.ui.notify(branch.error, "error");
		return;
	}

	await dispatchTrackedBranchPrompt({
		pi,
		herdr,
		ctx,
		branch,
		content: buildLaunchPrompt(prompt),
		description: `herdr dispatch-prompt from ${branch.parentBranch}`,
		payloadOptions,
		...optionalEntry("slotClient", options.slotClient),
		notifyProgress: options.notifyProgress,
	});
}

async function dispatchTrackedBranchPrompt(options: {
	pi: DispatchPromptRuntime;
	herdr: HerdrGateway;
	ctx: CommandContext;
	branch: BranchCreateResult;
	content: string;
	description: string;
	payloadOptions: ResolvedDispatchPromptPayloadOptions;
	slotClient?: SlotClient;
	notifyProgress: (message: string) => void;
}): Promise<void> {
	const { pi, herdr, ctx, branch } = options;
	options.notifyProgress("Storing dispatch prompt in Branch Memory…");
	const stored = await storeDispatchPromptPayload({
		pi,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		content: options.content,
		payloadOptions: options.payloadOptions,
	});
	if (!stored.ok) {
		ctx.ui.notify(formatDispatchPromptStorageFailure(branch.branchName, stored.error), "error");
		return;
	}

	const launchOptions = getPiLaunchOptions(pi, ctx);
	const slotClient = options.slotClient ?? createHerdrSlotClient({ cwd: ctx.cwd });
	await openBranchInHerdrWorkspace({
		pi,
		herdr,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		command: buildBrmemPayloadPiLaunchCommand(branch.branchName, launchOptions),
		description: options.description,
		slotClient,
		notify: (message, level) => ctx.ui.notify(message, level),
		successMessage: (target) =>
			[
				`Opened Herdr workspace: ${target.branchName}`,
				`Parent: ${branch.parentBranch}`,
				`Start point: ${branch.startPoint}`,
				`Dispatch payload: ${stored.value.namespace}/${stored.value.key}`,
				`Entry Locator: ${stored.value.refName}`,
			].join("\n"),
		notifyProgress: options.notifyProgress,
	});
}

export async function createTrackedBranchForPrompt(
	pi: CommandExecApi,
	cwd: string,
	prompt: string,
): Promise<BranchCreateResult | { error: string }> {
	const parent = await runText(pi, cwd, "git", ["symbolic-ref", "--short", "HEAD"]);
	if (!parent.ok) {
		return { error: `Could not resolve current branch: ${parent.message}` };
	}

	const startPoint = await runText(pi, cwd, "git", ["rev-parse", "HEAD"]);
	if (!startPoint.ok) {
		return { error: `Could not resolve HEAD: ${startPoint.message}` };
	}

	return createTrackedBranchFromResolvedParent({
		pi,
		cwd,
		prompt,
		parentBranch: parent.text,
		startPoint: startPoint.text,
		startRef: "HEAD",
	});
}

export async function createTrackedBranchFromResolvedParent(options: {
	pi: CommandExecApi;
	cwd: string;
	prompt: string;
	parentBranch: string;
	startPoint: string;
	startRef: string;
	createFailureContext?: string;
}): Promise<BranchCreateResult | { error: string }> {
	const { pi, cwd, prompt, parentBranch, startPoint, startRef, createFailureContext } = options;
	const slug = await generateBranchSlug(pi, cwd, { kind: "task", content: prompt });
	if (!slug.ok) {
		return { error: slug.message };
	}

	const branchName = await chooseAvailableBranchName(pi, cwd, slug.text);
	const create = await runText(pi, cwd, "git", ["branch", branchName, startRef]);
	if (!create.ok) {
		const context = createFailureContext === undefined ? "" : ` ${createFailureContext}`;
		return { error: `Failed to create branch ${branchName}${context}: ${create.message}` };
	}

	const trackArgs = ["track", branchName, "--parent", parentBranch, "--no-interactive"];
	const track = await runGraphiteCommand(execApiToCommandRunner(pi), { cwd, args: trackArgs });
	if (!commandSucceeded(track)) {
		return {
			error: [
				`Created git branch ${branchName}, but Graphite tracking failed:`,
				formatCommandFailure("gt track failed", formatCommand("gt", trackArgs), track),
				"The Herdr workspace was not launched.",
			].join("\n"),
		};
	}

	return { branchName, parentBranch, startPoint };
}

export async function storeDispatchPromptPayload(options: {
	pi: CommandExecApi;
	cwd: string;
	branchName: string;
	content: string;
	payloadOptions: ResolvedDispatchPromptPayloadOptions;
}): Promise<DispatchPromptStorageResult> {
	const { pi, cwd, branchName, content, payloadOptions } = options;
	const presence = await checkDispatchPromptPayload(pi, cwd, branchName);
	switch (presence.type) {
		case "present":
			return {
				ok: false,
				error: {
					code: "dispatch_prompt_collision",
					message: `Branch Memory ${DISPATCH_PROMPT_NAMESPACE}/${DISPATCH_PROMPT_KEY} already exists on branch ${branchName}. Refusing to overwrite.`,
					displayCommand: presence.displayCommand,
				},
			};
		case "error":
			return { ok: false, error: presence.error };
		case "absent":
			break;
	}

	let staged: StagedPayloadFile;
	try {
		staged = await stagePayloadFile(payloadOptions, branchName, content);
	} catch (error) {
		return {
			ok: false,
			error: {
				code: "dispatch_prompt_stage_failed",
				message: `Failed to stage dispatch prompt payload: ${formatErrorMessage(error)}`,
			},
		};
	}

	try {
		return await putDispatchPromptPayload({ pi, cwd, branchName, sourceFile: staged.filePath });
	} finally {
		try {
			await staged.cleanup();
		} catch {
			// Cleanup failure does not change outcome.
		}
	}
}

async function checkDispatchPromptPayload(
	pi: CommandExecApi,
	cwd: string,
	branchName: string,
): Promise<DispatchPromptPresenceResult> {
	return checkBrmemEntry({
		gateway: pi,
		cwd,
		namespace: DISPATCH_PROMPT_NAMESPACE,
		key: DISPATCH_PROMPT_KEY,
		branch: branchName,
	});
}

async function putDispatchPromptPayload(options: {
	pi: CommandExecApi;
	cwd: string;
	branchName: string;
	sourceFile: string;
}): Promise<DispatchPromptStorageResult> {
	return putBrmemEntryFromFile({
		gateway: options.pi,
		cwd: options.cwd,
		namespace: DISPATCH_PROMPT_NAMESPACE,
		key: DISPATCH_PROMPT_KEY,
		branch: options.branchName,
		sourceFile: options.sourceFile,
	});
}

async function stagePayloadFile(
	options: ResolvedDispatchPromptPayloadOptions,
	branchName: string,
	content: string,
): Promise<StagedPayloadFile> {
	const directory = options.stagingDir ?? (await mkdtemp(join(tmpdir(), "herdr-dispatch-")));
	await mkdir(directory, { recursive: true });
	const stem = sanitizeBranchName(branchName)?.replace(/\//g, "-") ?? "prompt";
	const filePath = join(directory, `${options.now()}-${stem}.md`);
	await writeFile(filePath, content, "utf8");

	return {
		filePath,
		cleanup: async () => {
			if (!options.shouldCleanupStagingFile) return;
			if (options.stagingDir === undefined) {
				await rm(directory, { recursive: true, force: true });
				return;
			}
			await rm(filePath, { force: true });
		},
	};
}

export function resolveDispatchPromptPayloadOptions(
	options: DispatchPromptPayloadOptions,
): ResolvedDispatchPromptPayloadOptions {
	return {
		...(options.stagingDir === undefined ? {} : { stagingDir: options.stagingDir }),
		now: options.now ?? Date.now,
		shouldCleanupStagingFile: options.shouldCleanupStagingFile ?? true,
	};
}

export function buildBrmemPayloadPiLaunchCommand(
	branchName: string,
	launchOptions: PiLaunchOptions,
): string {
	const getArgs = [
		"get",
		DISPATCH_PROMPT_KEY,
		"--namespace",
		DISPATCH_PROMPT_NAMESPACE,
		"--branch",
		branchName,
	];
	const getCommand = formatCommand("brmem", getArgs);
	const piArgs = ["pi"];
	if (launchOptions.model !== undefined) {
		piArgs.push("--provider", launchOptions.model.provider, "--model", launchOptions.model.id);
	}
	if (launchOptions.thinkingLevel !== "off") {
		piArgs.push("--thinking", launchOptions.thinkingLevel);
	}
	const piCommand = `exec ${piArgs.map(formatShellArg).join(" ")} "$payload"`;
	return `payload="$(${getCommand})" && ${piCommand}`;
}

export function formatDispatchPromptStorageFailure(
	branchName: string,
	error: BrmemErrorInfo,
): string {
	if (error.code === "dispatch_prompt_collision") {
		return [
			`Created Graphite-tracked branch ${branchName}, but dispatch prompt payload already exists at Branch Memory ${DISPATCH_PROMPT_NAMESPACE}/${DISPATCH_PROMPT_KEY} on that branch.`,
			"Refusing to overwrite; no Herdr workspace was opened.",
		].join("\n");
	}
	return [
		`Created Graphite-tracked branch ${branchName}, but failed to store dispatch prompt payload in Branch Memory.`,
		"No Herdr workspace was opened.",
		"",
		error.message,
	].join("\n");
}

export function buildLaunchPrompt(prompt: string, contextNote?: string): string {
	const lines = [
		"## Completion instructions",
		"After you finish the implementation:",
		"1. Create or update the branch commit using the repo's normal workflow.",
		"2. Then run `!ns flow submit`.",
		"",
	];
	if (contextNote !== undefined) {
		lines.push("## Dispatch context", contextNote, "");
	}
	lines.push(prompt);
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Branch slug generation
// ---------------------------------------------------------------------------

const MAX_SLUG_INPUT_CHARS = 12_000;

export async function generateBranchSlug(
	pi: CommandExecApi,
	cwd: string,
	input: { kind: "task" | "plan"; content: string; fallbackText?: string },
): Promise<TextResult> {
	const prompt = buildSlugPrompt(input);
	const repository = await new RealGitGateway(pi).optionalRepoRoot({ cwd });
	if (repository.type !== "found") {
		return { ok: false, message: "Could not determine the repository root for ns.toml." };
	}
	const policy = loadModelPolicy({
		repoRoot: repository.value,
		gateway: nodeProjectConfigGateway,
	});
	if (!policy.ok) {
		return { ok: false, message: `Invalid model policy in ns.toml: ${policy.error.message}` };
	}
	const model = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
	if (!model.ok) {
		return { ok: false, message: `Invalid model policy in ns.toml: ${model.error.message}` };
	}
	const result = await generateRawTextWithModel({
		cwd,
		prompt,
		modelRef: model.value.modelRef,
		exec: (command, args, options) => pi.exec(command, args, options),
	});
	if (!result.ok) {
		return { ok: false, message: formatRawTextModelFailure(result.failure) };
	}

	const rawText = result.evidence.rawOutput.trim();
	const slug =
		sanitizeBranchName(rawText) || sanitizeBranchName(input.fallbackText ?? input.content);
	if (!slug) {
		return { ok: false, message: "Could not derive a usable branch slug." };
	}
	return { ok: true, text: slug };
}

function buildSlugPrompt(input: { kind: "task" | "plan"; content: string }): string {
	const kindDescription =
		input.kind === "plan"
			? "an implementation plan that will be stashed on a new branch"
			: "a user task prompt that will run in a new branch workspace";

	return [
		"Generate a concise git branch slug for this work item.",
		`The content is ${kindDescription}.`,
		"Infer the actual code/product change or outcome. Do not name the document, prompt, plan, context, storage workflow, or how this work item was initiated.",
		"Rules:",
		"- Return only the slug, with no quotes, markdown, or explanation.",
		"- Use kebab-case: lowercase ASCII words separated by hyphens.",
		`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
		"- Lead with a verb when natural.",
		"- Do not use spaces, underscores, slashes, punctuation, or special characters.",
		"",
		"Content:",
		truncateForPrompt(input.content, MAX_SLUG_INPUT_CHARS),
	].join("\n");
}

function truncateForPrompt(text: string, maxChars: number): string {
	return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n...[truncated]`;
}

// ---------------------------------------------------------------------------
// Branch availability
// ---------------------------------------------------------------------------

async function chooseAvailableBranchName(
	pi: CommandExecApi,
	cwd: string,
	baseName: string,
): Promise<string> {
	let candidate = baseName;
	for (let suffix = 2; await branchExists(pi, cwd, candidate); suffix += 1) {
		candidate = appendBranchSuffix(baseName, suffix);
	}
	return candidate;
}

async function branchExists(pi: CommandExecApi, cwd: string, branchName: string): Promise<boolean> {
	const result = await pi.exec(
		"git",
		["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
		{ cwd, timeout: 5_000 },
	);
	return commandSucceeded(result);
}

function appendBranchSuffix(branchName: string, suffix: number): string {
	const suffixText = `-${suffix}`;
	const stem = trimBranchSlugToLength(branchName, MAX_BRANCH_SLUG_LENGTH - suffixText.length);
	return `${stem}${suffixText}`;
}

// ---------------------------------------------------------------------------
// runText helper
// ---------------------------------------------------------------------------

export async function runText(
	pi: CommandExecApi,
	cwd: string,
	command: string,
	args: string[],
): Promise<TextResult> {
	const result = await pi.exec(command, args, { cwd, timeout: 30_000 });
	if (commandSucceeded(result)) {
		return { ok: true, text: result.stdout.trim() };
	}
	const stderr = result.stderr.trim();
	const stdout = result.stdout.trim();
	return {
		ok: false,
		message: stderr !== "" ? stderr : stdout !== "" ? stdout : formatCommandDetails(result),
	};
}

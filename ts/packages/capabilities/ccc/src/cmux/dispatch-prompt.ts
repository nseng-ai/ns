import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	checkBrmemEntry,
	putBrmemEntryFromFile,
	type BrmemCommandErrorInfo,
	type BrmemPutData,
} from "@sdl/capability-kit/brmem-cli";
import {
	commandSucceeded,
	execApiToCommandRunner,
	formatCommand,
	formatCommandFailure,
	formatShellArg,
	piExecApiToCommandExecApi,
} from "@sdl/core/command";
import { formatErrorMessage, optionalEntry } from "@sdl/core/primitives";
import { runGraphiteCommand } from "@sdl/capability-kit/graphite/branch";
import {
	generateBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "./branch-slug.ts";
import { getPiLaunchOptions, type PiLaunchOptions } from "@sdl/capability-kit/cmux/pi-launch";
import type { TextResult } from "@sdl/core/primitives";
import { openBranchInCmuxSlot } from "./slot.ts";
import { createCccSlotClient } from "./slot-checkout.ts";
import type { SlotCheckoutTarget, SlotClient } from "@sdl/slot/api";
import type { CommandContext, ExtensionAPI } from "@sdl/capability-kit/cmux/types";

const COMMAND_NAME = "ccc:workspace:dispatch-prompt";
const DISPATCH_PROMPT_NAMESPACE = "ccc-dispatch";
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

export interface HandleCccSlotDispatchPromptOptions {
	pi: Pick<ExtensionAPI, "exec" | "getThinkingLevel">;
	payloadOptions: ResolvedDispatchPromptPayloadOptions;
	slotClient?: SlotClient;
	args: string;
	ctx: CommandContext;
	notifyProgress: (message: string) => void;
}

type StoredDispatchPromptPayload = BrmemPutData;

// Keep this workflow-local: branch-context's gateway error type is coupled to its namespace policy.
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

export async function handleCccSlotDispatchPrompt(
	options: HandleCccSlotDispatchPromptOptions,
): Promise<void> {
	const { pi, payloadOptions, args, ctx } = options;
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
		ctx,
		branch,
		content: buildLaunchPrompt(prompt),
		description: `dispatch-prompt from ${branch.parentBranch}`,
		payloadOptions,
		...optionalEntry("slotClient", options.slotClient),
		notifyProgress: options.notifyProgress,
	});
}

export async function dispatchTrackedBranchPrompt(options: {
	pi: Pick<ExtensionAPI, "exec" | "getThinkingLevel">;
	ctx: CommandContext;
	branch: BranchCreateResult;
	content: string;
	description: string;
	payloadOptions: ResolvedDispatchPromptPayloadOptions;
	slotClient?: SlotClient;
	notifyProgress: (message: string) => void;
}): Promise<void> {
	const { pi, ctx, branch } = options;
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
	await openBranchInCmuxSlot({
		pi,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		command: buildBrmemPayloadPiLaunchCommand(branch.branchName, launchOptions),
		description: options.description,
		slotClient: options.slotClient ?? createCccSlotClient({ cwd: ctx.cwd }),
		notify: (message, level) => ctx.ui.notify(message, level),
		successMessage: (target) => formatDispatchPromptSuccessMessage(target, branch, stored.value),
	});
}

function formatDispatchPromptSuccessMessage(
	target: SlotCheckoutTarget,
	branch: BranchCreateResult,
	stored: StoredDispatchPromptPayload,
): string {
	return [
		`Opened cmux workspace: ${target.branchName}`,
		`Parent: ${branch.parentBranch}`,
		`Start point: ${branch.startPoint}`,
		`Dispatch payload: ${stored.namespace}/${stored.key}`,
		`Entry Locator: ${stored.refName}`,
	].join("\n");
}

export async function createTrackedBranchForPrompt(
	pi: Pick<ExtensionAPI, "exec">,
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
	pi: Pick<ExtensionAPI, "exec">;
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
	const track = await runGraphiteCommand(execApiToCommandRunner(piExecApiToCommandExecApi(pi)), {
		cwd,
		args: trackArgs,
	});
	if (!commandSucceeded(track)) {
		return {
			error: [
				`Created git branch ${branchName}, but Graphite tracking failed:`,
				formatCommandFailure("gt track failed", formatCommand("gt", trackArgs), track),
				"The slot/capability-kit/cmux prompt session was not launched.",
			].join("\n"),
		};
	}

	return {
		branchName,
		parentBranch,
		startPoint,
	};
}

async function chooseAvailableBranchName(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	baseName: string,
): Promise<string> {
	let candidate = baseName;
	for (let suffix = 2; await branchExists(pi, cwd, candidate); suffix += 1) {
		candidate = appendBranchSuffix(baseName, suffix);
	}
	return candidate;
}

async function branchExists(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	branchName: string,
): Promise<boolean> {
	const result = await pi.exec(
		"git",
		["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
		{
			cwd,
			timeout: 5_000,
		},
	);
	return result.code === 0;
}

function appendBranchSuffix(branchName: string, suffix: number): string {
	const suffixText = `-${suffix}`;
	const stem = trimBranchSlugToLength(branchName, MAX_BRANCH_SLUG_LENGTH - suffixText.length);
	return `${stem}${suffixText}`;
}

export async function storeDispatchPromptPayload(options: {
	pi: Pick<ExtensionAPI, "exec">;
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
		staged = await stageDispatchPromptPayload(payloadOptions, branchName, content);
	} catch (error) {
		return {
			ok: false,
			error: {
				code: "dispatch_prompt_stage_failed",
				message: `Failed to stage dispatch prompt payload for Branch Memory: ${formatErrorMessage(error)}`,
			},
		};
	}

	try {
		return await putDispatchPromptPayload({ pi, cwd, branchName, sourceFile: staged.filePath });
	} finally {
		try {
			await staged.cleanup();
		} catch {
			// The payload has already been stored or reported as failed; cleanup failure should not change command outcome.
		}
	}
}

async function checkDispatchPromptPayload(
	pi: Pick<ExtensionAPI, "exec">,
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
	pi: Pick<ExtensionAPI, "exec">;
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

async function stageDispatchPromptPayload(
	options: ResolvedDispatchPromptPayloadOptions,
	branchName: string,
	content: string,
): Promise<StagedPayloadFile> {
	const directory = options.stagingDir ?? (await mkdtemp(join(tmpdir(), "ccc-dispatch-prompt-")));
	await mkdir(directory, { recursive: true });
	const filePath = join(directory, `${options.now()}-${dispatchPromptFileStem(branchName)}.md`);
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

function dispatchPromptFileStem(branchName: string): string {
	return sanitizeBranchName(branchName)?.replace(/\//g, "-") ?? "prompt";
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
			"Refusing to overwrite; no cmux workspace was opened.",
		].join("\n");
	}
	return [
		`Created Graphite-tracked branch ${branchName}, but failed to store dispatch prompt payload in Branch Memory.`,
		"No cmux workspace was opened.",
		"",
		error.message,
	].join("\n");
}

export function buildLaunchPrompt(prompt: string, contextNote?: string): string {
	const lines = [prompt, ""];
	if (contextNote !== undefined) {
		lines.push("## Dispatch context", contextNote, "");
	}
	lines.push(
		"## Completion instructions",
		"After you finish the implementation:",
		"1. Create or update the branch commit using the repo's normal workflow.",
		"2. Then run `!ji flow submit`.",
	);
	return lines.join("\n");
}

export async function runText(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	command: string,
	args: string[],
): Promise<TextResult> {
	const result = await pi.exec(command, args, { cwd, timeout: 30_000 });
	if (result.code === 0 && !result.killed) {
		return { ok: true, text: result.stdout.trim() };
	}
	return {
		ok: false,
		message:
			result.stderr.trim() || result.stdout.trim() || `${command} exited with ${result.code}`,
	};
}

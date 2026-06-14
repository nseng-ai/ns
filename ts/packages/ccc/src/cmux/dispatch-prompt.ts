import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	brmemCommandFailure,
	parseBrmemPutData,
	runAvailableBrmemCommand,
	type BrmemCommandErrorInfo,
	type BrmemPutData,
} from "@asdl/core/brmem-cli";
import { formatCommand, formatShellArg } from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";
import {
	generateBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "./branch-slug.ts";
import { getPiLaunchOptions, type PiLaunchOptions } from "./pi-launch.ts";
import type { TextResult } from "./primitives.ts";
import { openBranchInCmuxSlot } from "./slot.ts";
import type { CommandContext, ExtensionAPI } from "./types.ts";

const COMMAND_NAME = "ccc:workspace:dispatch-prompt";
const DISPATCH_PROMPT_NAMESPACE = "ccc-dispatch";
const DISPATCH_PROMPT_KEY = "prompt.md";

interface BranchCreateResult {
	branchName: string;
	parentBranch: string;
	startPoint: string;
}

export interface DispatchPromptPayloadOptions {
	stagingDir?: string;
	now?: () => number;
	cleanupStagingFile?: boolean;
}

interface ResolvedDispatchPromptPayloadOptions {
	stagingDir?: string;
	now: () => number;
	cleanupStagingFile: boolean;
}

export interface HandleCccSlotDispatchPromptOptions {
	pi: Pick<ExtensionAPI, "exec" | "getThinkingLevel">;
	payloadOptions: ResolvedDispatchPromptPayloadOptions;
	args: string;
	ctx: CommandContext;
}

type StoredDispatchPromptPayload = BrmemPutData;

// Keep this workflow-local: branch-context's gateway error type is coupled to its namespace policy.
type BrmemErrorInfo = BrmemCommandErrorInfo;

type DispatchPromptStorageResult = { ok: true; value: StoredDispatchPromptPayload } | { ok: false; error: BrmemErrorInfo };

type DispatchPromptPresenceResult = { type: "present"; displayCommand: string } | { type: "absent" } | { type: "error"; error: BrmemErrorInfo };

interface StagedPayloadFile {
	filePath: string;
	cleanup(): Promise<void>;
}

export function registerCccSlotDispatchPromptCommand(
	pi: ExtensionAPI,
	options: DispatchPromptPayloadOptions = {},
): void {
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite-tracked branch and dispatch a prompt in a new cmux workspace.",
		argumentHint: "<prompt>",
		handler: async (args, ctx) => {
			await handleCccSlotDispatchPrompt({ pi, payloadOptions, args, ctx });
		},
	});
}

export async function handleCccSlotDispatchPrompt(options: HandleCccSlotDispatchPromptOptions): Promise<void> {
	const { pi, payloadOptions, args, ctx } = options;
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}

	await ctx.waitForIdle();
	ctx.ui.notify("Generating branch name…", "info");

	const branch = await createTrackedBranchForPrompt(pi, ctx.cwd, prompt);
	if ("error" in branch) {
		ctx.ui.notify(branch.error, "error");
		return;
	}

	ctx.ui.notify("Storing dispatch prompt in Branch Memory…", "info");
	const stored = await storeDispatchPromptPayload(pi, ctx.cwd, branch.branchName, buildLaunchPrompt(prompt), payloadOptions);
	if (!stored.ok) {
		ctx.ui.notify(formatDispatchPromptStorageFailure(branch.branchName, stored.error), "error");
		return;
	}

	const launchOptions = getPiLaunchOptions(pi, ctx);
	const launched = await openBranchInCmuxSlot({
		pi,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		command: buildBrmemPayloadPiLaunchCommand(branch.branchName, launchOptions),
		description: `dispatch-prompt from ${branch.parentBranch}`,
		notify: (message, level) => ctx.ui.notify(message, level),
		successMessage: (target) =>
			[
				`Opened cmux workspace: ${target.branchName}`,
				`Parent: ${branch.parentBranch}`,
				`Start point: ${branch.startPoint}`,
				`Dispatch payload: ${stored.value.namespace}/${stored.value.key}`,
				`Entry Locator: ${stored.value.refName}`,
			].join("\n"),
	});
	if ("error" in launched) {
		return;
	}
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

	const slug = await generateBranchSlug(pi, cwd, { kind: "task", content: prompt });
	if (!slug.ok) {
		return { error: slug.message };
	}

	const branchName = await chooseAvailableBranchName(pi, cwd, slug.text);
	const create = await runText(pi, cwd, "git", ["branch", branchName, "HEAD"]);
	if (!create.ok) {
		return { error: `Failed to create branch ${branchName}: ${create.message}` };
	}

	const track = await runText(pi, cwd, "gt", [
		"track",
		branchName,
		"--parent",
		parent.text,
		"--no-interactive",
	]);
	if (!track.ok) {
		return {
			error: [
				`Created git branch ${branchName}, but Graphite tracking failed:`,
				track.message,
				"The slot/cmux prompt session was not launched.",
			].join("\n"),
		};
	}

	return {
		branchName,
		parentBranch: parent.text,
		startPoint: startPoint.text,
	};
}

async function chooseAvailableBranchName(pi: Pick<ExtensionAPI, "exec">, cwd: string, baseName: string): Promise<string> {
	let candidate = baseName;
	for (let suffix = 2; await branchExists(pi, cwd, candidate); suffix += 1) {
		candidate = appendBranchSuffix(baseName, suffix);
	}
	return candidate;
}

async function branchExists(pi: Pick<ExtensionAPI, "exec">, cwd: string, branchName: string): Promise<boolean> {
	const result = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
		cwd,
		timeout: 5_000,
	});
	return result.code === 0;
}

function appendBranchSuffix(branchName: string, suffix: number): string {
	const suffixText = `-${suffix}`;
	const stem = trimBranchSlugToLength(branchName, MAX_BRANCH_SLUG_LENGTH - suffixText.length);
	return `${stem}${suffixText}`;
}

async function storeDispatchPromptPayload(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	branchName: string,
	content: string,
	options: ResolvedDispatchPromptPayloadOptions,
): Promise<DispatchPromptStorageResult> {
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
		staged = await stageDispatchPromptPayload(options, branchName, content);
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
		return await putDispatchPromptPayload(pi, cwd, branchName, staged.filePath);
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
	const run = await runAvailableBrmemCommand({
		gateway: pi,
		cwd,
		brmemArgs: [
			"check",
			DISPATCH_PROMPT_KEY,
			"--namespace",
			DISPATCH_PROMPT_NAMESPACE,
			"--branch",
			branchName,
			"--format",
			"json",
		],
	});
	if (!run.ok) return { type: "error", error: run.error };
	if (run.value.result.killed) {
		return { type: "error", error: brmemCommandFailure("brmem_check_killed", "brmem check timed out or was killed", run.value) };
	}
	if (run.value.result.code === 0) {
		return { type: "present", displayCommand: run.value.displayCommand };
	}
	if (run.value.result.code === 1) {
		return { type: "absent" };
	}
	return { type: "error", error: brmemCommandFailure("brmem_check_failed", "brmem check failed", run.value) };
}

async function putDispatchPromptPayload(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	branchName: string,
	sourceFile: string,
): Promise<DispatchPromptStorageResult> {
	const run = await runAvailableBrmemCommand({
		gateway: pi,
		cwd,
		brmemArgs: [
			"put",
			DISPATCH_PROMPT_KEY,
			"--namespace",
			DISPATCH_PROMPT_NAMESPACE,
			"--branch",
			branchName,
			"--file",
			sourceFile,
			"--format",
			"json",
		],
	});
	if (!run.ok) return run;
	if (run.value.result.code !== 0 || run.value.result.killed) {
		return { ok: false, error: brmemCommandFailure("brmem_put_failed", "brmem put failed", run.value) };
	}

	let data: BrmemPutData;
	try {
		data = parseBrmemPutData(run.value.result.stdout);
	} catch (error) {
		return {
			ok: false,
			error: {
				code: "brmem_malformed_put",
				message: formatErrorMessage(error),
				displayCommand: run.value.displayCommand,
			},
		};
	}

	const mismatch = validateBrmemPutData(data, { branchName, sourceFile });
	if (mismatch !== undefined) {
		return {
			ok: false,
			error: {
				code: "brmem_unexpected_put_data",
				message: mismatch,
				displayCommand: run.value.displayCommand,
			},
		};
	}

	return { ok: true, value: data };
}

async function stageDispatchPromptPayload(
	options: ResolvedDispatchPromptPayloadOptions,
	branchName: string,
	content: string,
): Promise<StagedPayloadFile> {
	const directory = options.stagingDir ?? await mkdtemp(join(tmpdir(), "ccc-dispatch-prompt-"));
	await mkdir(directory, { recursive: true });
	const filePath = join(directory, `${options.now()}-${dispatchPromptFileStem(branchName)}.md`);
	await writeFile(filePath, content, "utf8");

	return {
		filePath,
		cleanup: async () => {
			if (!options.cleanupStagingFile) return;
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

function resolveDispatchPromptPayloadOptions(options: DispatchPromptPayloadOptions): ResolvedDispatchPromptPayloadOptions {
	return {
		...(options.stagingDir === undefined ? {} : { stagingDir: options.stagingDir }),
		now: options.now ?? Date.now,
		cleanupStagingFile: options.cleanupStagingFile ?? true,
	};
}

function validateBrmemPutData(data: StoredDispatchPromptPayload, expected: { branchName: string; sourceFile: string }): string | undefined {
	const mismatches = expectedMismatches(
		{
			namespace: data.namespace,
			key: data.key,
			branch: data.branch,
			source_file: data.sourceFile,
		},
		{
			namespace: DISPATCH_PROMPT_NAMESPACE,
			key: DISPATCH_PROMPT_KEY,
			branch: expected.branchName,
			source_file: expected.sourceFile,
		},
	);
	if (mismatches.length === 0) {
		return undefined;
	}
	return `Unexpected brmem put JSON data: ${mismatches.join(", ")}.`;
}

function expectedMismatches(actual: Record<string, string>, expected: Record<string, string>): string[] {
	const mismatches: string[] = [];
	for (const [field, expectedValue] of Object.entries(expected)) {
		if (actual[field] !== expectedValue) {
			mismatches.push(`${field} ${JSON.stringify(actual[field])} != ${JSON.stringify(expectedValue)}`);
		}
	}
	return mismatches;
}

export function buildBrmemPayloadPiLaunchCommand(branchName: string, launchOptions: PiLaunchOptions): string {
	const getArgs = ["get", DISPATCH_PROMPT_KEY, "--namespace", DISPATCH_PROMPT_NAMESPACE, "--branch", branchName];
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

function formatDispatchPromptStorageFailure(branchName: string, error: BrmemErrorInfo): string {
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


export function buildLaunchPrompt(prompt: string): string {
	return [
		prompt,
		"",
		"## Completion instructions",
		"After you finish the implementation:",
		"1. Create or update the branch commit using the repo's normal workflow.",
		"2. Then run `!asdl-dev submit`.",
	].join("\n");
}

async function runText(
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
		message: result.stderr.trim() || result.stdout.trim() || `${command} exited with ${result.code}`,
	};
}

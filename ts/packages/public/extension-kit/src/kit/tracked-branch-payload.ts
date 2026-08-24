import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	checkBrmemEntry,
	putBrmemEntryFromFile,
	type BrmemCommandErrorInfo,
	type BrmemPutData,
} from "./brmem-cli.ts";
import {
	commandSucceeded,
	execApiToCommandRunner,
	type CommandExecApi,
	formatCommand,
	formatCommandDetails,
	formatCommandFailure,
} from "@nseng-ai/foundation/command";
import {
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "@nseng-ai/foundation/branch-slug";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { formatErrorMessage, isRecord, type TextResult } from "@nseng-ai/foundation/primitives";
import { runGraphiteCommand } from "../graphite/branch.ts";
import { deriveContentSlug, type ContentSlugPolicy } from "./content-slug.ts";
import { runJsonExecCommand } from "./machine-envelope-exec.ts";

export const TRACKED_BRANCH_PAYLOAD_NAMESPACE = "ns-impl";
export const TRACKED_BRANCH_PAYLOAD_KEY = "prompt.md";
/** Launch-context note stored with prompts launched from the existing local trunk. */
export const LOCAL_TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.";
const MAX_SLUG_INPUT_CHARS = 12_000;

export interface TrackedBranchEvidence {
	branchName: string;
	semanticSlug: string;
	parentBranch: string;
	startPoint: string;
}

export interface LocalGraphiteTrunkPreparation {
	type: "resolved-local-trunk";
	trunkBranch: string;
	startRef: string;
	startPoint: string;
}

export interface TrackedBranchPayloadOptions {
	stagingDir?: string;
	now?: () => number;
	shouldCleanupStagingFile?: boolean;
}

export interface ResolvedTrackedBranchPayloadOptions {
	stagingDir?: string;
	now: () => number;
	shouldCleanupStagingFile: boolean;
}

export type TrackedBranchPayloadStorageResult =
	| { ok: true; value: BrmemPutData }
	| { ok: false; error: BrmemCommandErrorInfo };

export type TrackedBranchPayloadLoadResult =
	| { ok: true; content: string }
	| { ok: false; error: BrmemCommandErrorInfo };

export interface ResolvedTrackedBranchCreationContext {
	pi: CommandExecApi;
	git: Pick<GitGateway, "createBranchAtStartPoint">;
	modelSelection: ModelSelection;
}

export interface TrackedBranchCreationContext extends ResolvedTrackedBranchCreationContext {
	git: Pick<GitGateway, "createBranchAtStartPoint" | "currentBranch" | "headCommit">;
}

export interface CreateTrackedBranchForPromptOptions {
	cwd: string;
	prompt: string;
}

export interface CreateTrackedBranchFromResolvedParentOptions {
	cwd: string;
	prompt: string;
	parentBranch: string;
	startPoint: string;
	createFailureContext?: string;
}

export interface LocalGraphiteTrunkPreparationContext {
	pi: CommandExecApi;
	trunkBranch: string;
}

export interface PrepareLocalGraphiteTrunkOptions {
	cwd: string;
	notify?: (message: string) => void;
}

export type TrackedBranchFromLocalTrunkCreationContext = LocalGraphiteTrunkPreparationContext &
	TrackedBranchCreationContext;

export interface CreateTrackedBranchFromLocalTrunkForPromptOptions extends PrepareLocalGraphiteTrunkOptions {
	prompt: string;
}

export interface TrackedBranchPayloadStorageContext {
	pi: CommandExecApi;
}

export interface StoreTrackedBranchPayloadOptions {
	cwd: string;
	branchName: string;
	content: string;
	payloadOptions: ResolvedTrackedBranchPayloadOptions;
}

export function resolveTrackedBranchPayloadOptions(
	options: TrackedBranchPayloadOptions,
): ResolvedTrackedBranchPayloadOptions {
	return {
		...(options.stagingDir === undefined ? {} : { stagingDir: options.stagingDir }),
		now: options.now ?? Date.now,
		shouldCleanupStagingFile: options.shouldCleanupStagingFile ?? true,
	};
}

export async function createTrackedBranchForPrompt(
	context: TrackedBranchCreationContext,
	options: CreateTrackedBranchForPromptOptions,
): Promise<TrackedBranchEvidence | { error: string }> {
	const parent = await context.git.currentBranch({ cwd: options.cwd });
	if (parent.type === "detached")
		return { error: "Could not resolve current branch: HEAD is detached." };
	if (parent.type === "failure") {
		return { error: `Could not resolve current branch: ${parent.error.message}` };
	}
	const startPoint = await context.git.headCommit({ cwd: options.cwd });
	if (!startPoint.ok) return { error: `Could not resolve HEAD: ${startPoint.error.message}` };
	return createTrackedBranchFromResolvedParent(context, {
		cwd: options.cwd,
		prompt: options.prompt,
		parentBranch: parent.branch,
		startPoint: startPoint.value,
	});
}

export async function createTrackedBranchFromResolvedParent(
	context: ResolvedTrackedBranchCreationContext,
	options: CreateTrackedBranchFromResolvedParentOptions,
): Promise<TrackedBranchEvidence | { error: string }> {
	const slug = await generateTrackedBranchSlug(
		context.pi,
		context.modelSelection,
		options.cwd,
		options.prompt,
	);
	if (!slug.ok) return { error: slug.message };
	const branchName = await chooseAvailableBranchName(context.pi, options.cwd, slug.text);
	const create = await context.git.createBranchAtStartPoint({
		cwd: options.cwd,
		branch: branchName,
		startPoint: options.startPoint,
	});
	if (!create.ok) {
		const failureContext =
			options.createFailureContext === undefined ? "" : ` ${options.createFailureContext}`;
		return {
			error: `Failed to create branch ${branchName}${failureContext}: ${create.error.message}`,
		};
	}
	const trackArgs = ["track", branchName, "--parent", options.parentBranch, "--no-interactive"];
	const track = await runGraphiteCommand(execApiToCommandRunner(context.pi), {
		cwd: options.cwd,
		args: trackArgs,
	});
	if (!commandSucceeded(track)) {
		return {
			error: [
				`Created git branch ${branchName}, but Graphite tracking failed:`,
				formatCommandFailure("gt track failed", formatCommand("gt", trackArgs), track),
				"The destination session was not launched.",
			].join("\n"),
		};
	}
	return {
		branchName,
		semanticSlug: slug.text,
		parentBranch: options.parentBranch,
		startPoint: options.startPoint,
	};
}

export async function prepareLocalGraphiteTrunk(
	context: LocalGraphiteTrunkPreparationContext,
	options: PrepareLocalGraphiteTrunkOptions,
): Promise<LocalGraphiteTrunkPreparation | { error: string }> {
	options.notify?.("Resolving local Graphite trunk…");
	const startRef = `refs/heads/${context.trunkBranch}`;
	const startPoint = await runText(context.pi, options.cwd, "git", [
		"rev-parse",
		"--verify",
		startRef,
	]);
	if (!startPoint.ok) {
		return {
			error: `Could not resolve local Graphite trunk ${context.trunkBranch}; no branch was created.\n${startPoint.message}`,
		};
	}
	return {
		type: "resolved-local-trunk",
		trunkBranch: context.trunkBranch,
		startRef,
		startPoint: startPoint.text,
	};
}

export async function createTrackedBranchFromLocalTrunkForPrompt(
	context: TrackedBranchFromLocalTrunkCreationContext,
	options: CreateTrackedBranchFromLocalTrunkForPromptOptions,
): Promise<TrackedBranchEvidence | { error: string }> {
	const prepared = await prepareLocalGraphiteTrunk(context, options);
	if ("error" in prepared) return prepared;
	options.notify?.("Generating branch name…");
	return createTrackedBranchFromResolvedParent(context, {
		cwd: options.cwd,
		prompt: options.prompt,
		parentBranch: prepared.trunkBranch,
		startPoint: prepared.startPoint,
		createFailureContext: `from local trunk ${prepared.trunkBranch}`,
	});
}

export async function storeTrackedBranchPayload(
	pi: CommandExecApi,
	options: StoreTrackedBranchPayloadOptions,
): Promise<TrackedBranchPayloadStorageResult> {
	const presence = await checkBrmemEntry({
		gateway: pi,
		cwd: options.cwd,
		namespace: TRACKED_BRANCH_PAYLOAD_NAMESPACE,
		key: TRACKED_BRANCH_PAYLOAD_KEY,
		branch: options.branchName,
	});
	if (presence.type === "present") {
		return {
			ok: false,
			error: {
				code: "dispatch_prompt_collision",
				message: `Branch Memory ${TRACKED_BRANCH_PAYLOAD_NAMESPACE}/${TRACKED_BRANCH_PAYLOAD_KEY} already exists on branch ${options.branchName}. Refusing to overwrite.`,
				displayCommand: presence.displayCommand,
			},
		};
	}
	if (presence.type === "error") return { ok: false, error: presence.error };
	let staged: { filePath: string; cleanup(): Promise<void> };
	try {
		staged = await stagePayload(options.payloadOptions, options.branchName, options.content);
	} catch (error) {
		return {
			ok: false,
			error: {
				code: "dispatch_prompt_stage_failed",
				message: `Failed to stage launch prompt payload for Branch Memory: ${formatErrorMessage(error)}`,
			},
		};
	}
	try {
		return await putBrmemEntryFromFile({
			gateway: pi,
			cwd: options.cwd,
			namespace: TRACKED_BRANCH_PAYLOAD_NAMESPACE,
			key: TRACKED_BRANCH_PAYLOAD_KEY,
			branch: options.branchName,
			sourceFile: staged.filePath,
		});
	} finally {
		try {
			await staged.cleanup();
		} catch {
			/* Stored outcome is authoritative; cleanup is best effort. */
		}
	}
}

export async function loadTrackedBranchPayload(
	pi: CommandExecApi,
	options: {
		cwd: string;
		branchName: string;
	},
): Promise<TrackedBranchPayloadLoadResult> {
	const args = [
		"get",
		TRACKED_BRANCH_PAYLOAD_KEY,
		"--namespace",
		TRACKED_BRANCH_PAYLOAD_NAMESPACE,
		"--branch",
		options.branchName,
		"--format",
		"json",
	];
	const result = await runJsonExecCommand({
		pi,
		cwd: options.cwd,
		command: "brmem",
		args,
		timeoutMs: 30_000,
		summary: `Failed to load Branch Memory ${TRACKED_BRANCH_PAYLOAD_NAMESPACE}/${TRACKED_BRANCH_PAYLOAD_KEY} on branch ${options.branchName}.`,
		label: "Branch Memory get result",
	});
	if (result.type === "failed") {
		return {
			ok: false,
			error: {
				code: "dispatch_prompt_read_failed",
				message: result.message,
				displayCommand: formatCommand("brmem", args),
			},
		};
	}
	if (!isRecord(result.data) || typeof result.data.content !== "string") {
		return {
			ok: false,
			error: {
				code: "dispatch_prompt_read_failed",
				message: "Branch Memory get result did not contain prompt text.",
			},
		};
	}
	return { ok: true, content: result.data.content };
}

/**
 * Builds the agent instruction paired with the tracked-branch payload transport.
 *
 * Single-consumer justification: keeping the completion envelope beside the payload contract prevents
 * storage and execution instructions from drifting. Demote this builder to Herdr if its content becomes
 * Herdr-specific or no longer travels through the tracked-branch payload contract.
 */
export function buildTrackedBranchImplPrompt(prompt: string, contextNote?: string): string {
	return [
		"## Completion instructions",
		"After you finish the implementation:",
		"1. Create or update the branch commit using the repo's normal workflow.",
		"2. Then run `!ns flow submit`.",
		"",
		...(contextNote === undefined ? [] : ["## Launch context", contextNote, ""]),
		prompt,
	].join("\n");
}

export function formatTrackedBranchPayloadStorageFailure(
	branchName: string,
	error: BrmemCommandErrorInfo,
	destinationName: string,
): string {
	if (error.code === "dispatch_prompt_collision") {
		return `Created Graphite-tracked branch ${branchName}, but implementation prompt payload already exists at Branch Memory ${TRACKED_BRANCH_PAYLOAD_NAMESPACE}/${TRACKED_BRANCH_PAYLOAD_KEY} on that branch.\nRefusing to overwrite; no ${destinationName} was opened.`;
	}
	return `Created Graphite-tracked branch ${branchName}, but failed to store implementation prompt payload in Branch Memory.\nNo ${destinationName} was opened.\n\n${error.message}`;
}

const TRACKED_BRANCH_SLUG_POLICY = {
	slugKind: "tracked branch slug",
	promptIntroLines: [
		"Generate a concise git branch slug for this work item.",
		"The content is a user task prompt that will run in a new branch workspace.",
		"Infer the actual code/product change or outcome. Do not name the document, prompt, plan, context, storage workflow, or how this work item was initiated.",
		"Ignore metadata and provenance such as saved-plan filenames, source labels, suggested slugs, objective-next output, branch-create handoff text, and brmem storage details.",
		"If a command name appears only because it generated or initiated the plan, do not include it. Include command/product names only when the proposed work directly changes that command/product.",
	],
	promptRuleLines: [
		"- Use kebab-case: lowercase ASCII words separated by hyphens.",
		`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
		"- Lead with a verb when natural, such as add-, fix-, refactor-, migrate-, rename-, remove-, or update-.",
		"- Do not use spaces, underscores, slashes, punctuation, or special characters.",
		"- Do not include generic suffixes like -plan, -prompt, -context, -branch, -task, or -suggestion unless they are the real feature name.",
		"- Prefer concrete deliverables and specific nouns from the work item over broad words like changes, cleanup, or improvements.",
	],
	contentHeading: "Content:",
	emptyContentPlaceholder: "(empty task prompt)",
	maxContentChars: MAX_SLUG_INPUT_CHARS,
	truncationMessage: "...[truncated]",
	invalidSlugMessage: "Pi slug model output normalized to an invalid tracked branch slug.",
	failureHeader: "Failed to derive tracked branch slug from task content.",
	noFallbackLine: "No deterministic fallback was attempted.",
	normalization: {
		maxChars: MAX_BRANCH_SLUG_LENGTH,
		stripSuffixes: ["-plan"],
	},
	validateSlug: () => undefined,
} satisfies ContentSlugPolicy;

async function generateTrackedBranchSlug(
	pi: CommandExecApi,
	modelSelection: ModelSelection,
	cwd: string,
	content: string,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
	const result = await deriveContentSlug(
		pi,
		{ cwd, content, modelSelection },
		TRACKED_BRANCH_SLUG_POLICY,
	);
	return result.ok
		? { ok: true, text: result.value.slug }
		: { ok: false, message: result.error.message };
}

async function chooseAvailableBranchName(
	pi: CommandExecApi,
	cwd: string,
	baseName: string,
): Promise<string> {
	let candidate = baseName;
	for (let suffix = 2; await branchExists(pi, cwd, candidate); suffix += 1) {
		const suffixText = `-${suffix}`;
		candidate = `${trimBranchSlugToLength(baseName, MAX_BRANCH_SLUG_LENGTH - suffixText.length)}${suffixText}`;
	}
	return candidate;
}

async function branchExists(pi: CommandExecApi, cwd: string, branchName: string): Promise<boolean> {
	return commandSucceeded(
		await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
			cwd,
			timeout: 5_000,
		}),
	);
}

async function stagePayload(
	options: ResolvedTrackedBranchPayloadOptions,
	branchName: string,
	content: string,
): Promise<{ filePath: string; cleanup(): Promise<void> }> {
	const directory = options.stagingDir ?? (await mkdtemp(join(tmpdir(), "ns-impl-prompt-")));
	await mkdir(directory, { recursive: true });
	const stem = sanitizeBranchName(branchName)?.replace(/\//g, "-") ?? "prompt";
	const filePath = join(directory, `${options.now()}-${stem}.md`);
	await writeFile(filePath, content, "utf8");
	return {
		filePath,
		cleanup: async () => {
			if (!options.shouldCleanupStagingFile) return;
			if (options.stagingDir === undefined) await rm(directory, { recursive: true, force: true });
			else await rm(filePath, { force: true });
		},
	};
}

async function runText(
	pi: CommandExecApi,
	cwd: string,
	command: string,
	args: string[],
): Promise<TextResult> {
	const result = await pi.exec(command, args, { cwd, timeout: 30_000 });
	if (commandSucceeded(result)) return { ok: true, text: result.stdout.trim() };
	const stderr = result.stderr.trim();
	const stdout = result.stdout.trim();
	return {
		ok: false,
		message: stderr !== "" ? stderr : stdout !== "" ? stdout : formatCommandDetails(result),
	};
}

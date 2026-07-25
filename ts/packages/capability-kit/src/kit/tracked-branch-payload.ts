import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

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
	formatShellArg,
} from "@nseng-ai/foundation/command";
import {
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "@nseng-ai/foundation/branch-slug";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage, type TextResult } from "@nseng-ai/foundation/primitives";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { runGraphiteCommand, type GraphiteBranchGateway } from "../graphite/branch.ts";
import {
	createGraphiteMetadataDbAccess,
	GRAPHITE_BRANCH_METADATA_QUERY,
	GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY,
	graphiteMetadataDbPath,
	hasExpectedGraphiteBranchMetadataSchema,
	parseGraphiteBranchMetadataRows,
	resolveGraphiteTrunkBranchFromTopology,
	type GraphiteMetadataDbAccess,
} from "../graphite/metadata.ts";
import { formatRawTextModelFailure, generateRawTextWithModel } from "./model-slug.ts";
import { MODEL_OPERATION_IDS, loadModelPolicy, resolveModelOperation } from "./model-policy.ts";
import { buildPiLaunchArgs, type PiLaunchOptions } from "./pi-launch.ts";

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
	pi: CommandExecApi,
	cwd: string,
	prompt: string,
	git: Pick<GitGateway, "createBranchAtStartPoint">,
): Promise<TrackedBranchEvidence | { error: string }> {
	const parent = await runText(pi, cwd, "git", ["symbolic-ref", "--short", "HEAD"]);
	if (!parent.ok) return { error: `Could not resolve current branch: ${parent.message}` };
	const startPoint = await runText(pi, cwd, "git", ["rev-parse", "HEAD"]);
	if (!startPoint.ok) return { error: `Could not resolve HEAD: ${startPoint.message}` };
	return createTrackedBranchFromResolvedParent({
		pi,
		git,
		cwd,
		prompt,
		parentBranch: parent.text,
		startPoint: startPoint.text,
	});
}

export async function createTrackedBranchFromResolvedParent(options: {
	pi: CommandExecApi;
	git: Pick<GitGateway, "createBranchAtStartPoint">;
	cwd: string;
	prompt: string;
	parentBranch: string;
	startPoint: string;
	createFailureContext?: string;
}): Promise<TrackedBranchEvidence | { error: string }> {
	const slug = await generateTrackedBranchSlug(options.pi, options.cwd, options.prompt);
	if (!slug.ok) return { error: slug.message };
	const branchName = await chooseAvailableBranchName(options.pi, options.cwd, slug.text);
	const create = await options.git.createBranchAtStartPoint({
		cwd: options.cwd,
		branch: branchName,
		startPoint: options.startPoint,
	});
	if (!create.ok) {
		const context =
			options.createFailureContext === undefined ? "" : ` ${options.createFailureContext}`;
		return { error: `Failed to create branch ${branchName}${context}: ${create.error.message}` };
	}
	const trackArgs = ["track", branchName, "--parent", options.parentBranch, "--no-interactive"];
	const track = await runGraphiteCommand(execApiToCommandRunner(options.pi), {
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

export async function prepareLocalGraphiteTrunk(options: {
	pi: CommandExecApi;
	cwd: string;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	notify?: (message: string) => void;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}): Promise<LocalGraphiteTrunkPreparation | { error: string }> {
	options.notify?.("Resolving local Graphite trunk…");
	const trunk = await resolveGraphiteTrunkBranch({
		pi: options.pi,
		cwd: options.cwd,
		graphite: options.graphite,
		metadataDbAccess: options.metadataDbAccess ?? createGraphiteMetadataDbAccess(),
	});
	if ("error" in trunk) return trunk;
	const startRef = `refs/heads/${trunk.branch}`;
	const startPoint = await runText(options.pi, options.cwd, "git", [
		"rev-parse",
		"--verify",
		startRef,
	]);
	if (!startPoint.ok) {
		return {
			error: `Could not resolve local Graphite trunk ${trunk.branch}; no branch was created.\n${startPoint.message}`,
		};
	}
	return {
		type: "resolved-local-trunk",
		trunkBranch: trunk.branch,
		startRef,
		startPoint: startPoint.text,
	};
}

export async function createTrackedBranchFromLocalTrunkForPrompt(options: {
	pi: CommandExecApi;
	cwd: string;
	prompt: string;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "createBranchAtStartPoint">;
	notify?: (message: string) => void;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}): Promise<TrackedBranchEvidence | { error: string }> {
	const prepared = await prepareLocalGraphiteTrunk(options);
	if ("error" in prepared) return prepared;
	options.notify?.("Generating branch name…");
	return createTrackedBranchFromResolvedParent({
		pi: options.pi,
		git: options.git,
		cwd: options.cwd,
		prompt: options.prompt,
		parentBranch: prepared.trunkBranch,
		startPoint: prepared.startPoint,
		createFailureContext: `from local trunk ${prepared.trunkBranch}`,
	});
}

export async function storeTrackedBranchPayload(options: {
	pi: CommandExecApi;
	cwd: string;
	branchName: string;
	content: string;
	payloadOptions: ResolvedTrackedBranchPayloadOptions;
}): Promise<TrackedBranchPayloadStorageResult> {
	const presence = await checkBrmemEntry({
		gateway: options.pi,
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
			gateway: options.pi,
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

export function buildTrackedBranchPayloadLaunchCommand(
	branchName: string,
	launchOptions: PiLaunchOptions,
): string {
	const getCommand = formatCommand("brmem", [
		"get",
		TRACKED_BRANCH_PAYLOAD_KEY,
		"--namespace",
		TRACKED_BRANCH_PAYLOAD_NAMESPACE,
		"--branch",
		branchName,
	]);
	// The prompt payload travels through a shell variable, so the final pi argument
	// must stay the double-quoted expansion `"$payload"` rather than a quoted literal.
	const piArgs = buildPiLaunchArgs("$payload", launchOptions);
	const launchCommand = piArgs
		.map((arg, index) => (index === piArgs.length - 1 ? `"${arg}"` : formatShellArg(arg)))
		.join(" ");
	return `payload="$(${getCommand})" && exec ${launchCommand}`;
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

async function generateTrackedBranchSlug(
	pi: CommandExecApi,
	cwd: string,
	content: string,
): Promise<TextResult> {
	const repository = await new RealGitGateway(pi).repoRoot({ cwd });
	if (!repository.ok) {
		return {
			ok: false,
			message: `Could not resolve the Git repository root: ${repository.error.message}`,
		};
	}
	const policy = loadModelPolicy({ repoRoot: repository.value, gateway: nodeProjectConfigGateway });
	if (!policy.ok)
		return { ok: false, message: `Invalid model policy in ns.toml: ${policy.error.message}` };
	const model = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
	if (!model.ok)
		return { ok: false, message: `Invalid model policy in ns.toml: ${model.error.message}` };
	const prompt = buildTrackedBranchSlugPrompt({ kind: "task", content });
	const result = await generateRawTextWithModel({
		cwd,
		prompt,
		modelSelection: model.value.selection,
		exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
	});
	if (!result.ok) return { ok: false, message: formatRawTextModelFailure(result.failure) };
	const slug = sanitizeBranchName(result.evidence.rawOutput.trim()) || sanitizeBranchName(content);
	return slug
		? { ok: true, text: slug }
		: { ok: false, message: "Could not derive a usable branch slug." };
}

export function buildTrackedBranchSlugPrompt(input: {
	kind: "task" | "plan";
	content: string;
	sourceLabel?: string;
}): string {
	const kindDescription =
		input.kind === "plan"
			? "an implementation plan that will be stashed on a new branch"
			: "a user task prompt that will run in a new branch workspace";
	return [
		"Generate a concise git branch slug for this work item.",
		`The content is ${kindDescription}.`,
		"Infer the actual code/product change or outcome. Do not name the document, prompt, plan, context, storage workflow, or how this work item was initiated.",
		"Ignore metadata and provenance such as saved-plan filenames, source labels, suggested slugs, objective-next output, branch-create handoff text, and brmem storage details.",
		"If a command name appears only because it generated or initiated the plan, do not include it. Include command/product names only when the proposed work directly changes that command/product.",
		"Rules:",
		"- Return only the slug, with no quotes, markdown, or explanation.",
		"- Use kebab-case: lowercase ASCII words separated by hyphens.",
		`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
		"- Lead with a verb when natural, such as add-, fix-, refactor-, migrate-, rename-, remove-, or update-.",
		"- Do not use spaces, underscores, slashes, punctuation, or special characters.",
		"- Do not include generic suffixes like -plan, -prompt, -context, -branch, -task, or -suggestion unless they are the real feature name.",
		"- Prefer concrete deliverables and specific nouns from the work item over broad words like changes, cleanup, or improvements.",
		"",
		...(input.sourceLabel === undefined ? [] : [`Source: ${input.sourceLabel}`]),
		"Content:",
		input.content.length <= MAX_SLUG_INPUT_CHARS
			? input.content
			: `${input.content.slice(0, MAX_SLUG_INPUT_CHARS)}\n...[truncated]`,
	].join("\n");
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

async function resolveGraphiteTrunkBranch(context: {
	pi: CommandExecApi;
	cwd: string;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	metadataDbAccess: GraphiteMetadataDbAccess;
}): Promise<{ branch: string } | { error: string }> {
	const trunk = await context.graphite.trunkBranch({ cwd: context.cwd });
	if (trunk.ok) return { branch: trunk.branch };
	if (trunk.reason !== "detached-head")
		return { error: `Could not resolve Graphite trunk.\n${trunk.error.message}` };
	const commonDir = await runText(context.pi, context.cwd, "git", [
		"rev-parse",
		"--git-common-dir",
	]);
	if (!commonDir.ok)
		return {
			error: `${trunk.error.message}\n\nCould not inspect Graphite metadata fallback: ${commonDir.message}`,
		};
	const dbPath = graphiteMetadataDbPath(
		isAbsolute(commonDir.text) ? commonDir.text : resolve(context.cwd, commonDir.text),
	);
	if (!context.metadataDbAccess.exists(dbPath))
		return {
			error: `${trunk.error.message}\n\nGraphite metadata fallback unavailable: metadata store not found at ${dbPath}`,
		};
	const schema = context.metadataDbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY);
	if (!schema.ok)
		return {
			error: `${trunk.error.message}\n\nGraphite metadata fallback failed: ${schema.error.message}`,
		};
	if (!hasExpectedGraphiteBranchMetadataSchema(schema.value))
		return {
			error: `${trunk.error.message}\n\nGraphite metadata fallback failed: branch_metadata schema mismatch.`,
		};
	const rows = context.metadataDbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_QUERY);
	if (!rows.ok)
		return {
			error: `${trunk.error.message}\n\nGraphite metadata fallback failed: ${rows.error.message}`,
		};
	const parsed = parseGraphiteBranchMetadataRows(rows.value);
	if (parsed.type === "not_array")
		return {
			error: `${trunk.error.message}\n\nGraphite metadata fallback failed: branch_metadata rows were not an array.`,
		};
	const resolution = resolveGraphiteTrunkBranchFromTopology(parsed.topology);
	if (resolution.type === "trunk") return { branch: resolution.branch };
	return {
		error: `${trunk.error.message}\n\n${resolution.type === "none" ? "Graphite metadata fallback found no trunk marker." : `Graphite metadata fallback found multiple trunk markers: ${resolution.branches.join(", ")}`}`,
	};
}

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
import {
	planLocalBranchRefreshFromWorktrees,
	type GitBranchUpstream,
	type GitGateway,
	type LocalBranchRefreshPlan,
	RealGitGateway,
} from "@nseng-ai/foundation/git";
import { formatModelRef } from "@nseng-ai/foundation/model-slug";
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

export const TRACKED_BRANCH_PAYLOAD_NAMESPACE = "ns-dispatch";
export const TRACKED_BRANCH_PAYLOAD_KEY = "prompt.md";
/** Dispatch-context note stored with prompts dispatched from refreshed trunk. */
export const TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from refreshed Graphite trunk and is intentionally unrelated to the caller's current stack.";
const MAX_SLUG_INPUT_CHARS = 12_000;
const GIT_TRUNK_REFRESH_TIMEOUT_MS = 2 * 60 * 1000;

export interface TrackedBranchEvidence {
	branchName: string;
	parentBranch: string;
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
): Promise<TrackedBranchEvidence | { error: string }> {
	const parent = await runText(pi, cwd, "git", ["symbolic-ref", "--short", "HEAD"]);
	if (!parent.ok) return { error: `Could not resolve current branch: ${parent.message}` };
	const startPoint = await runText(pi, cwd, "git", ["rev-parse", "HEAD"]);
	if (!startPoint.ok) return { error: `Could not resolve HEAD: ${startPoint.message}` };
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
}): Promise<TrackedBranchEvidence | { error: string }> {
	const slug = await generateTrackedBranchSlug(options.pi, options.cwd, options.prompt);
	if (!slug.ok) return { error: slug.message };
	const branchName = await chooseAvailableBranchName(options.pi, options.cwd, slug.text);
	const create = await runText(options.pi, options.cwd, "git", [
		"branch",
		branchName,
		options.startRef,
	]);
	if (!create.ok) {
		const context =
			options.createFailureContext === undefined ? "" : ` ${options.createFailureContext}`;
		return { error: `Failed to create branch ${branchName}${context}: ${create.message}` };
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
	return { branchName, parentBranch: options.parentBranch, startPoint: options.startPoint };
}

export async function createTrackedBranchFromTrunkForPrompt(options: {
	pi: CommandExecApi;
	cwd: string;
	prompt: string;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
	notify?: (message: string) => void;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}): Promise<TrackedBranchEvidence | { error: string }> {
	options.notify?.("Resolving Graphite trunk…");
	const trunk = await resolveGraphiteTrunkBranch({
		pi: options.pi,
		cwd: options.cwd,
		graphite: options.graphite,
		metadataDbAccess: options.metadataDbAccess ?? createGraphiteMetadataDbAccess(),
	});
	if ("error" in trunk) return trunk;
	options.notify?.("Resolving configured Git upstream…");
	const upstream = await options.git.branchUpstream({ cwd: options.cwd, branch: trunk.branch });
	if (upstream.type === "missing") {
		return {
			error: `Graphite trunk ${trunk.branch} has no configured Git upstream; no branch was created.\nConfigure one with git branch --set-upstream-to=<remote>/<remote-branch> ${trunk.branch}, then retry.`,
		};
	}
	if (upstream.type === "error") {
		return {
			error: `Could not inspect the configured Git upstream for Graphite trunk ${trunk.branch}; no branch was created.\n${upstream.error.message}`,
		};
	}
	options.notify?.("Refreshing Graphite trunk…");
	const refresh = await refreshLocalTrunkBranch({
		pi: options.pi,
		cwd: options.cwd,
		trunkBranch: trunk.branch,
		upstream: upstream.value,
	});
	if (!refresh.ok)
		return {
			error: `Graphite trunk refresh failed for ${trunk.branch}; no branch was created.\n${refresh.message}`,
		};
	const startPoint = await runText(options.pi, options.cwd, "git", ["rev-parse", trunk.branch]);
	if (!startPoint.ok)
		return { error: `Could not resolve refreshed trunk ${trunk.branch}: ${startPoint.message}` };
	options.notify?.("Generating branch name…");
	return createTrackedBranchFromResolvedParent({
		pi: options.pi,
		cwd: options.cwd,
		prompt: options.prompt,
		parentBranch: trunk.branch,
		startPoint: startPoint.text,
		startRef: trunk.branch,
		createFailureContext: `from refreshed trunk ${trunk.branch}`,
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
				message: `Failed to stage dispatch prompt payload for Branch Memory: ${formatErrorMessage(error)}`,
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

export function buildTrackedBranchLaunchPrompt(prompt: string, contextNote?: string): string {
	return [
		"## Completion instructions",
		"After you finish the implementation:",
		"1. Create or update the branch commit using the repo's normal workflow.",
		"2. Then run `!ns flow submit`.",
		"",
		...(contextNote === undefined ? [] : ["## Dispatch context", contextNote, ""]),
		prompt,
	].join("\n");
}

export function formatTrackedBranchPayloadStorageFailure(
	branchName: string,
	error: BrmemCommandErrorInfo,
	destinationName: string,
): string {
	if (error.code === "dispatch_prompt_collision") {
		return `Created Graphite-tracked branch ${branchName}, but dispatch prompt payload already exists at Branch Memory ${TRACKED_BRANCH_PAYLOAD_NAMESPACE}/${TRACKED_BRANCH_PAYLOAD_KEY} on that branch.\nRefusing to overwrite; no ${destinationName} was opened.`;
	}
	return `Created Graphite-tracked branch ${branchName}, but failed to store dispatch prompt payload in Branch Memory.\nNo ${destinationName} was opened.\n\n${error.message}`;
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
		modelRef: formatModelRef(model.value.selection),
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
	const directory = options.stagingDir ?? (await mkdtemp(join(tmpdir(), "ns-dispatch-prompt-")));
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

async function refreshLocalTrunkBranch(options: {
	pi: CommandExecApi;
	cwd: string;
	trunkBranch: string;
	upstream: GitBranchUpstream;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	const worktrees = await options.pi.exec("git", ["worktree", "list", "--porcelain"], {
		cwd: options.cwd,
		timeout: GIT_TRUNK_REFRESH_TIMEOUT_MS,
	});
	if (!commandSucceeded(worktrees))
		return {
			ok: false,
			message: formatCommandFailure(
				"Could not inspect Git worktrees.",
				"git worktree list --porcelain",
				worktrees,
			),
		};
	const plan = planLocalBranchRefreshFromWorktrees({
		branch: options.trunkBranch,
		cwd: options.cwd,
		upstream: options.upstream,
		worktreePorcelain: worktrees.stdout,
	});
	const refresh = await options.pi.exec("git", plan.args, {
		cwd: plan.cwd,
		timeout: GIT_TRUNK_REFRESH_TIMEOUT_MS,
	});
	if (commandSucceeded(refresh)) return { ok: true };
	return {
		ok: false,
		message: `${formatCommandFailure(formatTrunkRefreshFailureTitle(plan, options.trunkBranch), formatCommand("git", plan.args), refresh)}\nCwd: ${plan.cwd}`,
	};
}

function formatTrunkRefreshFailureTitle(plan: LocalBranchRefreshPlan, trunkBranch: string): string {
	return plan.type === "pull-checked-out-branch"
		? `Could not pull checked-out trunk branch ${trunkBranch}.`
		: `Could not fetch trunk branch ${trunkBranch}.`;
}

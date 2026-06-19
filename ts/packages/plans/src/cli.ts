#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { legacyCommand, type LegacyPayload } from "@asdl/clinkr/legacy";
import { z } from "zod";

import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { readStdin } from "@asdl/core/stdin";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import {
	normalizePlanFilePath,
	resolvePlanSourceFile,
	validatePlanSlug,
} from "./plan-persistence.ts";
import {
	findLatestSavedPlanFile,
	formatSavedPlanFileEvidence,
	listSavedPlans,
	writeSavedPlanFile,
	type LatestSavedPlanFileEvidence,
	type SavedPlanFileEvidence,
	type SavedPlanListItem,
} from "./saved-plan-file.ts";

const VERSION = "0.1.0";
const PLANS_ERROR_TYPE = "plans_error";

const listRequestSchema = z.object({
	planStoreRoot: z
		.string()
		.optional()
		.describe("Plan store root directory (relative paths resolve against cwd)."),
});

const saveRequestSchema = z.object({
	slug: z.string().describe("Saved plan slug."),
	summary: z.string().optional().describe("Optional saved-plan summary."),
	stdin: z.boolean().optional().describe("Read plan content from stdin."),
	contentFile: z.string().optional().describe("Read plan content from this file path."),
});

const resolveRequestSchema = z.object({
	path: z.string().optional().describe("Absolute, @-prefixed, or home-relative plan file path."),
});

type ListRequest = z.infer<typeof listRequestSchema>;
type SaveRequest = z.infer<typeof saveRequestSchema>;
type ResolveRequest = z.infer<typeof resolveRequestSchema>;

interface ExplicitResolvePlanEvidence {
	source: "explicit";
	filePath: string;
}

type LatestResolvePlanEvidence = LatestSavedPlanFileEvidence & { source: "latest" };

type ResolvePlanEvidence = ExplicitResolvePlanEvidence | LatestResolvePlanEvidence;

export interface CliDeps {
	commands?: CommandExecApi | undefined;
	git?: GitGateway | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	stdin?: (() => Promise<string>) | undefined;
	planStoreRoot?: string | undefined;
}

export interface PlansCliContext {
	commands: CommandExecApi;
	git: GitGateway;
	cwd: string;
	stdin: () => Promise<string>;
	planStoreRoot?: string;
}

export function buildCli(): ClinkrGroup<PlansCliContext> {
	const root = new ClinkrGroup<PlansCliContext>({
		name: "enriched-plan",
		description: "Enriched-plan operations. An enriched plan is any plan saved into asdl.",
		version: VERSION,
		runtimeInfo,
	});

	root.command(
		legacyCommand({
			name: "list",
			description: "List saved plans for the current repository across all branch keys.",
			schema: listRequestSchema,
			errorType: PLANS_ERROR_TYPE,
			run: handleList,
		}),
	);

	const execGroup = new ClinkrGroup<PlansCliContext>({
		name: "exec",
		description: "Run hidden deterministic saved-plan operations for agents.",
		isHidden: true,
	});
	execGroup.command(
		legacyCommand({
			name: "save",
			description: "Save a source-branch plan file in the local store.",
			schema: saveRequestSchema,
			errorType: PLANS_ERROR_TYPE,
			run: handleSave,
		}),
	);
	execGroup.command(
		legacyCommand({
			name: "resolve",
			description: "Resolve an explicit or latest source-branch plan file.",
			schema: resolveRequestSchema,
			positionals: { path: { position: 0 } },
			errorType: PLANS_ERROR_TYPE,
			run: handleResolve,
		}),
	);
	root.group(execGroup);

	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const commands = deps.commands ?? new NodeCommandExecApi();
	const context: PlansCliContext = {
		commands,
		git: deps.git ?? new RealGitGateway(commands),
		cwd: deps.cwd ?? process.cwd(),
		stdin: deps.stdin ?? readStdin,
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	};
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	return buildCli().run(args, { context, io });
}

async function handleList(ctx: PlansCliContext, request: ListRequest): Promise<LegacyPayload> {
	const cliPlanStoreRoot =
		request.planStoreRoot === undefined
			? undefined
			: normalizeRootPath(request.planStoreRoot, ctx.cwd);
	const planStoreRoot = cliPlanStoreRoot ?? ctx.planStoreRoot;
	const plans = await listSavedPlans(ctx.commands, {
		cwd: ctx.cwd,
		git: ctx.git,
		...(planStoreRoot === undefined ? {} : { planStoreRoot }),
	});
	return {
		machine: { plans: plans.map(savedPlanListItemJson) },
		human: stripOneTrailingNewline(formatSavedPlanList(plans)),
	};
}

async function handleSave(ctx: PlansCliContext, request: SaveRequest): Promise<LegacyPayload> {
	const slugError = validatePlanSlug(request.slug);
	if (slugError !== undefined) throw new Error(`Invalid saved plan slug: ${slugError}`);
	if (Boolean(request.stdin) === (request.contentFile !== undefined)) {
		throw new Error("Pass exactly one of --stdin or --content-file <path>.");
	}

	const content =
		request.stdin === true
			? await ctx.stdin()
			: await readFile(normalizePlanFilePath(request.contentFile as string), "utf8");
	const evidence = await writeSavedPlanFile(
		ctx.commands,
		{
			slug: request.slug,
			content,
			...(request.summary === undefined ? {} : { summary: request.summary }),
		},
		{
			cwd: ctx.cwd,
			git: ctx.git,
			...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }),
		},
	);
	return { machine: savedPlanFileJson(evidence), human: formatSavedPlanFileEvidence(evidence) };
}

async function handleResolve(
	ctx: PlansCliContext,
	request: ResolveRequest,
): Promise<LegacyPayload> {
	const evidence = await resolvePlanEvidence(request, ctx);
	return { machine: resolvePlanJson(evidence), human: formatResolvePlanEvidence(evidence) };
}

function normalizeRootPath(rawPath: string, cwd: string): string {
	const normalized = normalizePlanFilePath(rawPath);
	return resolve(cwd, normalized);
}

async function resolvePlanEvidence(
	args: ResolveRequest,
	ctx: PlansCliContext,
): Promise<ResolvePlanEvidence> {
	if (args.path !== undefined) {
		const filePath = await resolvePlanSourceFile(ctx.commands, {
			cwd: ctx.cwd,
			rawFilePath: args.path,
			git: ctx.git,
		});
		return { source: "explicit", filePath };
	}
	const latest = await findLatestSavedPlanFile(ctx.commands, {
		cwd: ctx.cwd,
		git: ctx.git,
		...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }),
	});
	return { source: "latest", ...latest };
}

function formatSavedPlanList(plans: readonly SavedPlanListItem[]): string {
	if (plans.length === 0) {
		return "No saved plans found for the current repository.\n";
	}

	const lines = ["Saved plans:"];
	for (const plan of plans) {
		lines.push(
			[
				`- ${plan.slug}`,
				`  Branch key: ${plan.branchKey}`,
				`  Modified: ${new Date(plan.modifiedTimeMs).toISOString()}`,
				`  Path: ${plan.filePath}`,
			].join("\n"),
		);
	}
	return `${lines.join("\n")}\n`;
}

function savedPlanListItemJson(plan: SavedPlanListItem): Record<string, unknown> {
	return {
		slug: plan.slug,
		branch_key: plan.branchKey,
		modified_time_ms: plan.modifiedTimeMs,
		path: plan.filePath,
		file_name: plan.fileName,
		repo: {
			root: plan.repoRoot,
			key: plan.repoKey,
			identity_source: plan.repoIdentitySource,
			plan_store_path: plan.repoDirectoryPath,
		},
	};
}

function savedPlanFileJson(evidence: SavedPlanFileEvidence): Record<string, unknown> {
	return {
		slug: evidence.slug,
		file_path: evidence.filePath,
		repo_root: evidence.repoRoot,
		repo_key: evidence.repoKey,
		repo_identity_source: evidence.repoIdentitySource,
		source_branch: evidence.sourceBranch,
		branch_key: evidence.branchKey,
		...(evidence.summary === undefined ? {} : { summary: evidence.summary }),
	};
}

function resolvePlanJson(evidence: ResolvePlanEvidence): Record<string, unknown> {
	switch (evidence.source) {
		case "explicit":
			return {
				source: evidence.source,
				file_path: evidence.filePath,
			};
		case "latest":
			return {
				source: evidence.source,
				file_path: evidence.filePath,
				slug: evidence.slug,
				file_name: evidence.fileName,
				modified_time_ms: evidence.modifiedTimeMs,
				repo_root: evidence.repoRoot,
				repo_key: evidence.repoKey,
				repo_identity_source: evidence.repoIdentitySource,
				source_branch: evidence.sourceBranch,
				branch_key: evidence.branchKey,
				directory_path: evidence.directoryPath,
			};
	}
}

function formatResolvePlanEvidence(evidence: ResolvePlanEvidence): string {
	if (evidence.source === "explicit") {
		return [`Resolved explicit plan file.`, `Path: ${evidence.filePath}`].join("\n");
	}
	return formatLatestSavedPlanFileEvidence(evidence);
}

function formatLatestSavedPlanFileEvidence(evidence: LatestSavedPlanFileEvidence): string {
	return [
		"Resolved latest saved plan file in local plan store.",
		`Path: ${evidence.filePath}`,
		`Repo key: ${evidence.repoKey}`,
		`Repo root: ${evidence.repoRoot}`,
		`Repo identity source: ${evidence.repoIdentitySource}`,
		`Source branch: ${evidence.sourceBranch}`,
		`Branch path segment: ${evidence.branchKey}`,
		`Slug: ${evidence.slug}`,
		`Modified time ms: ${evidence.modifiedTimeMs}`,
	].join("\n");
}

function stripOneTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/plans bin enriched-plan -> ts/packages/plans/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	const exitCode = await runCli(process.argv.slice(2));
	process.exitCode = exitCode;
}

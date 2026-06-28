#!/usr/bin/env node

import { resolve } from "node:path";

import { ClinkrGroup, negative, ok, type ClinkrExit } from "@sdl/clinkr";
import { defineCli, runClinkrCommand } from "@sdl/core/cli-entry";
import { NodeCommandExecApi, type CommandExecApi } from "@sdl/core/exec";
import { RealGitGateway, type GitGateway } from "@sdl/core/git";
import { readStdin } from "@sdl/core/stdin";
import { z } from "zod";

import {
	normalizePlanFilePath,
	resolvePlanSourceFile,
	validatePlanSlug,
} from "./plan-persistence.ts";
import { createRealPlanStoreGateway, type PlanStoreGateway } from "./plan-store-gateway.ts";
import {
	findLatestSavedPlanFile,
	formatSavedPlanFileEvidence,
	NoSavedPlanAvailableError,
	listSavedPlans,
	writeSavedPlanFile,
	type LatestSavedPlanFileEvidence,
	type SavedPlanFileEvidence,
	type SavedPlanListItem,
} from "./saved-plan-file.ts";

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

type SavedPlanListData = ReturnType<typeof savedPlanListJson>;
type SavedPlanFileData = ReturnType<typeof savedPlanFileJson>;
type ResolvePlanData = ReturnType<typeof resolvePlanJson>;

export interface CliDeps {
	commands?: CommandExecApi | undefined;
	git?: GitGateway | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	stdin?: (() => Promise<string>) | undefined;
	planStoreRoot?: string | undefined;
	planStoreGateway?: PlanStoreGateway | undefined;
}

export interface PlansCliContext {
	commands: CommandExecApi;
	git: GitGateway;
	cwd: string;
	stdin: () => Promise<string>;
	planStoreRoot?: string;
	planStoreGateway: PlanStoreGateway;
}

const entry = defineCli<PlansCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Enriched-plan operations. An enriched plan is any plan saved into sdl.",
	prepareRun: ({ deps, cwd }) => {
		const commands = deps.commands ?? new NodeCommandExecApi();
		const context: PlansCliContext = {
			commands,
			git: deps.git ?? new RealGitGateway(commands),
			cwd,
			stdin: deps.stdin ?? readStdin,
			planStoreGateway: deps.planStoreGateway ?? createRealPlanStoreGateway(),
			...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
		};
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		root.command({
			name: "list",
			description: "List saved plans for the current repository across all branch keys.",
			schema: listRequestSchema,
			handler: handleList,
			renderHuman: formatSavedPlanListData,
		});

		const execGroup = new ClinkrGroup<PlansCliContext>({
			name: "exec",
			description: "Run hidden deterministic saved-plan operations for agents.",
			isHidden: true,
		});
		execGroup.command({
			name: "save",
			description: "Save a source-branch plan file in the local store.",
			schema: saveRequestSchema,
			handler: handleSave,
		});
		execGroup.command({
			name: "resolve",
			description: "Resolve an explicit or latest source-branch plan file.",
			schema: resolveRequestSchema,
			positionals: { path: { position: 0 } },
			handler: handleResolve,
			renderHuman: renderResolvePlanData,
		});
		root.group(execGroup);
	},
});

export const VERSION = entry.version;

export function buildCli(): ClinkrGroup<PlansCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

async function handleList(
	ctx: PlansCliContext,
	request: ListRequest,
): Promise<ClinkrExit<SavedPlanListData>> {
	return await runClinkrCommand(PLANS_ERROR_TYPE, async () => {
		const cliPlanStoreRoot =
			request.planStoreRoot === undefined
				? undefined
				: normalizeRootPath(request.planStoreRoot, ctx.cwd);
		const planStoreRoot = cliPlanStoreRoot ?? ctx.planStoreRoot;
		const plans = await listSavedPlans(ctx.commands, {
			cwd: ctx.cwd,
			git: ctx.git,
			planStoreGateway: ctx.planStoreGateway,
			...(planStoreRoot === undefined ? {} : { planStoreRoot }),
		});
		return ok(savedPlanListJson(plans));
	});
}

async function handleSave(
	ctx: PlansCliContext,
	request: SaveRequest,
): Promise<ClinkrExit<SavedPlanFileData>> {
	return await runClinkrCommand(PLANS_ERROR_TYPE, async () => {
		const slugError = validatePlanSlug(request.slug);
		if (slugError !== undefined) throw new Error(`Invalid saved plan slug: ${slugError}`);
		if (Boolean(request.stdin) === (request.contentFile !== undefined)) {
			throw new Error("Pass exactly one of --stdin or --content-file <path>.");
		}

		const contentFile = request.contentFile;
		let content: string;
		if (request.stdin === true) {
			content = await ctx.stdin();
		} else {
			if (contentFile === undefined) {
				throw new Error("Save input validation invariant failed.");
			}
			content = await ctx.planStoreGateway.readTextFile(normalizePlanFilePath(contentFile));
		}
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
				planStoreGateway: ctx.planStoreGateway,
				...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }),
			},
		);
		return ok(savedPlanFileJson(evidence), { human: formatSavedPlanFileEvidence(evidence) });
	});
}

async function handleResolve(
	ctx: PlansCliContext,
	request: ResolveRequest,
): Promise<ClinkrExit<ResolvePlanData>> {
	return await runClinkrCommand(PLANS_ERROR_TYPE, async () => {
		try {
			return ok(resolvePlanJson(await resolvePlanEvidence(request, ctx)));
		} catch (error) {
			if (error instanceof NoSavedPlanAvailableError) {
				return negative(error.message);
			}
			throw error;
		}
	});
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
			planStoreGateway: ctx.planStoreGateway,
		});
		return { source: "explicit", filePath };
	}
	const latest = await findLatestSavedPlanFile(ctx.commands, {
		cwd: ctx.cwd,
		git: ctx.git,
		planStoreGateway: ctx.planStoreGateway,
		...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }),
	});
	return { source: "latest", ...latest };
}

function formatSavedPlanListData(data: SavedPlanListData): string {
	if (data.plans.length === 0) {
		return "No saved plans found for the current repository.";
	}

	const lines = ["Saved plans:"];
	for (const plan of data.plans) {
		lines.push(
			[
				`- ${plan.slug}`,
				`  Branch key: ${plan.branch_key}`,
				`  Modified: ${new Date(plan.modified_time_ms).toISOString()}`,
				`  Path: ${plan.path}`,
			].join("\n"),
		);
	}
	return lines.join("\n");
}

function renderResolvePlanData(data: ResolvePlanData): string {
	if (data.source === "explicit") {
		return [`Resolved explicit plan file.`, `Path: ${data.file_path}`].join("\n");
	}
	return [
		"Resolved latest saved plan file in local plan store.",
		`Path: ${data.file_path}`,
		`Repo key: ${data.repo_key}`,
		`Repo root: ${data.repo_root}`,
		`Repo identity source: ${data.repo_identity_source}`,
		`Source branch: ${data.source_branch}`,
		`Branch path segment: ${data.branch_key}`,
		`Slug: ${data.slug}`,
		`Modified time ms: ${data.modified_time_ms}`,
	].join("\n");
}

function savedPlanListJson(plans: readonly SavedPlanListItem[]): {
	plans: ReturnType<typeof savedPlanListItemJson>[];
} {
	return { plans: plans.map(savedPlanListItemJson) };
}

function savedPlanListItemJson(plan: SavedPlanListItem): {
	slug: string;
	branch_key: string;
	modified_time_ms: number;
	path: string;
	file_name: string;
	repo: {
		root: string;
		key: string;
		identity_source: string;
		plan_store_path: string;
	};
} {
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

function savedPlanFileJson(evidence: SavedPlanFileEvidence): {
	slug: string;
	file_path: string;
	repo_root: string;
	repo_key: string;
	repo_identity_source: SavedPlanFileEvidence["repoIdentitySource"];
	source_branch: string;
	branch_key: string;
	summary?: string;
} {
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

function resolvePlanJson(evidence: ResolvePlanEvidence):
	| {
			source: "explicit";
			file_path: string;
	  }
	| {
			source: "latest";
			file_path: string;
			slug: string;
			file_name: string;
			modified_time_ms: number;
			repo_root: string;
			repo_key: string;
			repo_identity_source: LatestSavedPlanFileEvidence["repoIdentitySource"];
			source_branch: string;
			branch_key: string;
			directory_path: string;
	  } {
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

await entry.runIfMain({ isImportMetaMain: import.meta.main });

#!/usr/bin/env node

import { resolve } from "node:path";

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr/legacy";
import {
	defineCli,
	runOperationCommand,
	type CliEntrypointDeps,
} from "@nseng-ai/foundation/cli-runtime";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { z } from "zod";

import { normalizePlanFilePath, resolvePlanSourceFile } from "./plan-persistence.ts";
import { createRealPlanStoreGateway, type PlanStoreGateway } from "./plan-store-gateway.ts";
import {
	buildPlanStoreOptions,
	findLatestSavedPlanFile,
	NoSavedPlanAvailableError,
	listSavedPlans,
	type LatestSavedPlanFileEvidence,
	type PlanStoreOptions,
	type SavedPlanListItem,
} from "./saved-plan-file.ts";

type PlansOperation = "list" | "resolve";

const listRequestSchema = z.object({
	planStoreRoot: z
		.string()
		.optional()
		.describe("Plan store root directory (relative paths resolve against cwd)."),
});

const resolveRequestSchema = z.object({
	path: z.string().optional().describe("Absolute, @-prefixed, or home-relative plan file path."),
});

type ListRequest = z.infer<typeof listRequestSchema>;
type ResolveRequest = z.infer<typeof resolveRequestSchema>;

interface ExplicitResolvePlanEvidence {
	source: "explicit";
	filePath: string;
}

type LatestResolvePlanEvidence = LatestSavedPlanFileEvidence & { source: "latest" };

type ResolvePlanEvidence = ExplicitResolvePlanEvidence | LatestResolvePlanEvidence;

type SavedPlanListData = ReturnType<typeof savedPlanListJson>;
interface NoSavedPlanData {
	code: NoSavedPlanAvailableError["reason"];
	directoryPath: string;
}

type ResolvePlanData = ReturnType<typeof resolvePlanJson> | NoSavedPlanData;

export interface CliDeps extends Pick<CliEntrypointDeps, "cwd" | "stdout" | "stderr"> {
	commands?: CommandExecApi;
	git?: GitGateway;
	planStoreRoot?: string;
	planStoreGateway?: PlanStoreGateway;
}

export interface PlansCliContext {
	commands: CommandExecApi;
	git: GitGateway;
	cwd: string;
	planStoreRoot?: string;
	planStoreGateway: PlanStoreGateway;
}

const entry = defineCli<PlansCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Enriched-plan operations. An enriched plan is any plan saved into ns.",
	prepareRun: ({ deps, cwd }) => {
		const commands = deps.commands ?? new NodeCommandExecApi();
		const context: PlansCliContext = {
			commands,
			git: deps.git ?? new RealGitGateway(commands),
			cwd,
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
	return await runOperationCommand({
		operation: "list",
		action: async () => {
			const cliPlanStoreRoot =
				request.planStoreRoot === undefined
					? undefined
					: normalizeRootPath(request.planStoreRoot, ctx.cwd);
			const planStoreRoot = cliPlanStoreRoot ?? ctx.planStoreRoot;
			const plans = await listSavedPlans(ctx.commands, planStoreOptions(ctx, planStoreRoot));
			return ok(savedPlanListJson(plans));
		},
		failureFromError: plansFailureFromError,
	});
}

async function handleResolve(
	ctx: PlansCliContext,
	request: ResolveRequest,
): Promise<ClinkrExit<ResolvePlanData>> {
	return await runOperationCommand<PlansOperation, ResolvePlanData>({
		operation: "resolve",
		action: async () => {
			try {
				return ok(resolvePlanJson(await resolvePlanEvidence(request, ctx)));
			} catch (error) {
				if (error instanceof NoSavedPlanAvailableError) {
					return negative(error.message, {
						data: { code: error.reason, directoryPath: error.directoryPath },
					});
				}
				throw error;
			}
		},
		failureFromError: plansFailureFromError,
	});
}

function plansFailureFromError(operation: PlansOperation, error: unknown): ClinkrExit<never> {
	return failure(plansErrorType(operation), formatErrorMessage(error), {
		code: "unexpected-error",
	});
}

function planStoreOptions(
	ctx: PlansCliContext,
	planStoreRoot: string | undefined = ctx.planStoreRoot,
): PlanStoreOptions {
	return buildPlanStoreOptions({
		cwd: ctx.cwd,
		git: ctx.git,
		planStoreGateway: ctx.planStoreGateway,
		planStoreRoot,
	});
}

function plansErrorType(operation: PlansOperation): string {
	switch (operation) {
		case "list":
			return "saved-plan-list-failed";
		case "resolve":
			return "saved-plan-resolution-failed";
	}
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
	const latest = await findLatestSavedPlanFile(ctx.commands, planStoreOptions(ctx));
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
				`  Branch key: ${plan.branchKey}`,
				`  Modified: ${new Date(plan.modifiedTimeMs).toISOString()}`,
				`  Path: ${plan.path}`,
			].join("\n"),
		);
	}
	return lines.join("\n");
}

function renderResolvePlanData(data: ResolvePlanData): string {
	if (!("source" in data)) {
		return `No saved plan available: ${data.code}\nDirectory: ${data.directoryPath}`;
	}
	if (data.source === "explicit") {
		return [`Resolved explicit plan file.`, `Path: ${data.filePath}`].join("\n");
	}
	return [
		"Resolved latest saved plan file in local plan store.",
		`Path: ${data.filePath}`,
		`Repo key: ${data.repoKey}`,
		`Repo root: ${data.repoRoot}`,
		`Repo identity source: ${data.repoIdentitySource}`,
		`Source branch: ${data.sourceBranch}`,
		`Branch path segment: ${data.branchKey}`,
		`Slug: ${data.slug}`,
		`Modified time ms: ${data.modifiedTimeMs}`,
	].join("\n");
}

function savedPlanListJson(plans: readonly SavedPlanListItem[]): {
	plans: ReturnType<typeof savedPlanListItemJson>[];
} {
	return { plans: plans.map(savedPlanListItemJson) };
}

function savedPlanListItemJson(plan: SavedPlanListItem): {
	slug: string;
	branchKey: string;
	modifiedTimeMs: number;
	path: string;
	fileName: string;
	repo: {
		root: string;
		key: string;
		identitySource: string;
		planStorePath: string;
	};
} {
	return {
		slug: plan.slug,
		branchKey: plan.branchKey,
		modifiedTimeMs: plan.modifiedTimeMs,
		path: plan.filePath,
		fileName: plan.fileName,
		repo: {
			root: plan.repoRoot,
			key: plan.repoKey,
			identitySource: plan.repoIdentitySource,
			planStorePath: plan.repoDirectoryPath,
		},
	};
}

function resolvePlanJson(evidence: ResolvePlanEvidence):
	| {
			source: "explicit";
			filePath: string;
	  }
	| {
			source: "latest";
			filePath: string;
			slug: string;
			fileName: string;
			modifiedTimeMs: number;
			repoRoot: string;
			repoKey: string;
			repoIdentitySource: LatestSavedPlanFileEvidence["repoIdentitySource"];
			sourceBranch: string;
			branchKey: string;
			directoryPath: string;
	  } {
	switch (evidence.source) {
		case "explicit":
			return {
				source: evidence.source,
				filePath: evidence.filePath,
			};
		case "latest":
			return {
				source: evidence.source,
				filePath: evidence.filePath,
				slug: evidence.slug,
				fileName: evidence.fileName,
				modifiedTimeMs: evidence.modifiedTimeMs,
				repoRoot: evidence.repoRoot,
				repoKey: evidence.repoKey,
				repoIdentitySource: evidence.repoIdentitySource,
				sourceBranch: evidence.sourceBranch,
				branchKey: evidence.branchKey,
				directoryPath: evidence.directoryPath,
			};
	}
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });

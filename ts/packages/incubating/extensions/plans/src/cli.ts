#!/usr/bin/env node

import { resolve } from "node:path";

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr/legacy";
import {
	defineCli,
	runOperationCommand,
	type CliEntrypointDeps,
} from "@nseng-ai/foundation/cli-runtime";
import {
	formatErrorMessage,
	optionalEntries,
	optionalEntry,
} from "@nseng-ai/foundation/primitives";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { z } from "zod";

import {
	normalizePlanFilePath,
	resolvePlanContentFile,
	validatePlanSlug,
} from "./plan-persistence.ts";
import { createRealPlanStoreGateway, type PlanStoreGateway } from "./plan-store-gateway.ts";
import {
	buildPlanStoreOptions,
	findLatestSavedPlanFile,
	NoSavedPlanAvailableError,
	listSavedPlans,
	savePlanContentBytes,
	type DurableSavedPlan,
	type PlanStoreOptions,
	type TimestampedDurableSavedPlan,
	type SavedPlanListItem,
} from "./saved-plan-file.ts";
import { resolveExplicitSavedPlanFile } from "./saved-plan-selection.ts";

type PlansOperation = "list" | "save" | "resolve";

const listRequestSchema = z.object({
	planStoreRoot: z
		.string()
		.optional()
		.describe("Plan store root directory (relative paths resolve against cwd)."),
});

const listResultSchema = z.lazy(() =>
	z.object({
		plans: z.array(
			z.object({
				format: z.literal("timestamped"),
				slug: z.string(),
				branchKey: z.string(),
				modifiedTimeMs: z.number(),
				path: z.string(),
				fileName: z.string(),
				repo: z.object({
					root: z.string(),
					key: z.string(),
					identitySource: z.enum(["origin-url", "repo-root"]),
					planStorePath: z.string(),
				}),
			}),
		),
	}),
);

const saveRequestSchema = z.lazy(() =>
	z.object({
		slug: z.string().describe("LM-generated lowercase kebab-case Saved Plan slug."),
		contentFile: z
			.string()
			.describe("Markdown content file path (relative paths resolve against cwd)."),
	}),
);

const resolveRequestSchema = z.object({
	path: z.string().optional().describe("Absolute, @-prefixed, or home-relative plan file path."),
});
const durablePlanResultBaseSchema = z.object({
	filePath: z.string(),
	fileName: z.string(),
	fileStem: z.string(),
	slug: z.string(),
	repoRoot: z.string(),
	repoKey: z.string(),
	repoIdentitySource: z.enum(["origin-url", "repo-root"]),
	sourceBranch: z.string(),
	branchKey: z.string(),
	directoryPath: z.string(),
});
const timestampedPlanResultSchema = durablePlanResultBaseSchema.extend({
	format: z.literal("timestamped"),
	timestamp: z.string(),
	timestampNumber: z.number().int(),
	sequence: z.number().int().positive(),
});
const saveResultSchema = timestampedPlanResultSchema;
const resolveResultSchema = z.union([
	timestampedPlanResultSchema.extend({ source: z.literal("explicit") }),
	timestampedPlanResultSchema.extend({
		source: z.literal("latest"),
		modifiedTimeMs: z.number(),
	}),
]);

type ListRequest = z.infer<typeof listRequestSchema>;
type SaveRequest = z.infer<typeof saveRequestSchema>;
type ResolveRequest = z.infer<typeof resolveRequestSchema>;

type ExplicitResolvePlanEvidence = DurableSavedPlan & { source: "explicit" };
type LatestResolvePlanEvidence = TimestampedDurableSavedPlan & {
	source: "latest";
	modifiedTimeMs: number;
};

type ResolvePlanEvidence = ExplicitResolvePlanEvidence | LatestResolvePlanEvidence;

type SavedPlanListData = z.infer<typeof listResultSchema>;
interface NoSavedPlanData {
	code: NoSavedPlanAvailableError["reason"];
	directoryPath: string;
}

interface ExplicitResolveFailureData {
	code: "not-found" | "unsafe" | "error";
	path: string;
}

type ResolvePlanData =
	| z.infer<typeof resolveResultSchema>
	| NoSavedPlanData
	| ExplicitResolveFailureData;

export interface CliDeps extends Pick<CliEntrypointDeps, "cwd" | "stdout" | "stderr"> {
	commands?: CommandExecApi;
	git?: GitGateway;
	planStoreRoot?: string;
	planStoreGateway?: PlanStoreGateway;
	localTimestamp?: string;
}

export interface PlansCliContext {
	commands: CommandExecApi;
	git: GitGateway;
	cwd: string;
	planStoreRoot?: string;
	planStoreGateway: PlanStoreGateway;
	localTimestamp?: string;
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
			...optionalEntries({
				localTimestamp: deps.localTimestamp,
				planStoreRoot: deps.planStoreRoot,
			}),
		};
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		root.command({
			name: "list",
			description: "List saved plans for the current repository across all branch keys.",
			schema: listRequestSchema,
			resultSchema: listResultSchema,
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
			description: "Save Markdown bytes as a timestamped source-branch plan.",
			schema: saveRequestSchema.unwrap(),
			resultSchema: saveResultSchema,
			handler: handleSave,
			renderHuman: renderSavedPlan,
		});
		execGroup.command({
			name: "resolve",
			description: "Resolve an explicit or latest source-branch plan file.",
			schema: resolveRequestSchema,
			positionals: { path: { position: 0 } },
			resultSchema: resolveResultSchema,
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

async function handleSave(
	ctx: PlansCliContext,
	request: SaveRequest,
): Promise<ClinkrExit<z.infer<typeof saveResultSchema>>> {
	return await runOperationCommand({
		operation: "save",
		action: async () => {
			const slugError = validatePlanSlug(request.slug);
			if (slugError !== undefined) {
				throw new Error(`Invalid Saved Plan slug: ${slugError}`);
			}

			const contentPath = resolve(ctx.cwd, normalizePlanFilePath(request.contentFile));
			const safeContentPath = await resolvePlanContentFile({
				rawFilePath: contentPath,
				planStoreGateway: ctx.planStoreGateway,
			});
			const content = await ctx.planStoreGateway.readRegularFileBytes(safeContentPath);
			const plan = await savePlanContentBytes(ctx.commands, request.slug, content, {
				...planStoreOptions(ctx),
				...optionalEntry("localTimestamp", ctx.localTimestamp),
			});
			return ok(durablePlanJson(plan));
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
				const evidence = await resolvePlanEvidence(request, ctx);
				if (evidence.type === "resolved") return ok(resolvePlanJson(evidence.evidence));
				const data: ExplicitResolveFailureData = {
					code: evidence.type,
					path: normalizePlanFilePath(request.path ?? ""),
				};
				return evidence.type === "error"
					? failure("saved-plan-resolution-failed", evidence.message, data)
					: negative(evidence.message, { data });
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
		case "save":
			return "saved-plan-write-failed";
		case "resolve":
			return "saved-plan-resolution-failed";
	}
}

function normalizeRootPath(rawPath: string, cwd: string): string {
	const normalized = normalizePlanFilePath(rawPath);
	return resolve(cwd, normalized);
}

type ResolvePlanEvidenceResult =
	| { type: "resolved"; evidence: ResolvePlanEvidence }
	| { type: "not-found" | "unsafe" | "error"; message: string };

async function resolvePlanEvidence(
	args: ResolveRequest,
	ctx: PlansCliContext,
): Promise<ResolvePlanEvidenceResult> {
	if (args.path !== undefined) {
		const result = await resolveExplicitSavedPlanFile(ctx.commands, {
			...planStoreOptions(ctx),
			explicitPath: args.path,
		});
		return result.type === "resolved"
			? { type: "resolved", evidence: { source: "explicit", ...result.plan } }
			: result;
	}
	const latest = await findLatestSavedPlanFile(ctx.commands, planStoreOptions(ctx));
	return { type: "resolved", evidence: { source: "latest", ...latest } };
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
				`  Format: ${plan.format}`,
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
		return "directoryPath" in data
			? `No saved plan available: ${data.code}\nDirectory: ${data.directoryPath}`
			: `Saved Plan resolution did not succeed: ${data.code}\nPath: ${data.path}`;
	}
	if (data.source === "explicit") {
		return [
			"Resolved explicit saved plan file in local plan store.",
			`Path: ${data.filePath}`,
			`Format: ${data.format}`,
			`Slug: ${data.slug}`,
		].join("\n");
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

function renderSavedPlan(data: z.infer<typeof saveResultSchema>): string {
	return [
		"Saved timestamped plan file in local plan store.",
		`Path: ${data.filePath}`,
		`Slug: ${data.slug}`,
		`Timestamp: ${data.timestamp}`,
		`Sequence: ${data.sequence}`,
		`Source branch: ${data.sourceBranch}`,
	].join("\n");
}

function durablePlanJson(
	plan: TimestampedDurableSavedPlan,
): z.infer<typeof timestampedPlanResultSchema> {
	return {
		format: plan.format,
		slug: plan.slug,
		filePath: plan.filePath,
		fileName: plan.fileName,
		fileStem: plan.fileStem,
		timestamp: plan.timestamp,
		timestampNumber: plan.timestampNumber,
		sequence: plan.sequence,
		repoRoot: plan.directory.repoRoot,
		repoKey: plan.directory.repoKey,
		repoIdentitySource: plan.directory.repoIdentitySource,
		sourceBranch: plan.directory.sourceBranch,
		branchKey: plan.directory.branchKey,
		directoryPath: plan.directory.directoryPath,
	};
}

function savedPlanListJson(plans: readonly SavedPlanListItem[]): SavedPlanListData {
	return { plans: plans.map(savedPlanListItemJson) };
}

function savedPlanListItemJson(plan: SavedPlanListItem): {
	format: "timestamped";
	slug: string;
	branchKey: string;
	modifiedTimeMs: number;
	path: string;
	fileName: string;
	repo: {
		root: string;
		key: string;
		identitySource: SavedPlanListItem["repo"]["repoIdentitySource"];
		planStorePath: string;
	};
} {
	return {
		format: plan.format,
		slug: plan.slug,
		branchKey: plan.branchKey,
		modifiedTimeMs: plan.modifiedTimeMs,
		path: plan.filePath,
		fileName: plan.fileName,
		repo: {
			root: plan.repo.repoRoot,
			key: plan.repo.repoKey,
			identitySource: plan.repo.repoIdentitySource,
			planStorePath: plan.repo.repoDirectoryPath,
		},
	};
}

function resolvePlanJson(evidence: ResolvePlanEvidence): z.infer<typeof resolveResultSchema> {
	if (evidence.source === "latest") {
		return {
			...durablePlanJson(evidence),
			source: evidence.source,
			modifiedTimeMs: evidence.modifiedTimeMs,
		};
	}
	return { ...durablePlanJson(evidence), source: evidence.source };
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });

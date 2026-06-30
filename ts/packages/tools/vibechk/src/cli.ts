#!/usr/bin/env node

import {
	ClinkrGroup,
	failure,
	negative,
	ok,
	usageError,
	type ClinkrExit,
	type ClinkrFailureExit,
	type ClinkrNegativeExit,
	type ClinkrUsageErrorExit,
	type RenderCapabilities,
} from "@sdl/clinkr";
import { rawCommand } from "@sdl/clinkr/raw";
import { defineCli } from "@sdl/cli-runtime";
import { z } from "zod";

import type { LoadedBundle } from "./models.ts";
import {
	renderComparisonReport,
	renderRunReport,
	renderRunsTable,
	runListEntryToJson,
} from "./reports.ts";
import { listBundles, readBundle, resolveStoreRoot, VibechkError } from "./store.ts";
import type { VibechkWorkdirGateway } from "./repository.ts";
import { RealVibechkWorkdirGateway } from "./repository.ts";
import { buildProductionRunnerRegistry, type RunnerRegistry } from "./runners.ts";
import { generateRunId } from "./ids.ts";
import { executeRun } from "./workflow.ts";

export interface CliDeps {
	cwd?: string | undefined;
	// optional-undefined-objective: preserve (env-map) — Injected NodeJS.ProcessEnv environment map on a DI deps bag; environment/process-map mirror kept loose.
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	runnerRegistry?: RunnerRegistry | undefined;
	repositoryGatewayFactory?: ((workdir: string) => VibechkWorkdirGateway) | undefined;
	clock?: (() => Date) | undefined;
	idGenerator?: (() => string) | undefined;
	defaultRunnerName?: string | undefined;
}

interface VibechkCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	runnerRegistry: RunnerRegistry;
	repositoryGatewayFactory: (workdir: string) => VibechkWorkdirGateway;
	clock: () => Date;
	idGenerator: () => string;
	defaultRunnerName: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

const DEFAULT_RUNS_LIMIT = 50;
const DEFAULT_ARTIFACT_BYTE_LIMIT = 200_000;

const runsRequestSchema = z.object({
	store: z.string().optional(),
	outputFormat: z.enum(["table", "json"]).default("table"),
	maxRuns: z.number().int().positive().default(DEFAULT_RUNS_LIMIT),
});

const showRequestSchema = z.object({
	idOrPrefix: z.string(),
	store: z.string().optional(),
	maxArtifactBytes: z.number().int().positive().default(DEFAULT_ARTIFACT_BYTE_LIMIT),
});

const diffRequestSchema = z.object({
	baselineId: z.string(),
	treatmentId: z.string(),
	store: z.string().optional(),
	maxArtifactBytes: z.number().int().positive().default(DEFAULT_ARTIFACT_BYTE_LIMIT),
});

const runRequestSchema = z.object({
	plan: z.string(),
	workdir: z.string().default("."),
	runner: z.string().optional(),
	model: z.string().optional(),
	store: z.string().optional(),
});

const entry = defineCli<VibechkCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Run lightweight agent context evals and publish Markdown evidence.",
	prepareRun: ({ args, deps, cwd, env, stdout, stderr }) => {
		const runnerRegistry = deps.runnerRegistry ?? buildProductionRunnerRegistry();
		const repositoryGatewayFactory =
			deps.repositoryGatewayFactory ??
			((workdir: string) => new RealVibechkWorkdirGateway({ workdir }));
		const clock = deps.clock ?? (() => new Date());
		const idGenerator = deps.idGenerator ?? generateRunId;
		const defaultRunnerName = deps.defaultRunnerName ?? "claude";
		const context: VibechkCliContext = {
			cwd,
			env,
			runnerRegistry,
			repositoryGatewayFactory,
			clock,
			idGenerator,
			defaultRunnerName,
			stdout: deps.stdout ?? stdout,
			stderr: deps.stderr ?? stderr,
		};
		return {
			type: "run",
			context,
			buildState: undefined,
			args: normalizeRunsFormatArgs(args),
		};
	},
	configureCli: ({ root }) => {
		root.command({
			name: "runs",
			description: "List local vibechk run bundles from the configured store.",
			schema: runsRequestSchema,
			handler: runRuns,
			renderHuman: renderRuns,
		});

		root.command({
			name: "show",
			description: "Render a Markdown report for a single run.",
			schema: showRequestSchema,
			positionals: {
				idOrPrefix: { position: 0 },
			},
			handler: runShow,
			renderHuman: renderShow,
		});

		root.command({
			name: "diff",
			description: "Render a Markdown comparison report for two runs.",
			schema: diffRequestSchema,
			positionals: {
				baselineId: { position: 0 },
				treatmentId: { position: 1 },
			},
			handler: runDiff,
			renderHuman: renderDiff,
		});

		root.command(
			rawCommand({
				name: "run",
				description: "Run a plan in a clean git workdir and persist a local run bundle.",
				schema: runRequestSchema,
				run: runRun,
			}),
		);
	},
	handleRunError: ({ error, stderr }) => {
		if (error instanceof VibechkError) {
			stderr(`Error: ${error.message}\n`);
			return 1;
		}
	},
});

export const VERSION = entry.version;

export function buildCli(): ClinkrGroup<VibechkCliContext> {
	return entry.buildCli(undefined);
}

type RunsRequest = z.infer<typeof runsRequestSchema>;
type ShowRequest = z.infer<typeof showRequestSchema>;
type DiffRequest = z.infer<typeof diffRequestSchema>;
type RunRequest = z.infer<typeof runRequestSchema>;

interface RunsOutputBounds {
	kind: "runs-list";
	appliedLimit: number;
	returnedCount: number;
	totalCount: number;
	isComplete: boolean;
	continuation: string | null;
}

interface ArtifactOutputBounds {
	kind: "artifact";
	artifact: "plan" | "transcript" | "diff";
	appliedByteLimit: number;
	originalBytes: number;
	returnedBytes: number;
	isComplete: boolean;
	continuation: string | null;
}

type BoundedBundle = Omit<LoadedBundle, "planText" | "transcript" | "diffPatch"> & {
	planText: string;
	transcript: string;
	diffPatch: string;
	outputBounds: {
		plan: ArtifactOutputBounds;
		transcript: ArtifactOutputBounds;
		diff: ArtifactOutputBounds;
	};
};

type RunsResult =
	| { type: "json"; entries: unknown[]; outputBounds: RunsOutputBounds }
	| { type: "table"; loaded: LoadedBundle[]; outputBounds: RunsOutputBounds };
type VibechkReadOnlyErrorData = {
	type: "lookup-error";
	idOrPrefix?: unknown;
	matches?: unknown;
};
type ShowResult = { loaded: BoundedBundle } | VibechkReadOnlyErrorData;
type DiffResult = { baseline: BoundedBundle; treatment: BoundedBundle } | VibechkReadOnlyErrorData;

async function runRuns(ctx: VibechkCliContext, request: RunsRequest) {
	const storeRoot = resolveStoreRoot(request.store, ctx.env);
	const loaded = await listBundles(storeRoot);
	const bounded = loaded.slice(0, request.maxRuns);
	const outputBounds = runsOutputBounds({
		returnedCount: bounded.length,
		totalCount: loaded.length,
		appliedLimit: request.maxRuns,
	});

	if (request.outputFormat === "json") {
		return ok<RunsResult>({
			type: "json",
			entries: bounded.map(runListEntryToJson),
			outputBounds,
		});
	}
	return ok<RunsResult>({ type: "table", loaded: bounded, outputBounds });
}

function renderRuns(result: RunsResult, caps: RenderCapabilities = { canEmitAnsi: false }): string {
	if (result.type === "json") {
		return JSON.stringify({ entries: result.entries, outputBounds: result.outputBounds });
	}
	if (result.loaded.length === 0) {
		return "No vibechk runs found.";
	}
	const table = renderRunsTable(result.loaded, caps);
	if (result.outputBounds.isComplete) return table;
	return `${table}\n${result.outputBounds.continuation ?? "More runs are available."}`;
}

async function runShow(
	ctx: VibechkCliContext,
	request: ShowRequest,
): Promise<ClinkrExit<ShowResult>> {
	try {
		const storeRoot = resolveStoreRoot(request.store, ctx.env);
		const loaded = await readBundle(storeRoot, request.idOrPrefix);
		return ok<ShowResult>({ loaded: boundBundleArtifacts(loaded, request.maxArtifactBytes) });
	} catch (error) {
		return vibechkReadOnlyErrorExit(error);
	}
}

function renderShow(
	result: ShowResult,
	_caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (!("loaded" in result)) return result.type;
	return renderRunReport(result.loaded);
}

async function runDiff(
	ctx: VibechkCliContext,
	request: DiffRequest,
): Promise<ClinkrExit<DiffResult>> {
	try {
		const storeRoot = resolveStoreRoot(request.store, ctx.env);
		const baseline = await readBundle(storeRoot, request.baselineId);
		const treatment = await readBundle(storeRoot, request.treatmentId);
		return ok<DiffResult>({
			baseline: boundBundleArtifacts(baseline, request.maxArtifactBytes),
			treatment: boundBundleArtifacts(treatment, request.maxArtifactBytes),
		});
	} catch (error) {
		return vibechkReadOnlyErrorExit(error);
	}
}

function renderDiff(
	result: DiffResult,
	_caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (!("baseline" in result)) return result.type;
	return renderComparisonReport(result.baseline, result.treatment);
}

function runsOutputBounds(options: {
	readonly returnedCount: number;
	readonly totalCount: number;
	readonly appliedLimit: number;
}): RunsOutputBounds {
	const isComplete = options.returnedCount >= options.totalCount;
	return {
		kind: "runs-list",
		appliedLimit: options.appliedLimit,
		returnedCount: options.returnedCount,
		totalCount: options.totalCount,
		isComplete,
		continuation: isComplete
			? null
			: `Showing ${options.returnedCount} of ${options.totalCount} runs. Re-run with --max-runs ${options.totalCount} or use a narrower store.`,
	};
}

function boundBundleArtifacts(loaded: LoadedBundle, maxArtifactBytes: number): BoundedBundle {
	const plan = boundArtifact(loaded.planText, "plan", maxArtifactBytes);
	const transcript = boundArtifact(loaded.transcript, "transcript", maxArtifactBytes);
	const diff = boundArtifact(loaded.diffPatch, "diff", maxArtifactBytes);
	return {
		...loaded,
		planText: plan.text,
		transcript: transcript.text,
		diffPatch: diff.text,
		outputBounds: {
			plan: plan.outputBounds,
			transcript: transcript.outputBounds,
			diff: diff.outputBounds,
		},
	};
}

function boundArtifact(
	text: string,
	artifact: ArtifactOutputBounds["artifact"],
	maxArtifactBytes: number,
): { text: string; outputBounds: ArtifactOutputBounds } {
	const originalBytes = Buffer.byteLength(text, "utf-8");
	if (originalBytes <= maxArtifactBytes) {
		return {
			text,
			outputBounds: {
				kind: "artifact",
				artifact,
				appliedByteLimit: maxArtifactBytes,
				originalBytes,
				returnedBytes: originalBytes,
				isComplete: true,
				continuation: null,
			},
		};
	}

	const boundedText = textByByteLimit(text, maxArtifactBytes);
	return {
		text: boundedText,
		outputBounds: {
			kind: "artifact",
			artifact,
			appliedByteLimit: maxArtifactBytes,
			originalBytes,
			returnedBytes: Buffer.byteLength(boundedText, "utf-8"),
			isComplete: false,
			continuation: `${artifact} was truncated to ${maxArtifactBytes} bytes. Re-run with --max-artifact-bytes ${originalBytes} or inspect the run directory directly.`,
		},
	};
}

function textByByteLimit(text: string, maxBytes: number): string {
	let bytes = 0;
	let endIndex = 0;
	for (const character of text) {
		const nextBytes = bytes + Buffer.byteLength(character, "utf-8");
		if (nextBytes > maxBytes) break;
		bytes = nextBytes;
		endIndex += character.length;
	}
	return text.slice(0, endIndex);
}

function vibechkReadOnlyErrorExit(
	error: unknown,
): ClinkrNegativeExit<VibechkReadOnlyErrorData> | ClinkrFailureExit | ClinkrUsageErrorExit {
	if (!(error instanceof VibechkError)) throw error;
	if (error.code === "run_not_found" || error.code === "ambiguous_run") {
		return negative(error.message, { data: vibechkReadOnlyErrorData(error.data) });
	}
	if (error.code === "store_config_error") return usageError(error.message, error.data);
	return failure(error.code, error.message, error.data);
}

function vibechkReadOnlyErrorData(data: Record<string, unknown>): VibechkReadOnlyErrorData {
	return {
		type: "lookup-error",
		...(data["idOrPrefix"] === undefined ? {} : { idOrPrefix: data["idOrPrefix"] }),
		...(data["matches"] === undefined ? {} : { matches: data["matches"] }),
	};
}

async function runRun(ctx: VibechkCliContext, request: RunRequest): Promise<number> {
	const runnerName = request.runner ?? ctx.defaultRunnerName;
	const runner = ctx.runnerRegistry.get(runnerName);
	const repository = ctx.repositoryGatewayFactory(request.workdir);

	const result = await executeRun({
		planPath: request.plan,
		workdir: request.workdir,
		runnerName,
		model: request.model ?? null,
		store: request.store,
		env: ctx.env,
		deps: {
			runner,
			repository,
			clock: ctx.clock,
			idGenerator: ctx.idGenerator,
			stdout: ctx.stdout,
		},
	});

	ctx.stdout(`Run ID: ${result.runId}\n`);
	return result.exitCode;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

function normalizeRunsFormatArgs(args: readonly string[]): readonly string[] {
	if (args[0] !== "runs") return args;
	// `runs` exposes a domain outputFormat choice (`table|json`) to avoid colliding with
	// Clinkr's global `--format human|json|markdown`; keep the old `runs --format` alias.
	const normalized: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;
		if (arg === "--format") {
			normalized.push("--output-format");
			continue;
		}
		if (arg.startsWith("--format=")) {
			normalized.push(`--output-format=${arg.slice("--format=".length)}`);
			continue;
		}
		normalized.push(arg);
	}
	return normalized;
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });

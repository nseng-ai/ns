#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, ok, resolveIo, type RenderCapabilities } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { z } from "zod";

import type { LoadedBundle } from "./models.ts";
import {
	renderComparisonReport,
	renderRunReport,
	renderRunsTable,
	runListEntryToJson,
} from "./reports.ts";
import { listBundles, readBundle, resolveStoreRoot, VibechkError } from "./store.ts";
import type { GitGateway } from "./git.ts";
import { RealGitGateway } from "./git.ts";
import { buildProductionRunnerRegistry, type RunnerRegistry } from "./runners.ts";
import { generateRunId } from "./ids.ts";
import { executeRun } from "./workflow.ts";

export const VERSION = "0.1.0";

export interface CliDeps {
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	runnerRegistry?: RunnerRegistry | undefined;
	gitGatewayFactory?: ((workdir: string) => GitGateway) | undefined;
	clock?: (() => Date) | undefined;
	idGenerator?: (() => string) | undefined;
	defaultRunnerName?: string | undefined;
}

interface VibechkCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	runnerRegistry: RunnerRegistry;
	gitGatewayFactory: (workdir: string) => GitGateway;
	clock: () => Date;
	idGenerator: () => string;
	defaultRunnerName: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

const runsRequestSchema = z.object({
	store: z.string().optional(),
	output_format: z.enum(["table", "json"]).default("table"),
});

const showRequestSchema = z.object({
	id_or_prefix: z.string(),
	store: z.string().optional(),
});

const diffRequestSchema = z.object({
	baseline_id: z.string(),
	treatment_id: z.string(),
	store: z.string().optional(),
});

const runRequestSchema = z.object({
	plan: z.string(),
	workdir: z.string().default("."),
	runner: z.string().optional(),
	model: z.string().optional(),
	store: z.string().optional(),
});

export function buildCli(): ClinkrGroup<VibechkCliContext> {
	const root = new ClinkrGroup<VibechkCliContext>({
		name: "vibechk",
		description: "Run lightweight agent context evals and publish Markdown evidence.",
		version: VERSION,
		runtimeInfo,
	});

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
			id_or_prefix: { position: 0 },
		},
		handler: runShow,
		renderHuman: renderShow,
	});

	root.command({
		name: "diff",
		description: "Render a Markdown comparison report for two runs.",
		schema: diffRequestSchema,
		positionals: {
			baseline_id: { position: 0 },
			treatment_id: { position: 1 },
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

	return root;
}

type RunsRequest = z.infer<typeof runsRequestSchema>;
type ShowRequest = z.infer<typeof showRequestSchema>;
type DiffRequest = z.infer<typeof diffRequestSchema>;
type RunRequest = z.infer<typeof runRequestSchema>;

type RunsResult = { type: "json"; entries: unknown[] } | { type: "table"; loaded: LoadedBundle[] };
type ShowResult = { loaded: LoadedBundle };
type DiffResult = { baseline: LoadedBundle; treatment: LoadedBundle };

async function runRuns(ctx: VibechkCliContext, request: RunsRequest) {
	const storeRoot = resolveStoreRoot(request.store, ctx.env);
	const loaded = await listBundles(storeRoot);

	if (request.output_format === "json") {
		return ok<RunsResult>({ type: "json", entries: loaded.map(runListEntryToJson) });
	}
	return ok<RunsResult>({ type: "table", loaded });
}

function renderRuns(result: RunsResult, caps: RenderCapabilities = { canEmitAnsi: false }): string {
	if (result.type === "json") {
		return JSON.stringify(result.entries);
	}
	if (result.loaded.length === 0) {
		return "No vibechk runs found.";
	}
	return renderRunsTable(result.loaded, caps);
}

async function runShow(ctx: VibechkCliContext, request: ShowRequest) {
	const storeRoot = resolveStoreRoot(request.store, ctx.env);
	const loaded = await readBundle(storeRoot, request.id_or_prefix);
	return ok<ShowResult>({ loaded });
}

function renderShow(
	result: ShowResult,
	_caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	return renderRunReport(result.loaded);
}

async function runDiff(ctx: VibechkCliContext, request: DiffRequest) {
	const storeRoot = resolveStoreRoot(request.store, ctx.env);
	const baseline = await readBundle(storeRoot, request.baseline_id);
	const treatment = await readBundle(storeRoot, request.treatment_id);
	return ok<DiffResult>({ baseline, treatment });
}

function renderDiff(
	result: DiffResult,
	_caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	return renderComparisonReport(result.baseline, result.treatment);
}

async function runRun(ctx: VibechkCliContext, request: RunRequest): Promise<number> {
	try {
		const runnerName = request.runner ?? ctx.defaultRunnerName;
		const runner = ctx.runnerRegistry.get(runnerName);
		const gitGateway = ctx.gitGatewayFactory(request.workdir);

		const result = await executeRun({
			planPath: request.plan,
			workdir: request.workdir,
			runnerName,
			model: request.model ?? null,
			store: request.store,
			env: ctx.env,
			deps: {
				runner,
				gitGateway,
				clock: ctx.clock,
				idGenerator: ctx.idGenerator,
				stdout: ctx.stdout,
			},
		});

		ctx.stdout(`Run ID: ${result.runId}\n`);
		return result.exitCode;
	} catch (error: unknown) {
		if (error instanceof VibechkError) {
			ctx.stderr(`Error: ${error.message}\n`);
			return 1;
		}
		throw error;
	}
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const runnerRegistry = deps.runnerRegistry ?? buildProductionRunnerRegistry();
	const gitGatewayFactory =
		deps.gitGatewayFactory ?? ((workdir: string) => new RealGitGateway(workdir));
	const clock = deps.clock ?? (() => new Date());
	const idGenerator = deps.idGenerator ?? generateRunId;
	const defaultRunnerName = deps.defaultRunnerName ?? "claude";

	const context: VibechkCliContext = {
		cwd,
		env,
		runnerRegistry,
		gitGatewayFactory,
		clock,
		idGenerator,
		defaultRunnerName,
		stdout: io.stdout,
		stderr: io.stderr,
	};

	try {
		return await buildCli().run(normalizeRunsFormatArgs(args), { context, io });
	} catch (error: unknown) {
		if (error instanceof VibechkError) {
			io.stderr(`Error: ${error.message}\n`);
			return 1;
		}
		throw error;
	}
}

function normalizeRunsFormatArgs(args: readonly string[]): readonly string[] {
	if (args[0] !== "runs") return args;
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

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/vibechk bin vibechk -> ts/packages/vibechk/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}

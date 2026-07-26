import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { RunBundle } from "./models.ts";
import type { VibechkWorkdirGateway } from "./repository.ts";
import type { Runner, RunnerResult } from "./runners.ts";
import {
	ARTIFACTS_DIR_NAME,
	createRunDir,
	DIFF_FILE_NAME,
	PLAN_FILE_NAME,
	resolveStoreRoot,
	TRANSCRIPT_FILE_NAME,
	VibechkError,
	writeBundle,
} from "./store.ts";

const SCHEMA_VERSION = 1;

export interface RunExecutionResult {
	runId: string;
	exitCode: number;
}

export interface RunDeps {
	runner: Runner;
	repository: VibechkWorkdirGateway;
	clock: () => Date;
	idGenerator: () => string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export interface RunExecutionOptions {
	planPath: string;
	workdir: string;
	runnerName: string;
	model: string | null;
	store: string | undefined;
	env: Record<string, string | undefined>;
	deps: RunDeps;
}

export async function executeRun(options: RunExecutionOptions): Promise<RunExecutionResult> {
	const { planPath, workdir, runnerName, model, store, env, deps } = options;
	const resolvedPlanPath = await resolvePlanPath(planPath);
	const resolvedWorkdir = await resolveWorkdir(workdir);

	const repository = deps.repository;

	const gitProvenance = await repository.readProvenance();

	if (!(await repository.isClean())) {
		throw new VibechkError(
			`Workdir ${resolvedWorkdir} has uncommitted changes; vibechk run requires a clean workdir.`,
		);
	}

	const planText = await readPlanText(resolvedPlanPath);
	const storeRoot = resolveStoreRoot(store, env);
	const { runId, runDir } = await createRunDir(storeRoot, deps.idGenerator);
	const artifactsDir = join(runDir, ARTIFACTS_DIR_NAME);

	await writeFile(join(runDir, PLAN_FILE_NAME), planText, "utf-8");

	const startedAt = deps.clock();

	let runnerResult: RunnerResult = {
		exitCode: 1,
		transcript: "",
		metrics: {
			wallTimeSeconds: null,
			inputTokens: null,
			outputTokens: null,
			totalTokens: null,
			costUsd: null,
		},
		artifacts: {},
		runnerVersion: null,
	};

	let runnerError: string | null = null;
	const transcriptPath = join(runDir, TRANSCRIPT_FILE_NAME);
	const transcriptChunks: string[] = [];

	const transcriptSink = (text: string): void => {
		transcriptChunks.push(text);
	};

	try {
		runnerResult = await deps.runner.run(
			{
				planText,
				workdir: resolvedWorkdir,
				model,
				runId,
				artifactsDir,
			},
			transcriptSink,
			deps.stdout,
		);
	} catch (error: unknown) {
		if (error instanceof VibechkError) {
			runnerError = error.message;
			const errorText = `Runner error: ${runnerError}\n`;
			transcriptChunks.push(errorText);
		} else {
			throw error;
		}
	}

	const transcriptContent = transcriptChunks.join("");
	await writeFile(
		transcriptPath,
		transcriptContent === "" ? runnerResult.transcript : transcriptContent,
		"utf-8",
	);

	let diffPatch = "";
	let resultBranch: string | null = null;
	let isBranchCreated = false;
	let postRunError: string | null = null;

	try {
		diffPatch = await repository.diffPatch();
		await writeDiffArtifact(runDir, diffPatch);

		if (await repository.hasChanges()) {
			resultBranch = `vibechk/${runId}`;
			await repository.createResultBranchAndCommit(resultBranch, `vibechk: capture run ${runId}`);
			isBranchCreated = true;
			await repository.restoreBranch(gitProvenance.startingBranch);

			if (!(await repository.isClean())) {
				postRunError = `Workdir ${resolvedWorkdir} was not clean after restoring branch ${gitProvenance.startingBranch}.`;
			}
		}
	} catch (error: unknown) {
		if (error instanceof VibechkError) {
			postRunError = error.message;
		} else {
			throw error;
		}

		await writeBestEffortDiffArtifact(runDir, diffPatch, deps.stderr);
	}

	const finishedAt = deps.clock();
	const errorMessage = runnerError ?? postRunError;
	const status = runnerResult.exitCode === 0 && errorMessage === null ? "success" : "failed";

	const bundle: RunBundle = {
		schemaVersion: SCHEMA_VERSION,
		runId,
		status,
		startedAt,
		finishedAt,
		runner: runnerName,
		runnerVersion: runnerResult.runnerVersion,
		model,
		planSource: resolvedPlanPath,
		workdir: resolvedWorkdir,
		git: gitProvenance,
		metrics: runnerResult.metrics,
		resultBranch,
		branchCreated: isBranchCreated,
		runnerExitCode: runnerResult.exitCode,
		error: errorMessage,
	};

	await writeBundle(runDir, bundle);

	if (postRunError !== null) {
		throw new VibechkError(postRunError);
	}

	let exitCode = runnerResult.exitCode;
	if (runnerError !== null && exitCode === 0) {
		exitCode = 1;
	}

	return {
		runId,
		exitCode,
	};
}

async function writeDiffArtifact(runDir: string, diffPatch: string): Promise<void> {
	await writeFile(join(runDir, DIFF_FILE_NAME), diffPatch, "utf-8");
}

async function writeBestEffortDiffArtifact(
	runDir: string,
	diffPatch: string,
	stderr: (text: string) => void,
): Promise<void> {
	try {
		await writeDiffArtifact(runDir, diffPatch);
	} catch (error: unknown) {
		stderr(`Warning: could not write best-effort diff artifact: ${formatUnknownError(error)}\n`);
	}
}

function formatUnknownError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

async function resolvePlanPath(planPath: string): Promise<string> {
	const resolved = resolve(planPath);
	try {
		const info = await stat(resolved);
		if (!info.isFile()) {
			throw new VibechkError(`Plan path ${planPath} is not a file.`);
		}
	} catch (error: unknown) {
		if (error instanceof VibechkError) throw error;
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new VibechkError(`Plan path ${planPath} does not exist.`);
		}
		throw error;
	}
	return resolved;
}

async function resolveWorkdir(workdir: string): Promise<string> {
	const resolved = resolve(workdir);
	try {
		const info = await stat(resolved);
		if (!info.isDirectory()) {
			throw new VibechkError(`Workdir ${workdir} is not a directory.`);
		}
	} catch (error: unknown) {
		if (error instanceof VibechkError) throw error;
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new VibechkError(`Workdir ${workdir} does not exist.`);
		}
		throw error;
	}
	return resolved;
}

async function readPlanText(planPath: string): Promise<string> {
	try {
		return await readFile(planPath, "utf-8");
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new VibechkError(`Plan file not found: ${planPath}`);
		}
		throw error;
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

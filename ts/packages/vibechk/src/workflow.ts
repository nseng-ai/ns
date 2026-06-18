import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { GitProvenance, RunBundle } from "./models.ts";
import type { GitGateway } from "./git.ts";
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
	gitGateway: GitGateway;
	clock: () => Date;
	idGenerator: () => string;
	stdout: (text: string) => void;
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

	const git = deps.gitGateway;

	const repoRoot = await git.repoRoot();
	const startingBranch = await git.currentBranch();
	const startingCommit = await git.currentCommit();
	const remotes = await git.remotes();

	if (!(await git.isClean())) {
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
		diffPatch = await git.diffPatch();
		await writeFile(join(runDir, DIFF_FILE_NAME), diffPatch, "utf-8");

		if (await git.hasChanges()) {
			resultBranch = `vibechk/${runId}`;
			await git.createResultBranchAndCommit(resultBranch, `vibechk: capture run ${runId}`);
			isBranchCreated = true;
			await git.checkout(startingBranch);

			if (!(await git.isClean())) {
				postRunError = `Workdir ${resolvedWorkdir} was not clean after restoring branch ${startingBranch}.`;
			}
		}
	} catch (error: unknown) {
		if (error instanceof VibechkError) {
			postRunError = error.message;
		} else {
			throw error;
		}

		try {
			await writeFile(join(runDir, DIFF_FILE_NAME), diffPatch, "utf-8");
		} catch {
			// Ignore write failure for diff in error path
		}
	}

	const finishedAt = deps.clock();
	const errorMessage = runnerError ?? postRunError;
	const status = runnerResult.exitCode === 0 && errorMessage === null ? "success" : "failed";

	const gitProvenance: GitProvenance = {
		repoRoot,
		startingBranch,
		startingCommit,
		remotes,
	};

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

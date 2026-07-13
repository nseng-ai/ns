// The real DispatchWorkspaceGateway adapter: Node filesystem access to the
// step-6 contract paths plus git over the sandbox checkout. It owns the two
// contract-critical mechanics the runner core must be able to rely on:
// the completion result appears atomically (written to a scratch path in
// the same directory, then renamed into place, so the workflow's poll step
// can never read a half-written JSON), and expected failures come back as
// result values, never throws. `io` is the test seam; production uses the
// Node-backed default.
import { execFile } from "node:child_process";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
	DISPATCH_DECISION_LOG_PATH,
	DISPATCH_PROMPT_PATH,
	DISPATCH_RESULT_PATH,
} from "../dispatch/dispatch-run.ts";
import type {
	DecisionLogExistsResult,
	DispatchWorkspaceGateway,
	HasUncommittedChangesResult,
	PiRunnerCompletion,
	ReadDispatchedPromptResult,
	WorkspaceWriteResult,
} from "./runner.ts";

/** Scratch path the completion result is written to before the rename. */
export const DISPATCH_RESULT_PARTIAL_PATH = `${DISPATCH_RESULT_PATH}.partial`;

export interface DispatchWorkspaceIo {
	/** Resolve to `null` when the file does not exist. */
	readTextFile(path: string): Promise<string | null>;
	pathExists(path: string): Promise<boolean>;
	writeTextFile(path: string, content: string): Promise<void>;
	/** Must be atomic for same-directory moves (POSIX rename). */
	renameFile(from: string, to: string): Promise<void>;
	makeDirectory(path: string): Promise<void>;
	/** Run git with these args in the checkout; non-zero exits resolve. */
	runGitCommand(
		args: readonly string[],
	): Promise<{ readonly exitCode: number; readonly stdout: string }>;
}

function createNodeDispatchWorkspaceIo(checkoutDirectory: string): DispatchWorkspaceIo {
	return {
		async readTextFile(path) {
			try {
				return await readFile(path, "utf8");
			} catch (error) {
				if (isFileMissingError(error)) return null;
				throw error;
			}
		},
		async pathExists(path) {
			try {
				await access(path);
				return true;
			} catch {
				return false;
			}
		},
		async writeTextFile(path, content) {
			await writeFile(path, content, "utf8");
		},
		async renameFile(from, to) {
			await rename(from, to);
		},
		async makeDirectory(path) {
			await mkdir(path, { recursive: true });
		},
		async runGitCommand(args) {
			return await new Promise((resolve, reject) => {
				execFile(
					"git",
					[...args],
					{ cwd: checkoutDirectory, encoding: "utf8" },
					(error, stdout) => {
						if (error === null) {
							resolve({ exitCode: 0, stdout });
							return;
						}
						// A non-zero exit is an expected outcome, not a throw; only
						// spawn-level failures (git missing, cwd gone) reject.
						if (typeof error.code === "number") {
							resolve({ exitCode: error.code, stdout });
							return;
						}
						reject(error);
					},
				);
			});
		},
	};
}

function isFileMissingError(error: unknown): boolean {
	return (
		typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
	);
}

export function createRealDispatchWorkspaceGateway(options: {
	readonly checkoutDirectory: string;
	readonly io?: DispatchWorkspaceIo;
}): DispatchWorkspaceGateway {
	const io = options.io ?? createNodeDispatchWorkspaceIo(options.checkoutDirectory);
	return {
		async readDispatchedPrompt(): Promise<ReadDispatchedPromptResult> {
			try {
				return { ok: true, prompt: await io.readTextFile(DISPATCH_PROMPT_PATH) };
			} catch {
				return { ok: false };
			}
		},
		async decisionLogExists(): Promise<DecisionLogExistsResult> {
			try {
				return { ok: true, hasDecisionLog: await io.pathExists(DISPATCH_DECISION_LOG_PATH) };
			} catch {
				return { ok: false };
			}
		},
		async writeFallbackDecisionLog(content: string): Promise<WorkspaceWriteResult> {
			try {
				await io.makeDirectory(dirname(DISPATCH_DECISION_LOG_PATH));
				await io.writeTextFile(DISPATCH_DECISION_LOG_PATH, content);
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},
		async writeCompletionResult(completion: PiRunnerCompletion): Promise<WorkspaceWriteResult> {
			try {
				await io.makeDirectory(dirname(DISPATCH_RESULT_PATH));
				await io.writeTextFile(DISPATCH_RESULT_PARTIAL_PATH, `${JSON.stringify(completion)}\n`);
				// The rename is the completion signal: the file at the contract
				// path is always a whole JSON document.
				await io.renameFile(DISPATCH_RESULT_PARTIAL_PATH, DISPATCH_RESULT_PATH);
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},
		async hasUncommittedChanges(): Promise<HasUncommittedChangesResult> {
			try {
				const status = await io.runGitCommand(["status", "--porcelain"]);
				if (status.exitCode !== 0) return { ok: false };
				return { ok: true, hasUncommittedChanges: status.stdout.trim().length > 0 };
			} catch {
				return { ok: false };
			}
		},
		async commitAllChanges(message: string): Promise<WorkspaceWriteResult> {
			try {
				const added = await io.runGitCommand(["add", "--all"]);
				if (added.exitCode !== 0) return { ok: false };
				const committed = await io.runGitCommand(["commit", "--message", message]);
				if (committed.exitCode !== 0) return { ok: false };
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},
	};
}

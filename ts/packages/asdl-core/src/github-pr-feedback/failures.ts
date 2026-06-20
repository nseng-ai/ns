import type { RunGitHubCliResult } from "../github-cli.ts";
import type { Result } from "../result.ts";

import type {
	GithubPrFeedbackFailure,
	GithubPrFeedbackFailureCode,
	GithubPrFeedbackFailureDetails,
	GithubPrFeedbackOperation,
} from "./types.ts";

export function feedbackOk<T>(value: T): Result<T, GithubPrFeedbackFailure> {
	return { ok: true, value };
}

export function feedbackErr<T = never>(
	error: GithubPrFeedbackFailure,
): Result<T, GithubPrFeedbackFailure> {
	return { ok: false, error };
}

export function failureFromStartup(
	run: Extract<RunGitHubCliResult, { readonly type: "startup_error" }>,
	operation: GithubPrFeedbackOperation,
): GithubPrFeedbackFailure {
	return {
		code: "github_pr_feedback_startup_failed",
		message: run.message,
		displayCommand: run.displayCommand,
		details: {
			operation,
			command: run.command,
			displayCommand: run.displayCommand,
			stderr: run.message,
		},
	};
}

export function failureFromCompleted(
	run: Extract<RunGitHubCliResult, { readonly type: "completed" }>,
	operation: GithubPrFeedbackOperation,
	context: {
		readonly prNumber?: number | undefined;
		readonly threadId?: string | undefined;
		readonly cursorContext?: string | undefined;
	} = {},
): GithubPrFeedbackFailure {
	const stderr = run.result.stderr.trim();
	const stdout = run.result.stdout.trim();
	return failureFromMessage({
		code: "github_pr_feedback_gh_failed",
		operation,
		message: stderr || stdout || `gh exited with code ${run.result.code}`,
		run,
		stdout: run.result.stdout,
		stderr: run.result.stderr,
		exitCode: run.result.code,
		killed: run.result.killed,
		prNumber: context.prNumber,
		threadId: context.threadId,
		cursorContext: context.cursorContext,
	});
}

export function failureFromMessage(options: {
	readonly code: GithubPrFeedbackFailureCode;
	readonly operation: GithubPrFeedbackOperation;
	readonly message: string;
	readonly run?: Extract<RunGitHubCliResult, { readonly type: "completed" }> | undefined;
	readonly stdout?: string | undefined;
	readonly stderr?: string | undefined;
	readonly exitCode?: number | undefined;
	readonly killed?: boolean | undefined;
	readonly graphqlErrors?: unknown;
	readonly zodError?: string | undefined;
	readonly prNumber?: number | undefined;
	readonly threadId?: string | undefined;
	readonly cursorContext?: string | undefined;
}): GithubPrFeedbackFailure {
	const details: GithubPrFeedbackFailureDetails = {
		operation: options.operation,
		...(options.run === undefined
			? {}
			: { command: options.run.command, displayCommand: options.run.displayCommand }),
		...(options.stdout === undefined ? {} : { stdout: options.stdout }),
		...(options.stderr === undefined ? {} : { stderr: options.stderr }),
		...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
		...(options.killed === undefined ? {} : { killed: options.killed }),
		...(options.graphqlErrors === undefined ? {} : { graphqlErrors: options.graphqlErrors }),
		...(options.zodError === undefined ? {} : { zodError: options.zodError }),
		...(options.cursorContext === undefined ? {} : { cursorContext: options.cursorContext }),
		...(options.threadId === undefined ? {} : { threadId: options.threadId }),
		...(options.prNumber === undefined ? {} : { prNumber: options.prNumber }),
	};
	return {
		code: options.code,
		message: options.message,
		...(options.run === undefined ? {} : { displayCommand: options.run.displayCommand }),
		details,
	};
}

export function jsonErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

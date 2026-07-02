import type { RunGitHubCliResult } from "../cli.ts";
import { errorDetailText, resultErr, resultOk, type Result } from "@sdl/core/result";

import type {
	GithubPrFeedbackCursorContextFields,
	GithubPrFeedbackFailure,
	GithubPrFeedbackFailureCode,
	GithubPrFeedbackFailureDetails,
	GithubPrFeedbackOperation,
} from "./types.ts";

interface FailureFromMessageOptions extends GithubPrFeedbackCursorContextFields {
	readonly code: GithubPrFeedbackFailureCode;
	readonly operation: GithubPrFeedbackOperation;
	readonly message: string;
	readonly run?: Extract<RunGitHubCliResult, { readonly type: "completed" }>;
	readonly stdout?: string;
	readonly stderr?: string;
	readonly exitCode?: number;
	readonly killed?: boolean;
	readonly graphqlErrors?: unknown;
	readonly zodError?: string;
}

export function feedbackOk<T>(value: T): Result<T, GithubPrFeedbackFailure> {
	return resultOk<T, GithubPrFeedbackFailure>(value);
}

export function feedbackErr<T = never>(
	error: GithubPrFeedbackFailure,
): Result<T, GithubPrFeedbackFailure> {
	return resultErr<T, GithubPrFeedbackFailure>(error);
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

export function failureContextFields(
	context: GithubPrFeedbackCursorContextFields,
): GithubPrFeedbackCursorContextFields {
	return {
		...(context.prNumber === undefined ? {} : { prNumber: context.prNumber }),
		...(context.threadId === undefined ? {} : { threadId: context.threadId }),
		...(context.cursorContext === undefined ? {} : { cursorContext: context.cursorContext }),
	};
}

export function failureFromCompleted(
	run: Extract<RunGitHubCliResult, { readonly type: "completed" }>,
	operation: GithubPrFeedbackOperation,
	context: GithubPrFeedbackCursorContextFields = {},
): GithubPrFeedbackFailure {
	return failureFromMessage({
		code: "github_pr_feedback_gh_failed",
		operation,
		message: errorDetailText({
			stderr: run.result.stderr,
			stdout: run.result.stdout,
			fallback: `gh exited with code ${run.result.code}`,
		}),
		run,
		stdout: run.result.stdout,
		stderr: run.result.stderr,
		exitCode: run.result.code,
		killed: run.result.killed,
		...failureContextFields(context),
	});
}

export function failureFromMessage(options: FailureFromMessageOptions): GithubPrFeedbackFailure {
	const details = buildFailureDetails(options);
	return {
		code: options.code,
		message: options.message,
		...(options.run === undefined ? {} : { displayCommand: options.run.displayCommand }),
		details,
	};
}

function buildFailureDetails(options: FailureFromMessageOptions): GithubPrFeedbackFailureDetails {
	return {
		operation: options.operation,
		...failureContextFields(options),
		...(options.run === undefined
			? {}
			: { command: options.run.command, displayCommand: options.run.displayCommand }),
		...(options.stdout === undefined ? {} : { stdout: options.stdout }),
		...(options.stderr === undefined ? {} : { stderr: options.stderr }),
		...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
		...(options.killed === undefined ? {} : { killed: options.killed }),
		...(options.graphqlErrors === undefined ? {} : { graphqlErrors: options.graphqlErrors }),
		...(options.zodError === undefined ? {} : { zodError: options.zodError }),
	};
}

import type { z } from "zod";

import {
	failure,
	type ClinkrCommandSpec,
	type ClinkrExit,
	type ClinkrGroup,
	type ClinkrHandler,
} from "@sdl/clinkr";
import { createSdlDomainCommand } from "@sdl/capability-kit/sdl-command";
import type { SdlCommand, SdlExtensionApi } from "@sdl/kernel/sdk";
import type { GitResult } from "@sdl/git";
import type { GithubPrFeedbackFailure } from "./api.ts";
import { errorDetailText } from "@sdl/core/result";

import type { PrAddressContext } from "./context.ts";
import type { GatewayFailure, GatewayOptions, RepoContextResult } from "./core/gateways.ts";

/** Handler-facing runtime for one exec operation; clinkr's io seam owns all output. */
export interface PrAddressExecContext {
	context: PrAddressContext;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
}

/** One exec operation, ready to mount on the hidden `exec` subgroup. */
export interface ExecOperation {
	name: string;
	schema: z.ZodObject;
	resultSchema: z.ZodType;
	toSdlCommand(createContext: (ctx: SdlExtensionApi) => PrAddressExecContext): SdlCommand;
	addTo(group: ClinkrGroup<PrAddressExecContext>): void;
}

export function gatewayOptions(ctx: PrAddressExecContext): GatewayOptions {
	return { cwd: ctx.cwd, env: ctx.env };
}

export function gatewayFailureExit(prefix: string, gatewayFailure: GatewayFailure) {
	return failure("pr-gateway-failure", gatewayFailureMessage(prefix, gatewayFailure));
}

export interface FailureDetailInput {
	readonly stderr?: string | null;
	readonly stdout?: string | null;
	readonly message?: string | null;
	readonly code: string;
}

export function failureDetail(input: FailureDetailInput): string {
	return errorDetailText({
		stderr: input.stderr,
		stdout: input.stdout,
		message: input.message,
		fallback: input.code,
	});
}

export function gatewayFailureMessage(prefix: string, gatewayFailure: GatewayFailure): string {
	return `${prefix}: ${failureDetail({
		...(gatewayFailure.stderr === undefined ? {} : { stderr: gatewayFailure.stderr }),
		...(gatewayFailure.stdout === undefined ? {} : { stdout: gatewayFailure.stdout }),
		...(gatewayFailure.message === undefined ? {} : { message: gatewayFailure.message }),
		code:
			typeof gatewayFailure.returncode === "number"
				? `exit code ${gatewayFailure.returncode}`
				: (gatewayFailure.code ?? "gateway failed"),
	})}`;
}

export function prFeedbackFailureExit(prefix: string, prFeedbackFailure: GithubPrFeedbackFailure) {
	return failure("pr-gateway-failure", prFeedbackFailureMessage(prefix, prFeedbackFailure));
}

export type PrTargetFailureResult =
	| { type: "git_failure"; message: string; failure: GatewayFailure }
	| { type: "pr_feedback_failure"; message: string; failure: GithubPrFeedbackFailure }
	| { type: "detached_head"; message: string };

export function prTargetFailureExit(result: PrTargetFailureResult): ClinkrExit<never> {
	switch (result.type) {
		case "git_failure":
			return gatewayFailureExit(result.message, result.failure);
		case "pr_feedback_failure":
			return prFeedbackFailureExit(result.message, result.failure);
		case "detached_head":
			return failure("detached-head", result.message);
	}
}

export function prFeedbackFailureMessage(
	prefix: string,
	prFeedbackFailure: GithubPrFeedbackFailure,
): string {
	const details = prFeedbackFailure.details;
	return `${prefix}: ${failureDetail({
		...(typeof details?.stderr === "string" ? { stderr: details.stderr } : {}),
		...(typeof details?.stdout === "string" ? { stdout: details.stdout } : {}),
		message: prFeedbackFailure.message,
		code: prFeedbackFailure.code,
	})}`;
}

type ExecOperationSpec<S extends z.ZodObject, T> = Omit<
	ClinkrCommandSpec<PrAddressExecContext, S, T>,
	"resultSchema" | "schemaDocument"
> & {
	readonly resultSchema?: never;
	readonly schemaDocument?: never;
};

export interface DefineExecOperationOptions<S extends z.ZodObject, T> {
	spec: ExecOperationSpec<S, T>;
	resultSchema: z.ZodType<T>;
	/**
	 * Operation calls GitHub through `gh`, which resolves `owner/repo` from the
	 * cwd's git remotes. The operation fails fast with `repo-context-required`
	 * when run outside a git work tree.
	 */
	isRepoContextRequired?: boolean;
}

export function defineExecOperation<S extends z.ZodObject, T>(
	options: DefineExecOperationOptions<S, T>,
): ExecOperation {
	const { spec } = options;
	const handler =
		options.isRepoContextRequired === true
			? withRepoContextPrecondition(spec.handler)
			: spec.handler;
	return {
		name: spec.name,
		schema: spec.schema,
		resultSchema: options.resultSchema,
		toSdlCommand(createContext) {
			return createSdlDomainCommand({
				name: `exec-${spec.name}`,
				summary: spec.description ?? spec.summary ?? spec.name,
				description: spec.description ?? spec.summary ?? spec.name,
				schema: spec.schema,
				...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
				resultSchema: options.resultSchema,
				...(spec.renderHuman === undefined ? {} : { renderHuman: spec.renderHuman }),
				createContext,
				handler,
			});
		},
		addTo(group) {
			const commandSpec = {
				...spec,
				handler,
				resultSchema: options.resultSchema,
			} satisfies ClinkrCommandSpec<PrAddressExecContext, S, T>;
			group.command(commandSpec);
		},
	};
}

function withRepoContextPrecondition<S extends z.ZodObject, T>(
	handler: ClinkrHandler<PrAddressExecContext, S, T>,
): ClinkrHandler<PrAddressExecContext, S, T> {
	return async (ctx, request) => {
		const probe = repoContextFromGitProbe(
			await ctx.context.git.isInsideWorkTree({ cwd: ctx.cwd, env: ctx.env }),
		);
		switch (probe.type) {
			case "inside":
				return handler(ctx, request);
			case "outside":
				return failure(
					"repo-context-required",
					"pr-address must run inside the target git repository (gh resolves the repo from the current directory).",
				);
			case "failure":
				return gatewayFailureExit("Failed to determine repository context", probe.failure);
		}
	};
}

export function repoContextFromGitProbe(result: GitResult<boolean>): RepoContextResult {
	if (!result.ok) return { type: "failure", failure: result.error };
	return result.value ? { type: "inside" } : { type: "outside" };
}

import type { z } from "zod";

import {
	failure,
	type ClinkrCommandSpec,
	type ClinkrGroup,
	type ClinkrHandler,
} from "@asdl/clinkr";
import type { GithubPrFeedbackFailure } from "@asdl/core/github-pr-feedback";

import type { PrAddressContext } from "./context.ts";
import type { GatewayFailure, GatewayOptions } from "./gateways.ts";

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
	addTo(group: ClinkrGroup<PrAddressExecContext>): void;
}

export function gatewayOptions(ctx: PrAddressExecContext): GatewayOptions {
	return { cwd: ctx.cwd, env: ctx.env };
}

export function gatewayFailureExit(prefix: string, gatewayFailure: GatewayFailure) {
	return failure("pr_gateway_failure", gatewayFailureMessage(prefix, gatewayFailure));
}

export interface FailureDetailInput {
	readonly stderr?: string | null | undefined;
	readonly stdout?: string | null | undefined;
	readonly message?: string | null | undefined;
	readonly code: string;
}

export function failureDetail(input: FailureDetailInput): string {
	const stderr = typeof input.stderr === "string" ? input.stderr : null;
	const stdout = typeof input.stdout === "string" ? input.stdout : null;
	if (stderr !== null && stderr.trim() !== "") return stderr;
	if (stdout !== null && stdout.trim() !== "") return stdout;
	if (typeof input.message === "string" && input.message.trim() !== "") return input.message;
	return input.code;
}

export function gatewayFailureMessage(prefix: string, gatewayFailure: GatewayFailure): string {
	return `${prefix}: ${failureDetail({
		stderr: gatewayFailure.stderr,
		stdout: gatewayFailure.stdout,
		message: gatewayFailure.message,
		code:
			typeof gatewayFailure.returncode === "number"
				? `exit code ${gatewayFailure.returncode}`
				: (gatewayFailure.code ?? "gateway failed"),
	})}`;
}

export function prFeedbackFailureExit(prefix: string, prFeedbackFailure: GithubPrFeedbackFailure) {
	return failure("pr_gateway_failure", prFeedbackFailureMessage(prefix, prFeedbackFailure));
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
	 * cwd's git remotes. The operation fails fast with `repo_context_required`
	 * when run outside a git work tree.
	 */
	isRepoContextRequired?: boolean | undefined;
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
		const probe = await ctx.context.git.isInsideWorkTree({ cwd: ctx.cwd, env: ctx.env });
		if (probe.type === "outside") {
			return failure(
				"repo_context_required",
				"pr-address must run inside the target git repository (gh resolves the repo from the current directory).",
			);
		}
		return handler(ctx, request);
	};
}

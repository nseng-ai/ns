import type { z } from "zod";

import { failure, type ClinkrCommandSpec, type ClinkrExit, type ClinkrGroup, type ClinkrHandler, type JsonSchemaDocument } from "@asdl/clinkr";

import type { PrAddressContext } from "./context.ts";
import type { GatewayFailure, GatewayOptions } from "./gateways.ts";
import { buildOperationSchemaDocument } from "./operation-schemas/index.ts";
import type { PayloadArtifactStore, PayloadReference } from "./payload-store.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import { stdoutModeSchema, writeGenericFullOutputArtifact } from "./stdout-mode.ts";

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
	addTo(group: ClinkrGroup<PrAddressExecContext>): void;
}

export function gatewayOptions(ctx: PrAddressExecContext): GatewayOptions {
	return { cwd: ctx.cwd, env: ctx.env };
}

export function gatewayFailureExit(prefix: string, gatewayFailure: GatewayFailure) {
	return failure("pr_gateway_failure", gatewayFailureMessage(prefix, gatewayFailure));
}

export function gatewayFailureDetail(gatewayFailure: GatewayFailure): string {
	const stderr = typeof gatewayFailure.stderr === "string" ? gatewayFailure.stderr : null;
	const stdout = typeof gatewayFailure.stdout === "string" ? gatewayFailure.stdout : null;
	if (stderr !== null && stderr.trim() !== "") return stderr;
	if (stdout !== null && stdout.trim() !== "") return stdout;
	if (typeof gatewayFailure.message === "string" && gatewayFailure.message.trim() !== "") return gatewayFailure.message;
	if (typeof gatewayFailure.returncode === "number") return `exit code ${gatewayFailure.returncode}`;
	return gatewayFailure.code ?? "gateway failed";
}

export function gatewayFailureMessage(prefix: string, gatewayFailure: GatewayFailure): string {
	return `${prefix}: ${gatewayFailureDetail(gatewayFailure)}`;
}

export type CompactOutputResult = { type: "ok"; value: unknown } | { type: "error"; errorType: string; message: string };

export interface CompactOutputOptions<S extends z.ZodObject, T> {
	buildCompact: (options: {
		ctx: PrAddressExecContext;
		request: z.output<S>;
		data: T;
		store: PayloadArtifactStore;
		fullOutput: PayloadReference;
	}) => CompactOutputResult | Promise<CompactOutputResult>;
	harnessSessionId?: (request: z.output<S>) => string | undefined;
}

export interface DefineExecOperationOptions<S extends z.ZodObject, T> {
	spec: ClinkrCommandSpec<PrAddressExecContext, S, T>;
	compactOutput?: CompactOutputOptions<S, T> | undefined;
	/**
	 * Operation calls GitHub through `gh`, which resolves `owner/repo` from the
	 * cwd's git remotes. The operation fails fast with `repo_context_required`
	 * when run outside a git work tree.
	 */
	isRepoContextRequired?: boolean | undefined;
}

/**
 * Wrap a clinkr command spec as an exec operation: the `--json-schema` document
 * is served from the contract-pinned builders in `operation-schemas/index.ts`,
 * and repo-context-required operations get the LBYL work-tree precondition
 * applied after parse (never blocking the eager `--json-schema` route).
 */
export function defineExecOperation<S extends z.ZodObject, T>(options: DefineExecOperationOptions<S, T>): ExecOperation {
	const { spec } = options;
	const domainHandler = options.isRepoContextRequired === true ? withRepoContextPrecondition(spec.handler) : spec.handler;
	const schema = options.compactOutput === undefined ? spec.schema : spec.schema.extend({ stdout_mode: stdoutModeSchema });
	const handler = options.compactOutput === undefined ? domainHandler : withCompactOutput(spec.name, domainHandler, options.compactOutput);
	return {
		name: spec.name,
		schema,
		addTo(group) {
			const commandSpec = { ...spec, schema, handler, schemaDocument: () => requireOperationSchemaDocument(spec.name) } as ClinkrCommandSpec<
				PrAddressExecContext,
				z.ZodObject,
				unknown
			>;
			group.command(commandSpec);
		},
	};
}

function withCompactOutput<S extends z.ZodObject, T>(
	operation: string,
	handler: ClinkrHandler<PrAddressExecContext, S, T>,
	options: CompactOutputOptions<S, T>,
): ClinkrHandler<PrAddressExecContext, z.ZodObject, unknown> {
	return async (ctx, request) => {
		const { stdout_mode: stdoutMode, ...domainRequest } = request as z.output<S> & { stdout_mode: "full" | "compact" };
		const exit = await handler(ctx, domainRequest as z.output<S>);
		if (exit.type === "failure" || stdoutMode === "full") return exit;
		if (exit.type === "negative" && exit.data === undefined) return exit;
		const data = exit.type === "ok" ? exit.data : exit.data;
		const store = await openPayloadStoreFromContext({ ctx, harnessSessionId: options.harnessSessionId?.(domainRequest as z.output<S>) });
		if (store.type === "error") return failure(store.errorType, store.message);
		const fullOutput = await writeGenericFullOutputArtifact({ store: store.value, operation, data });
		if (fullOutput.type === "error") return failure(fullOutput.errorType, fullOutput.message);
		const compact = await options.buildCompact({ ctx, request: domainRequest as z.output<S>, data: data as T, store: store.value, fullOutput: fullOutput.value });
		if (compact.type === "error") return failure(compact.errorType, compact.message);
		if (exit.type === "ok") return { type: "ok", data: compact.value } satisfies ClinkrExit<unknown>;
		return { type: "negative", message: exit.message, data: compact.value } satisfies ClinkrExit<unknown>;
	};
}

function requireOperationSchemaDocument(operation: string): JsonSchemaDocument {
	const document = buildOperationSchemaDocument(operation);
	if (document === undefined) {
		throw new Error(`pr-address: no schema document builder for exec operation '${operation}'`);
	}
	return document;
}

/**
 * LBYL precondition for operations that call GitHub: `gh` resolves `owner/repo`
 * from the cwd's git remotes, so running outside a repository fails lazily and
 * confusingly mid-fetch. Fail fast with a clear error instead. The probe is
 * fail-open: a probe failure must never block a run that would have succeeded.
 */
function withRepoContextPrecondition<S extends z.ZodObject, T>(
	handler: ClinkrHandler<PrAddressExecContext, S, T>,
): ClinkrHandler<PrAddressExecContext, S, T> {
	return async (ctx, request) => {
		const probe = await ctx.context.git.isInsideWorkTree({ cwd: ctx.cwd, env: ctx.env });
		if (probe.type === "outside") {
			return failure("repo_context_required", "pr-address must run inside the target git repository (gh resolves the repo from the current directory).");
		}
		return handler(ctx, request);
	};
}

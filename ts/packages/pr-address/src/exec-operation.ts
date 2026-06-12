import type { z } from "zod";

import { failure, type ClinkrCommandSpec, type ClinkrGroup, type ClinkrHandler, type JsonSchemaDocument } from "@asdl/clinkr";

import type { PrAddressContext } from "./context.ts";
import { buildOperationSchemaDocument } from "./operation-schemas/index.ts";

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
	addTo(group: ClinkrGroup<PrAddressExecContext>): void;
}

export interface DefineExecOperationOptions<S extends z.ZodObject, T> {
	spec: ClinkrCommandSpec<PrAddressExecContext, S, T>;
	/**
	 * Operation calls GitHub through `gh`, which resolves `owner/repo` from the
	 * cwd's git remotes. The operation fails fast with `repo_context_required`
	 * when run outside a git work tree.
	 */
	isRepoContextRequired?: boolean | undefined;
}

/**
 * Wrap a clinkr command spec as an exec operation: the `--json-schema` document
 * is served from the pinned Python-parity builders in `operation-schemas/`,
 * and repo-context-required operations get the LBYL work-tree precondition
 * applied after parse (never blocking the eager `--json-schema` route).
 */
export function defineExecOperation<S extends z.ZodObject, T>(options: DefineExecOperationOptions<S, T>): ExecOperation {
	const { spec } = options;
	const handler = options.isRepoContextRequired === true ? withRepoContextPrecondition(spec.handler) : spec.handler;
	return {
		name: spec.name,
		addTo(group) {
			group.command({ ...spec, handler, schemaDocument: () => requireOperationSchemaDocument(spec.name) });
		},
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

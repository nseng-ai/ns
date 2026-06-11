/**
 * Deprecated-from-birth legacy output plumbing for CLIs migrated onto clinkr
 * that must keep their pre-clinkr machine contract: a compact
 * `{"success":true,...}` body on ok and `{"success":false,"error":{...}}` with
 * exit 2 on failure. One directory to delete when the migration-debt ledger
 * kills the `legacyMachine` escape hatch. Intentionally not re-exported from
 * the package root — `@asdl/clinkr/legacy` is the only door.
 */

import type { z } from "zod";

import type { LegacyMachineOutput } from "../emit.ts";
import { ok, type ClinkrExit } from "../exit.ts";
import { ClinkrFailure } from "../failure.ts";
import type { ClinkrCommandSpec } from "../group.ts";
import type { PositionalSpec } from "../surface.ts";

export interface LegacyPayload {
	/** Spread into the compact `{"success":true,...}` machine body. */
	machine: Record<string, unknown>;
	/** Exact human rendering for `--format human`. */
	human: string;
}

export interface LegacyCommandSpec<TContext, S extends z.ZodObject> {
	name: string;
	description?: string;
	schema: S;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	/** `error.code` for negative exits and non-ClinkrFailure throws. */
	errorType: string;
	run: (ctx: TContext, request: z.output<S>) => Promise<LegacyPayload>;
}

export function legacyCommand<TContext, S extends z.ZodObject>(
	spec: LegacyCommandSpec<TContext, S>,
): ClinkrCommandSpec<TContext, S, LegacyPayload> {
	return {
		name: spec.name,
		...(spec.description === undefined ? {} : { description: spec.description }),
		schema: spec.schema,
		...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
		handler: async (ctx, request) => {
			try {
				return ok(await spec.run(ctx, request));
			} catch (error) {
				throw toLegacyFailure(spec.errorType, error);
			}
		},
		renderHuman: (payload) => payload.human,
		legacyMachine: legacyMachine(spec.errorType),
	};
}

export function legacyMachine(
	errorType: string,
): (exit: ClinkrExit<LegacyPayload>) => LegacyMachineOutput {
	return (exit) => {
		switch (exit.type) {
			case "ok":
				return {
					body: { success: true, ...exit.data.machine },
					exitCode: 0,
					serialization: "compact",
				};
			case "failure":
				return legacyFailureOutput(exit.errorType, exit.message);
			case "negative":
				// Defensive parity branch: legacy commands never return negative, but
				// the legacy contract has no negative channel, so map it to failure.
				return legacyFailureOutput(errorType, exit.message);
		}
	};
}

interface LegacyFailureBody {
	success: false;
	error: { code: string; message: string };
}

function legacyFailureOutput(code: string, message: string): LegacyMachineOutput {
	const body: LegacyFailureBody = { success: false, error: { code, message } };
	return { body, exitCode: 2, serialization: "compact" };
}

function toLegacyFailure(errorType: string, error: unknown): ClinkrFailure {
	if (error instanceof ClinkrFailure) return error;
	return new ClinkrFailure({ errorType, message: formatErrorMessage(error) });
}

// Inlined copy of @asdl/core's formatErrorMessage: clinkr has zero workspace
// deps, and this module must delete cleanly without leaving a dep to GC.
function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

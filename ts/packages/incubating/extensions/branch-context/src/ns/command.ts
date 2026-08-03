import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@nseng-ai/sdk";
import type { z } from "zod";

import {
	createRealBranchContextCliContext,
	type BranchContextCliContext,
} from "../core/operations.ts";

type BranchContextNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	DefineCommandSpec<S, T>,
	"handler"
> & {
	readonly handler: (
		ctx: BranchContextCliContext,
		request: z.output<S>,
	) => Promise<unknown> | unknown;
};

export function branchContextCommand<S extends NsCommandSchema, T>(
	options: BranchContextNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return defineCommand({
		...options,
		handler: async (ctx, request) =>
			toModernOutcome<T>(await options.handler(createBranchContextExtensionContext(ctx), request)),
	});
}

function createBranchContextExtensionContext(ctx: NsExtensionApi): BranchContextCliContext {
	return createRealBranchContextCliContext({
		cwd: ctx.cwd,
		env: ctx.env,
		...optionalEntry("stderr", ctx.stderr),
	});
}

function toModernOutcome<T>(value: unknown): CommandExit<T> {
	if (typeof value !== "object" || value === null || !("type" in value)) {
		throw new Error("Branch-context command returned an invalid outcome.");
	}
	const legacy = value as Record<string, unknown>;
	if (legacy.type === "ok") return { status: "success", data: legacy.data as T };
	if (legacy.type === "negative") {
		return {
			status: "negative",
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	if (legacy.type === "failure") {
		return {
			status: "failure",
			errorType: String(legacy.errorType),
			message: String(legacy.message),
			...optionalEntry("data", legacy.data),
		};
	}
	return {
		status: "usage-error",
		errorType: "usage-error",
		message: String(legacy.message),
		...optionalEntry("data", legacy.data),
	};
}

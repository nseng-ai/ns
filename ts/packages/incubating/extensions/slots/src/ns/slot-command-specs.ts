import type { ClinkrCommandSpec } from "@nseng-ai/clinkr";
import type { ClinkrExit, RenderCapabilities } from "@nseng-ai/clinkr/legacy";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { SlotCliContext } from "../core/context.ts";
import {
	gtDescendantsReportRequestSchema,
	gtDescendantsReportResultSchema,
	type GtDescendantsReportResult,
	gtRestackPreflightRequestSchema,
	gtRestackPreflightResultSchema,
	renderGtDescendantsReport,
	renderGtRestackPreflight,
	runGtDescendantsReport,
	runGtRestackPreflight,
} from "../lifecycle/operations/index.ts";

export type SlotCommandGroup = "root" | "provision" | "gt" | "gt-exec";
export type SlotCompletionKind = "checkout-branches";

export interface SlotCommandSpec extends Omit<
	ClinkrCommandSpec<SlotCliContext, z.ZodObject, unknown>,
	"completionProvider" | "summary" | "description" | "resultSchema"
> {
	group: SlotCommandGroup;
	summary: string;
	description: string;
	resultSchema: z.ZodType<unknown>;
	completionKind?: SlotCompletionKind;
}

interface TypedSlotCommandSpec<S extends z.ZodObject, T> extends Omit<
	ClinkrCommandSpec<SlotCliContext, S, T>,
	"completionProvider" | "summary" | "description" | "resultSchema"
> {
	group: SlotCommandGroup;
	summary: string;
	description: string;
	resultSchema: z.ZodType<T>;
	completionKind?: SlotCompletionKind;
}

export function slotCommandBaseSpec(spec: SlotCommandSpec) {
	return {
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		schema: spec.schema,
		...optionalEntry("positionals", spec.positionals),
		...optionalEntry("options", spec.options),
		resultSchema: spec.resultSchema,
		handler: spec.handler,
		...optionalEntry("renderHuman", spec.renderHuman),
		...optionalEntry("renderMarkdown", spec.renderMarkdown),
	};
}

function slotCommandSpec<S extends z.ZodObject, T>(
	spec: TypedSlotCommandSpec<S, T>,
): SlotCommandSpec {
	return {
		group: spec.group,
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		schema: spec.schema,
		...optionalEntry("positionals", spec.positionals),
		...optionalEntry("options", spec.options),
		...optionalEntry("completionKind", spec.completionKind),
		resultSchema: spec.resultSchema,
		handler: async (
			ctx: SlotCliContext,
			request: z.output<z.ZodObject>,
		): Promise<ClinkrExit<unknown>> => await spec.handler(ctx, request as z.output<S>),
		...(spec.renderHuman === undefined
			? {}
			: {
					renderHuman: (data: unknown, caps: RenderCapabilities) =>
						spec.renderHuman?.(data as T, caps) ?? "",
				}),
		...(spec.renderMarkdown === undefined
			? {}
			: {
					renderMarkdown: (data: unknown, caps: RenderCapabilities) =>
						spec.renderMarkdown?.(data as T, caps) ?? "",
				}),
	};
}

export const slotCommandSpecs = [
	slotCommandSpec<
		typeof gtDescendantsReportRequestSchema,
		GtDescendantsReportResult | { target: string }
	>({
		group: "gt-exec",
		name: "descendants-report",
		summary: "Emit complete descendant topology, Git evidence, and best-effort PR metadata.",
		description:
			"Inspect a named local branch's complete Graphite descendant subtree without requiring checkout.",
		schema: gtDescendantsReportRequestSchema,
		positionals: { branch: { position: 0 } },
		resultSchema: gtDescendantsReportResultSchema,
		handler: runGtDescendantsReport,
		renderHuman: (result) =>
			"root" in result ? renderGtDescendantsReport(result) : JSON.stringify(result),
	}),
	slotCommandSpec({
		group: "gt-exec",
		name: "restack-preflight",
		summary: "Emit deterministic Git, Graphite, and Slot facts before a restack.",
		description:
			"Inspect the current worktree and requested Graphite stack scope without mutating either.",
		schema: gtRestackPreflightRequestSchema,
		resultSchema: gtRestackPreflightResultSchema,
		handler: runGtRestackPreflight,
		renderHuman: renderGtRestackPreflight,
	}),
] as const;

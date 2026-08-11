import type { ClinkrCommandSpec } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { SlotCliContext } from "../core/context.ts";

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

export const slotCommandSpecs: readonly SlotCommandSpec[] = [];

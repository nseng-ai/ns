import type { ClinkrCompletionCandidate } from "@nseng-ai/clinkr";
import { z } from "zod";

import { defineCommand, type NsCommandDefinition } from "../../src/command/index.ts";
import { ok } from "../../src/command/result.ts";

export const selectedComposableCommand = defineCommand({
	name: "selected",
	summary: "Selected command.",
	resultSchema: z.string(),
	handler: () => ok("selected"),
});

export const unrelatedComposableCommand = defineCommand({
	name: "unrelated",
	summary: "Unrelated command.",
	resultSchema: z.string(),
	handler: () => ok("unrelated"),
});

const completionRequestSchema = z.object({
	value: z.enum(["static-choice"]).optional(),
	enabled: z.boolean().default(false),
});

export function createComposableCompletionFixtures(options: {
	readonly completionLog: string[];
	readonly dependency?: string;
	readonly failSelected?: boolean;
}): { selected: NsCommandDefinition<string>; unrelated: NsCommandDefinition<string> } {
	const selected = defineCommand({
		name: "completion-probe",
		summary: "Probe ns command completions.",
		schema: completionRequestSchema,
		resultSchema: z.string(),
		positionals: { value: { position: 0 } },
		completions: (bundle, request) => {
			options.completionLog.push(`selected:${request.current}`);
			if (options.failSelected === true) throw new Error("completion fixture failure");
			const candidates: ClinkrCompletionCandidate[] = [
				{ value: bundle.cwd, type: "positional-value" },
				{
					value: bundle.ns.catalog.has("@example/present") ? "catalog-present" : "catalog-missing",
					type: "positional-value",
				},
				{ value: options.dependency ?? "dependency-missing", type: "positional-value" },
			];
			return candidates.filter((candidate) => candidate.value.startsWith(request.current));
		},
		handler: () => ok("selected"),
	});
	const unrelated = defineCommand({
		name: "unrelated-completion-probe",
		summary: "Probe unrelated ns command completion loading.",
		schema: completionRequestSchema,
		resultSchema: z.string(),
		positionals: { value: { position: 0 } },
		completions: () => {
			options.completionLog.push("unrelated");
			return [{ value: "unrelated", type: "positional-value" }];
		},
		handler: () => ok("unrelated"),
	});
	return { selected, unrelated };
}

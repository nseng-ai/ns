import { defineFirstPartyCommand } from "@nseng-ai/capability-kit";
import type { ClinkrCompletionCandidate } from "@nseng-ai/clinkr";
import { nsClinkrCommand, defineCommand } from "../../src/command/index.ts";
import { ok } from "../../src/sdk/result.ts";
import { z } from "zod";

export const selectedComposableCommand = defineCommand({
	name: "selected",
	summary: "Selected command.",
	run: nsClinkrCommand({
		schema: z.object({}),
		resultSchema: z.string(),
		handler: () => ok("selected"),
	}),
});

export const unrelatedComposableCommand = defineCommand({
	name: "unrelated",
	summary: "Unrelated command.",
	run: nsClinkrCommand({
		schema: z.object({}),
		resultSchema: z.string(),
		handler: () => ok("unrelated"),
	}),
});

const completionRequestSchema = z.object({
	value: z.enum(["static-choice"]).optional(),
	enabled: z.boolean().default(false),
});

export function createComposableCompletionFixtures(options: {
	readonly completionLog: string[];
	readonly failSelected?: boolean;
}) {
	const selected = defineFirstPartyCommand({
		name: "completion-probe",
		summary: "Probe composable completions.",
		nsClinkrCommand: {
			schema: completionRequestSchema,
			resultSchema: z.string(),
			positionals: { value: { position: 0 } },
			completions: (context, bundle, request) => {
				options.completionLog.push(`selected:${request.current}`);
				if (options.failSelected === true) throw new Error("completion fixture failure");
				const candidates: ClinkrCompletionCandidate[] = [
					{ value: bundle.cwd, type: "positional-value" },
					{
						value: bundle.ns.catalog.has("@example/present")
							? "catalog-present"
							: "catalog-missing",
						type: "positional-value",
					},
					{
						value: context.env.COMPLETION_DEPENDENCY ?? "dependency-missing",
						type: "positional-value",
					},
				];
				return candidates.filter((candidate) => candidate.value.startsWith(request.current));
			},
			handler: () => ok("selected"),
		},
	});
	const unrelated = defineFirstPartyCommand({
		name: "unrelated-completion-probe",
		summary: "Probe unrelated composable completion loading.",
		nsClinkrCommand: {
			schema: completionRequestSchema,
			resultSchema: z.string(),
			positionals: { value: { position: 0 } },
			completions: () => {
				options.completionLog.push("unrelated");
				return [{ value: "unrelated", type: "positional-value" }];
			},
			handler: () => ok("unrelated"),
		},
	});
	return { selected, unrelated };
}

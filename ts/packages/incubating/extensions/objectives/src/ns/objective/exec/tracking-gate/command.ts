import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command() {
	const [{ z }, { objectiveNsCommand }, operation] = await Promise.all([
		import("zod"),
		import("../../../objective-command.ts"),
		import("../../../../core/operations/tracking-gate.ts"),
	]);
	return objectiveNsCommand({
		schema: operation.trackingGateRequestSchema,
		resultSchema: operation.trackingGateResultSchema,
		negativeSchema: operation.trackingGateResultSchema,
		usageErrorSchema: z.any(),
		positionals: { slug: { position: 0 } },
		handler: operation.runTrackingGate,
		renderHuman: operation.renderTrackingGate,
		renderMarkdown: operation.renderTrackingGate,
	});
}

const COMMAND_DESCRIPTION = "Collect deterministic Objective tracking gate evidence for one slug.";

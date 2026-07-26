import type { ClinkrCommandDefinition, ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type {
	runnerBeginRequestSchema,
	RunnerBeginFailureData,
	RunnerBeginResult,
} from "../../../../runner/begin.ts";
import type { ArgumentUsageErrorData } from "../../../../runner/preconditions.ts";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command(): Promise<
	ClinkrCommandDefinition<
		NsExtensionApi,
		typeof runnerBeginRequestSchema,
		RunnerBeginResult,
		RunnerBeginResult,
		RunnerBeginFailureData,
		ArgumentUsageErrorData
	>
> {
	const [{ z }, { objectiveNsCommand }, operation, { createNsObjectiveRunnerCoreContext }] =
		await Promise.all([
			import("zod"),
			import("../../../objective-command.ts"),
			import("../../../../runner/begin.ts"),
			import("../../../runner-context.ts"),
		]);
	return objectiveNsCommand({
		schema: operation.runnerBeginRequestSchema,
		resultSchema: operation.runnerBeginResultSchema,
		failureSchema: z.any(),
		usageErrorSchema: z.any(),
		positionals: { slug: { position: 0 } },
		createContext: createNsObjectiveRunnerCoreContext,
		handler: operation.runRunnerBegin,
		renderHuman: operation.renderRunnerBegin,
		renderMarkdown: operation.renderRunnerBegin,
	});
}

const COMMAND_DESCRIPTION =
	"Check preconditions and emit step facts plus the subagent prompt for one decomposed Objective Runner step (ADR 0024).";

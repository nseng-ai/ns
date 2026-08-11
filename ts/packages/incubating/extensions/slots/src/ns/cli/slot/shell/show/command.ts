import {
	markerSurfaceShowRequestSchema,
	markerSurfaceShowResultSchema,
	renderCommandCdWrapperScript,
	resolveRequestedShell,
} from "@nseng-ai/extension-kit/shell-support";
import { defineCommand, failure, ok } from "@nseng-ai/sdk";

import { shellShowOptionSpecs } from "../../../../../core/command-options.ts";

export async function command() {
	return defineCommand({
		name: "show",
		summary: "Print the parent-shell wrapper script.",
		description: "Print the parent-shell wrapper script.",
		schema: markerSurfaceShowRequestSchema,
		options: shellShowOptionSpecs,
		resultSchema: markerSurfaceShowResultSchema,
		handler: async (ctx, request) => {
			const selected = resolveRequestedShell(request.shell, ctx.env);
			if (selected.type === "failure") {
				return failure(selected.failure.type, selected.failure.message);
			}
			return ok({
				shell: selected.shell,
				script: renderCommandCdWrapperScript({ commandName: "ns" }),
			});
		},
		renderHuman: (result) => markerSurfaceShowResultSchema.parse(result).script,
	});
}

interface GitRepo {
	listBranches(): Promise<readonly string[]>;
	checkout(branch: string): Promise<void>;
}

// README-FENCE-9-START
import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

interface YourAppContext {
  readonly git: GitRepo;
}

export async function command() {
  return defineCommand({
    requiresContext: true,
		schema: z.object({ branch: z.string() }),
		resultSchema: z.object({ branch: z.string() }),
		completionProvider: async (context: YourAppContext, request) =>
			(await context.git.listBranches())
				.filter((branch) => branch.startsWith(request.current))
				.map((branch) => ({ value: branch, type: "positional-value" as const })),
		handler: async (context: YourAppContext, request) => {
			await context.git.checkout(request.branch);
			return ok({ branch: request.branch });
		},
  });
}
// README-FENCE-9-END

import { cliOption, cliPositional, defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

export const command = defineCommand({
// README-FENCE-3-START
schema: z.object({
  repository: cliPositional(z.string(), {
    position: 0,
    description: "Repository to inspect.",
  }),
  limit: cliOption(z.number().int().positive().default(20), {
    short: "-n",
    description: "Maximum results.",
  }),
  verbose: z.boolean().default(false), // automatically --verbose
}),
// README-FENCE-3-END
	resultSchema: z.object({ repository: z.string() }),
	handler: async (request) => ok({ repository: request.repository }),
});

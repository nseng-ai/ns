// README-FENCE-4-B1-START
// src/cli/contacts/find/command.ts
import { cliOption, cliPositional, defineCommand } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
// README-FENCE-4-B1-END
	// @ts-expect-error README fragment intentionally abbreviates required fields; see completeCommand.
// README-FENCE-4-B2-START
  return defineCommand({
    schema: z.object({
      name: cliPositional(z.string(), {
        position: 0,
        description: "Contact name.",
      }),
      includeArchived: cliOption(z.boolean().default(false), {
        short: "-a",
        description: "Include archived contacts.",
      }),
      limit: cliOption(z.number().int().positive().default(20), {
        short: "-n",
        description: "Maximum matches.",
      }),
    }),
    // result schema, handler, and renderers...
  });
}
// README-FENCE-4-B2-END

// Complete companion using the real API; the README excerpt above intentionally omits these fields.
export const completeCommand = defineCommand({
	schema: z.object({
		name: cliPositional(z.string(), { position: 0 }),
		includeArchived: cliOption(z.boolean().default(false), { short: "-a" }),
	}),
	resultSchema: z.object({ matches: z.array(z.string()) }),
	handler: async (request) => ({
		type: "ok" as const,
		data: { matches: request.includeArchived ? [request.name] : [] },
	}),
});

// src/cli/command.ts
import { cliOption, cliPositional, defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
  return defineCommand({
    schema: z.object({
      name: cliPositional(z.string(), {
        position: 0,
        description: "Person to greet.",
      }),
      enthusiastic: cliOption(z.boolean().default(false), {
        short: "-e",
        description: "Add emphasis.",
      }),
    }),
    resultSchema: z.object({ message: z.string() }),
    handler: async (request) =>
      ok({
        message: `Hello, ${request.name}${request.enthusiastic ? "!" : "."}`,
      }),
    renderHuman: (result) => result.message,
  });
}
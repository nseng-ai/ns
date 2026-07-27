// README-FENCE-8-B-START
// cli/issues/list/command.ts
import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
  return defineCommand({
    schema: z.object({}),
    resultSchema: z.object({ issues: z.array(z.string()) }),
    handler: async () => ok({ issues: ["Fix login"] }),
    renderHuman: (result) => result.issues.join("\n"),
  });
}
// README-FENCE-8-B-END

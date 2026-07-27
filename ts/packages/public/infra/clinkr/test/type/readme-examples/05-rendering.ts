// README-FENCE-5-START
import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
  return defineCommand({
    schema: z.object({}),
    resultSchema: z.object({ state: z.string() }),
    handler: async () => ok({ state: "ready" }),
    renderHuman: (result) => `State: ${result.state}`,
    renderMarkdown: (result) => `**State:** ${result.state}`,
  });
}
// README-FENCE-5-END

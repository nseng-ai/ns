import { z } from "zod";
import { ok } from "@nseng-ai/clinkr/app";

const contactSchema = z.object({ name: z.string() });

// README-FENCE-13-A-START
import { defineCommand } from "@nseng-ai/clinkr/app";

export async function command() {
// README-FENCE-13-A-END
	// @ts-expect-error README fragment intentionally abbreviates required fields; see completeCommand.
// README-FENCE-13-B-START
  return defineCommand({
    schema: z.object({ name: z.string() }),
    resultSchema: contactSchema,
    // handler and renderers...
  });
}
// README-FENCE-13-B-END

// Complete companion using the real API; the README excerpt above intentionally omits these fields.
export const completeCommand = defineCommand({
	schema: z.object({ name: z.string() }),
	resultSchema: contactSchema,
	handler: async (request) => ok({ name: request.name }),
});

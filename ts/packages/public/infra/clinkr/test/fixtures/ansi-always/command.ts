import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

export async function command() {
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		// Deliberately ignores canEmitAnsi: emits CSI styling and an OSC 8
		// hyperlink regardless of capabilities, to prove the framework-owned
		// output-boundary stripping rather than cooperative renderer behavior.
		renderHuman: (result) =>
			`\x1b[31m${result.value}\x1b[0m \x1b]8;;https://example.invalid\x07link\x1b]8;;\x07`,
		handler: async () => ok({ value: "styled" }),
	});
}

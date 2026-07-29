import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

interface ContactsContext {
	readonly contacts: {
		list(): Promise<readonly string[]>;
		add(): Promise<void>;
	};
}

export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: z.object({}),
		resultSchema: z.object({ contacts: z.array(z.string()) }),
		handler: async (context: ContactsContext) =>
			ok({ contacts: [...(await context.contacts.list())] }),
		renderHuman: (result) => result.contacts.join("\n"),
	});
}

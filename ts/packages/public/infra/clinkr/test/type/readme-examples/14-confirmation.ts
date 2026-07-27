import {
	confirmOrUsageError,
	defineCommand,
	ok,
	type ContextfulCommandDefinition,
} from "@nseng-ai/clinkr/app";
import type { ClinkrInteraction } from "@nseng-ai/clinkr";
import { z } from "zod";

interface Context {
	readonly interaction: ClinkrInteraction;
	readonly records: { delete(name: string): Promise<void> };
}

const schema = z.object({ name: z.string() });
const definition: ContextfulCommandDefinition<Context, typeof schema> = {
	requiresContext: true,
	schema,
// README-FENCE-14-START
handler: async (context, request) => {
	const confirmation = await confirmOrUsageError(context.interaction, {
		message: `Delete ${request.name}?`,
	});
	if (confirmation.status !== "confirmed") return confirmation;
	await context.records.delete(request.name);
	return ok();
},
// README-FENCE-14-END
};

export const command = defineCommand(definition);

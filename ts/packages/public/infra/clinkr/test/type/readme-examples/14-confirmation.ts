import {
	confirmInteractiveOrUsageError,
	defineCommand,
	ok,
	type ClinkrInteraction,
	type ContextfulCommandDefinition,
} from "@nseng-ai/clinkr";
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
	const confirmation = await confirmInteractiveOrUsageError(context.interaction, {
		message: `Delete ${request.name}?`,
	});
	if (confirmation.type !== "confirmed") return confirmation;
	await context.records.delete(request.name);
	return ok();
},
// README-FENCE-14-END
};

export const command = defineCommand(definition);

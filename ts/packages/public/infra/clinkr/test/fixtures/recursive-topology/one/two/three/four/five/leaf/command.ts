import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";
import { observations } from "../../../../../../observations.ts";
observations.definitions.push("leaf");
export async function command() {
	return defineCommand({ schema: z.object({}), handler: async () => ok() });
}

import { defineRawCommand } from "@nseng-ai/clinkr/raw";

import { loads } from "./loads.ts";

export async function command() {
	loads.commandCalls += 1;
	return defineRawCommand({
		run: ({ argv, io }) => {
			io.stdout(JSON.stringify([...argv]));
			return argv.length;
		},
	});
}

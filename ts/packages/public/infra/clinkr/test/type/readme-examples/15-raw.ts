// README-FENCE-15-START
import { defineRawCommand } from "@nseng-ai/clinkr/raw";

export async function command() {
	return defineRawCommand({
		run: ({ argv, output }) => {
			output.writeStdout(new TextEncoder().encode(argv.join("\0")));
			return 17;
		},
	});
}
// README-FENCE-15-END

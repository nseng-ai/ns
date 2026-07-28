import { defineRawCommand } from "@nseng-ai/clinkr/raw";

export interface RawFixtureContext {
	readonly prefix: string;
}

export async function command() {
	return defineRawCommand<RawFixtureContext>({
		requiresContext: true,
		run: ({ context, argv }) => {
			process.stdout.write(`${context.prefix}:${argv.join(",")}`);
			return 0;
		},
	});
}

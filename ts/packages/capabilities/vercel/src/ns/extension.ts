import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: "dispatch",
	description: "Run ns work in Vercel Sandbox and inspect its git-native results.",
	entries: [
		{
			name: "prompt",
			load: async () => ({ default: (await import("./commands/prompt.ts")).dispatchPromptCommand }),
		},
	],
});

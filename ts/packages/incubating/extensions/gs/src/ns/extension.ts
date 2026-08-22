import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Inspect authoritative local-only gh-stack state.",
	commandDirectory: `${import.meta.dirname}/cli`,
});

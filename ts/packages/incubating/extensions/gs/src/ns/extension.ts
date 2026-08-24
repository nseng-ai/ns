import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Inspect and maintain authoritative local gh-stack state.",
	commandDirectory: `${import.meta.dirname}/cli`,
});

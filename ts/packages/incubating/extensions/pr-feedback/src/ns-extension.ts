import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Inspect and address GitHub pull request feedback.",
	commandDirectory: `${import.meta.dirname}/ns/cli`,
});

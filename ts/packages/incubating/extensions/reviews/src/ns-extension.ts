import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Run configured code reviews and publish findings.",
	commandDirectory: `${import.meta.dirname}/ns/cli`,
});

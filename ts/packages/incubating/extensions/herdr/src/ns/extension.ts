import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Run Herdr destination workflows.",
	commandDirectory: `${import.meta.dirname}/cli`,
});

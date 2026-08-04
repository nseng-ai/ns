import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Create, list, pick up, and clean up branch handoffs.",
	commandDirectory: `${import.meta.dirname}/cli`,
});

import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Inspect official GitHub gh-stack provider inventory.",
	commandDirectory: `${import.meta.dirname}/cli`,
});

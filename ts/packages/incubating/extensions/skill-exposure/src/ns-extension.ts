import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Inspect and reconcile repository skill exposure overlays.",
	commandDirectory: `${import.meta.dirname}/ns/cli`,
});

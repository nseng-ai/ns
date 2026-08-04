import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Manage the NS worktree slot pool.",
	commandDirectory: `${import.meta.dirname}/cli`,
});

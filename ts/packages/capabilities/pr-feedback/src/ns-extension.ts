import { defineExtension } from "@nseng-ai/kernel/sdk";

import { EXEC_OPERATIONS } from "./exec-commands.ts";

export default defineExtension({
	group: "address",
	description: "Inspect and address GitHub pull request feedback.",
	entries: EXEC_OPERATIONS.map((operation) => ({
		name: operation.name,
		load: async () => ({
			default: (await import("./ns-command.ts")).prAddressNsCommand(operation.name),
		}),
	})),
});

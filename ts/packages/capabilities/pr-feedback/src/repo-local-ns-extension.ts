import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { EXEC_OPERATIONS } from "./exec-commands.ts";
import { prAddressNsCommand } from "./ns-command.ts";

export const addressRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "address",
	description: "Inspect and address GitHub pull request feedback.",
	commands: EXEC_OPERATIONS.map((operation) =>
		repoLocalNsCommandDescriptor({
			command: prAddressNsCommand(operation.name),
			packageExportPrefix: "@nseng-ai/pr-feedback/ns/commands",
		}),
	),
});

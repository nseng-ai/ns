import {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "@ns/kernel/sdk";

import { EXEC_OPERATIONS } from "./exec-commands.ts";
import { prAddressSdlCommand } from "./ns-command.ts";

export const addressRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "address",
	description: "Inspect and address GitHub pull request feedback.",
	commands: EXEC_OPERATIONS.map((operation) =>
		repoLocalSdlCommandDescriptor({
			command: prAddressSdlCommand(operation.name),
			packageExportPrefix: "@ns/address/ns/commands",
		}),
	),
});

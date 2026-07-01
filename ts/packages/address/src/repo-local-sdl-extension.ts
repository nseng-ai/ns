import { defineRepoLocalSdlExtensionDescriptor } from "sdl-sdk";

import { EXEC_OPERATIONS } from "./exec-commands.ts";
import { prAddressSdlCommand } from "./sdl-command.ts";

export const addressRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "address",
	description: "Inspect and address GitHub pull request feedback.",
	commands: EXEC_OPERATIONS.map((operation) => {
		const command = prAddressSdlCommand(operation.name);
		return {
			command,
			manifestEntry: `./src/commands/${command.name}.ts`,
			packageExport: `@sdl/address/sdl/commands/${command.name}`,
		};
	}),
});

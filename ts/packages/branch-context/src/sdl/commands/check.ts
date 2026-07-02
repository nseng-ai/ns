import { defineExtension } from "@sdl/kernel/sdk";

import { branchContextCommand } from "../command.ts";
import { checkResultSchema, handleCheck, keyRequestSchema } from "../../operations.ts";

export const branchContextCheckSdlCommand = branchContextCommand({
	name: "check",
	summary: "Check a branch-context entry.",
	description: "Check whether a branch-context entry exists on the current or selected branch.",
	schema: keyRequestSchema,
	resultSchema: checkResultSchema,
	positionals: { key: { position: 0 } },
	handler: handleCheck,
});

export default defineExtension({
	commands: [branchContextCheckSdlCommand],
});

import { branchContextCommand } from "../command.ts";
import { attachRequestSchema, attachResultSchema, handleAttach } from "../../operations.ts";

export const branchContextAttachSdlCommand = branchContextCommand({
	name: "attach",
	summary: "Attach a saved plan or file as branch context.",
	description:
		"Attach a saved plan or arbitrary file to the current or selected branch context namespace.",
	schema: attachRequestSchema,
	resultSchema: attachResultSchema,
	positionals: { key: { position: 0 } },
	handler: handleAttach,
});

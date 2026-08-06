import { branchContextCommand } from "../command.ts";
import { deleteResultSchema, handleDelete, keyRequestSchema } from "../../core/operations.ts";

export const branchContextDeleteNsCommand = branchContextCommand({
	name: "delete",
	summary: "Delete a branch-context entry.",
	description: "Delete a branch-context entry from the current or selected branch.",
	schema: keyRequestSchema,
	resultSchema: deleteResultSchema,
	positionals: { key: { position: 0 } },
	renderHuman: (result) => JSON.stringify(result, null, 2),
	handler: handleDelete,
});

export default branchContextDeleteNsCommand;

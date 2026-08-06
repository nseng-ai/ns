import { branchContextCommand } from "../command.ts";
import { handleList, listRequestSchema, listResultSchema } from "../../core/operations.ts";

export const branchContextListNsCommand = branchContextCommand({
	name: "list",
	summary: "List branch-context entries.",
	description: "List branch-context entries attached to the current or selected branch.",
	schema: listRequestSchema,
	resultSchema: listResultSchema,
	renderHuman: (result) => JSON.stringify(result, null, 2),
	handler: handleList,
});

export default branchContextListNsCommand;

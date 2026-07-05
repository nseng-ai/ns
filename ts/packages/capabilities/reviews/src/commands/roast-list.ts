import { defineExtension } from "@nseng-ai/kernel/sdk";

import {
	renderRoastSkillList,
	roastSkillListRequestSchema,
	roastSkillListResultSchema,
	runRoastSkillList,
	type RoastSkillListRequest,
} from "../operations/cli-operations.ts";
import { roasterNsCommand } from "../ns/command.ts";

const ROAST_LIST_DESCRIPTION = `List Roaster review-skill command entries generated from review definitions.`;

export const roasterRoastListCommand = roasterNsCommand({
	name: "list",
	summary: "List Roaster review-skill commands.",
	description: ROAST_LIST_DESCRIPTION,
	schema: roastSkillListRequestSchema,
	resultSchema: roastSkillListResultSchema,
	renderHuman: (data, _caps) => renderRoastSkillList(data),
	async handler(runtime, request) {
		return await runRoastSkillList(runtime, request);
	},
});

export default defineExtension({
	commands: [roasterRoastListCommand],
});

export type RoasterRoastListRequest = RoastSkillListRequest;

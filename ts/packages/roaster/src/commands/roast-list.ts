import { failure, ok } from "@sdl/clinkr";
import { createSdlDomainCommand } from "@sdl/capability-kit/sdl-command";
import { defineExtension } from "sdl-sdk";

import { createRoasterClient } from "../api.ts";
import {
	renderRoastSkillList,
	roastSkillListRequestSchema,
	roastSkillListResultSchema,
	type RoastSkillListRequest,
} from "../operations/cli-operations.ts";
import { createSdlRoasterRuntime } from "./sdl-runtime.ts";

const ROAST_LIST_DESCRIPTION = `List Roaster review-skill command entries generated from review definitions.`;

export const roasterRoastListCommand = createSdlDomainCommand({
	name: "list",
	summary: "List Roaster review-skill commands.",
	description: ROAST_LIST_DESCRIPTION,
	schema: roastSkillListRequestSchema,
	resultSchema: roastSkillListResultSchema,
	renderHuman: (data, _caps) => renderRoastSkillList(data),
	createContext: createSdlRoasterRuntime,
	async handler(runtime, request) {
		const result = await createRoasterClient({
			cwd: runtime.runScope.cwd,
			env: runtime.runScope.env,
			runtime,
		}).listRoastSkills(request);
		if (!result.ok) return failure(result.failure.errorType, result.failure.message);
		return ok(result.result);
	},
});

export default defineExtension({
	commands: [roasterRoastListCommand],
});

export type RoasterRoastListRequest = RoastSkillListRequest;

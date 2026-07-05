import { resolveRenderCapabilities } from "@nseng-ai/clinkr";
import { defineExtension } from "@nseng-ai/kernel/sdk";

import { objectiveNsCommand } from "../command.ts";
import {
	renderShowObjectiveHuman,
	renderShowObjectiveMarkdown,
	runShowObjective,
	showObjectiveRequestSchema,
	showObjectiveResultSchema,
} from "../../core/operations/show-objective.ts";

export const objectiveShowNsCommand = objectiveNsCommand({
	name: "show",
	summary: "Show one Objective record with branches and edge annotations.",
	description: "Show one Objective record with branches and edge annotations.",
	schema: showObjectiveRequestSchema,
	resultSchema: showObjectiveResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runShowObjective,
	renderHuman: (data, caps) =>
		renderShowObjectiveHuman(data, resolveRenderCapabilities(caps), Date.now()),
	renderMarkdown: renderShowObjectiveMarkdown,
});

export default defineExtension({
	commands: [objectiveShowNsCommand],
});

// @ts-nocheck -- temporary descriptor-framework compatibility retained only for the additive filesystem cutover.
import { objectiveNsCommand } from "../command.ts";
import {
	readObjectiveRequestSchema,
	readObjectiveResultSchema,
	renderReadObjective,
	runReadObjective,
} from "../../core/operations/read-objective.ts";

export const objectiveExecReadObjectiveNsCommand = objectiveNsCommand({
	name: "read-objective",
	summary: "Read one Objective record by explicit slug as filesystem facts or raw Markdown.",
	description: "Read one Objective record by explicit slug as filesystem facts or raw Markdown.",
	schema: readObjectiveRequestSchema,
	resultSchema: readObjectiveResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runReadObjective,
	renderHuman: renderReadObjective,
	renderMarkdown: renderReadObjective,
});

export default objectiveExecReadObjectiveNsCommand;

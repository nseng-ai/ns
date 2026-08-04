// @ts-nocheck -- temporary descriptor-framework compatibility retained only for the additive filesystem cutover.
import { objectiveNsCommand } from "../command.ts";
import {
	renderStalenessCheck,
	runStalenessCheck,
	stalenessCheckRequestSchema,
	stalenessCheckResultSchema,
} from "../../core/operations/staleness-check.ts";

export const objectiveExecStalenessCheckNsCommand = objectiveNsCommand({
	name: "staleness-check",
	summary: "Collect deterministic Objective staleness evidence for one slug.",
	description: "Collect deterministic Objective staleness evidence for one slug.",
	schema: stalenessCheckRequestSchema,
	resultSchema: stalenessCheckResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runStalenessCheck,
	renderHuman: renderStalenessCheck,
	renderMarkdown: renderStalenessCheck,
});

export default objectiveExecStalenessCheckNsCommand;

import {
	renderStalenessCheck,
	runStalenessCheck,
	stalenessCheckRequestSchema,
	stalenessCheckResultSchema,
} from "../../../../core/operations/staleness-check.ts";
import { objectiveNsCommand } from "../../../../ns/objective-command.ts";

export async function command() {
	return objectiveNsCommand({
		schema: stalenessCheckRequestSchema,
		resultSchema: stalenessCheckResultSchema,
		positionals: { slug: { position: 0 } },
		handler: runStalenessCheck,
		renderHuman: renderStalenessCheck,
		renderMarkdown: renderStalenessCheck,
	});
}

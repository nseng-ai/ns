import { handoffNsCommand } from "../command.ts";
import {
	createRequestSchema,
	createResultSchema,
	renderCreate,
	runCreate,
} from "../../core/operations/create.ts";

export const handoffCreateNsCommand = handoffNsCommand({
	name: "create",
	summary: "Create a handoff from final Markdown.",
	description: "Create one handoff artifact from final Markdown supplied on stdin or with --file.",
	schema: createRequestSchema,
	options: { slug: { short: "-s" }, branch: { short: "-b" }, file: { short: "-i" } },
	resultSchema: createResultSchema,
	handler: runCreate,
	renderHuman: renderCreate,
});

export default handoffCreateNsCommand;

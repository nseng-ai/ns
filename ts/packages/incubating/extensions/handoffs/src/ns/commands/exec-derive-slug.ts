import {
	deriveSlugRequestSchema,
	deriveSlugResultSchema,
	renderDeriveSlug,
	runDeriveSlug,
} from "../../core/operations/derive-slug.ts";
import { handoffNsCommand } from "../command.ts";

export const handoffExecDeriveSlugNsCommand = handoffNsCommand({
	name: "derive-slug",
	summary: "Derive a handoff slug from final Markdown.",
	description:
		"Derive a semantic Handoff slug from final Markdown supplied on stdin or with --file.",
	schema: deriveSlugRequestSchema,
	options: { file: { short: "-i" } },
	resultSchema: deriveSlugResultSchema,
	handler: runDeriveSlug,
	renderHuman: renderDeriveSlug,
});

export default handoffExecDeriveSlugNsCommand;

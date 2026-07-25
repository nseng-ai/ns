import { handoffNsCommand } from "../command.ts";
import {
	matchRequestSchema,
	matchResultSchema,
	renderMatch,
	runMatch,
} from "../../core/operations/match.ts";

export const handoffExecMatchNsCommand = handoffNsCommand({
	name: "match",
	summary: "Deterministically resolve a handoff selector against stored handoffs.",
	description:
		"Resolve a selector (exact key, slug, or search terms) against stored handoff slugs using the handoff-pickup selection ladder. Read-only.",
	schema: matchRequestSchema,
	options: { branch: { short: "-b" } },
	resultSchema: matchResultSchema,
	positionals: { selector: { position: 0 } },
	handler: runMatch,
	renderHuman: renderMatch,
});

export default handoffExecMatchNsCommand;

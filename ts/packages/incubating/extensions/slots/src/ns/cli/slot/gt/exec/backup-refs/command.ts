import { defineCommand } from "@nseng-ai/sdk";

import {
	gtBackupRefsRequestSchema,
	gtBackupRefsResultSchema,
	renderBackupRefs,
	runGtBackupRefs,
} from "../../../../../../lifecycle/operations/gt/exec/backup-refs.ts";
import { createSlotCliContext } from "../../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "backup-refs",
		summary: "Create timestamped local backup refs for branches before destructive stack surgery.",
		description:
			"Create timestamped local backup refs for branches before destructive stack surgery.",
		schema: gtBackupRefsRequestSchema,
		resultSchema: gtBackupRefsResultSchema,
		handler: async (ctx, request) => runGtBackupRefs(await createSlotCliContext(ctx), request),
		renderHuman: renderBackupRefs,
	});
}

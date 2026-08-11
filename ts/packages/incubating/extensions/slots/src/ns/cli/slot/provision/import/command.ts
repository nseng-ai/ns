import { defineCommand } from "@nseng-ai/sdk";

import {
	provisionImportRequestSchema,
	provisionImportResultSchema,
	renderProvisionImport,
	runProvisionImport,
} from "../../../../../lifecycle/operations/provision/import.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "import",
		summary: "Copy declared provisioned files from the current worktree into the store.",
		description:
			"Copy declared [slots] provision files from the current worktree into the per-repo provision store. With no PATHS, imports every declared file present in the worktree.",
		schema: provisionImportRequestSchema,
		positionals: { paths: { position: 0 } },
		resultSchema: provisionImportResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runProvisionImport(await createSlotCliContext(ctx), request)),
		renderHuman: renderProvisionImport,
	});
}

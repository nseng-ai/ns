import { defineCommand } from "@nseng-ai/sdk";

import { provisionApplyOptionSpecs } from "../../../../../core/command-options.ts";
import {
	provisionApplyRequestSchema,
	provisionApplyResultSchema,
	renderProvisionApply,
	runProvisionApply,
} from "../../../../../lifecycle/operations/provision/apply.ts";
import { createSlotCliContext } from "../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "apply",
		summary: "Fill missing provisioned files in all managed slots from the store.",
		description:
			"Copy declared [slots] provision files from the per-repo store into every managed slot worktree where they are missing. Reports copies that differ from the store; --force overwrites them.",
		schema: provisionApplyRequestSchema,
		options: provisionApplyOptionSpecs,
		resultSchema: provisionApplyResultSchema,
		handler: async (ctx, request) => runProvisionApply(await createSlotCliContext(ctx), request),
		renderHuman: renderProvisionApply,
	});
}

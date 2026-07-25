import { checkHandoffArtifact, handoffKeyToSlug } from "../api/index.ts";
import { createPiHandoffStorageDeps } from "./api-context.ts";
import type { CommandExecApi } from "@nseng-ai/foundation/command";

export type HandoffExistsResult =
	| { type: "exists" }
	| { type: "missing" }
	| { type: "failed"; message: string };

export interface CheckHandoffExistsOptions {
	commands: CommandExecApi;
	cwd: string;
	branch: string;
	key: string;
}

export async function checkHandoffExists(
	options: CheckHandoffExistsOptions,
): Promise<HandoffExistsResult> {
	const result = await checkHandoffArtifact(
		createPiHandoffStorageDeps(options.commands, options.cwd),
		{
			branch: options.branch,
			slug: handoffKeyToSlug(options.key),
		},
	);
	if (result.type === "error") {
		return { type: "failed", message: result.error.message };
	}
	return result.value.exists ? { type: "exists" } : { type: "missing" };
}

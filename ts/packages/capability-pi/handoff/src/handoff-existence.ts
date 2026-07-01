import { checkHandoffArtifact, handoffKeyToSlug } from "@sdl/handoff/api";
import { createPiHandoffStorageDeps } from "./api-context.ts";
import type { ExtensionAPI } from "./runtime-types.ts";

export type HandoffExistsResult =
	| { type: "exists" }
	| { type: "missing" }
	| { type: "failed"; message: string };

export interface CheckHandoffExistsOptions {
	pi: ExtensionAPI;
	cwd: string;
	branch: string;
	key: string;
}

export async function checkHandoffExists(
	options: CheckHandoffExistsOptions,
): Promise<HandoffExistsResult> {
	const result = await checkHandoffArtifact(createPiHandoffStorageDeps(options.pi, options.cwd), {
		branch: options.branch,
		slug: handoffKeyToSlug(options.key),
	});
	if (result.type === "error") {
		return { type: "failed", message: result.error.message };
	}
	return result.value.exists ? { type: "exists" } : { type: "missing" };
}

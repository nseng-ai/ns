import { checkHandoffArtifact, handoffKeyToSlug } from "@sdl/handoff/api";
import { createPiHandoffStorageDeps } from "./api-context.ts";
import type { ExtensionAPI } from "./runtime-types.ts";

export type HandoffExistsResult =
	| { type: "exists" }
	| { type: "missing" }
	| { type: "failed"; message: string };

export async function checkHandoffExists(
	pi: ExtensionAPI,
	cwd: string,
	branch: string,
	key: string,
): Promise<HandoffExistsResult> {
	const result = await checkHandoffArtifact(createPiHandoffStorageDeps(pi, cwd), {
		branch,
		slug: handoffKeyToSlug(key),
	});
	if (result.type === "error") {
		return { type: "failed", message: result.error.message };
	}
	return result.value.exists ? { type: "exists" } : { type: "missing" };
}

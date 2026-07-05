import type { SkillMaterializer, SkillMaterializeResult } from "./skill-materializer.ts";

/**
 * Stub real implementation. Objective skill directories ship inside the published
 * `@nseng-ai/ns` bundle, which `checkout-free-sdl-distribution` has not published yet, so
 * there is nothing on disk to copy into harness roots. Replace with the
 * skill-management-subsystem copy-into-harness-roots operation once the bundle lands.
 */
export const pendingBundleSkillMaterializer: SkillMaterializer = {
	async materializeObjectiveSkills(): Promise<SkillMaterializeResult> {
		return {
			type: "unavailable",
			reason:
				"Objective skill install is pending the checkout-free @nseng-ai/ns bundle; no bundled skill directories exist to copy yet.",
		};
	},
};

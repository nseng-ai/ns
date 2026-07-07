import type { HarnessId } from "@nseng-ai/harness-artifacts/api";

import type { NsInitErrorInfo } from "./error-info.ts";

export interface SkillMaterializeParams {
	repoRoot: string;
	harnesses: readonly HarnessId[];
}

export type SkillMaterializeResult =
	| { type: "materialized"; installedSkillPaths: readonly string[] }
	| { type: "unavailable"; reason: string }
	| { type: "error"; error: NsInitErrorInfo };

export interface SkillMaterializer {
	materializeObjectiveSkills(params: SkillMaterializeParams): Promise<SkillMaterializeResult>;
}

import type { NsInitErrorInfo } from "./error-info.ts";

export type HarnessId = "claude-code" | "codex" | "pi";

export const ALL_HARNESS_IDS = [
	"claude-code",
	"codex",
	"pi",
] as const satisfies readonly HarnessId[];

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

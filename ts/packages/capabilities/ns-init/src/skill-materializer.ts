export type HarnessId = "claude-code" | "codex" | "pi";

export const ALL_HARNESS_IDS = [
	"claude-code",
	"codex",
	"pi",
] as const satisfies readonly HarnessId[];

export interface SkillMaterializerErrorInfo {
	code: string;
	message: string;
}

export interface SkillMaterializeParams {
	repoRoot: string;
	harnesses: readonly HarnessId[];
}

export type SkillMaterializeResult =
	| { type: "materialized"; installedSkillPaths: readonly string[] }
	| { type: "unavailable"; reason: string }
	| { type: "error"; error: SkillMaterializerErrorInfo };

export interface SkillMaterializer {
	materializeObjectiveSkills(params: SkillMaterializeParams): Promise<SkillMaterializeResult>;
}

import type { AregSkillKindResolveResult, AregSkillKindSkillInspection } from "../gateways.ts";
import { errorInfo } from "./errors.ts";

export function classifyResolvedSkillKindInspection(options: {
	spec: string;
	skillName: string;
	inspection: AregSkillKindSkillInspection;
}): AregSkillKindResolveResult {
	if (options.inspection.skillDir.type === "symlink")
		return {
			type: "error",
			error: errorInfo(
				"skill-kind-symlink-skill-dir",
				`${options.inspection.baseRelativePath} is a symlink; refusing to manage invocation metadata`,
			),
		};
	if (options.inspection.skillDir.type !== "directory")
		return {
			type: "error",
			error: errorInfo("skill-kind-missing-skill", `Managed skill not found: ${options.spec}`),
		};
	if (options.inspection.skillMd.type === "symlink")
		return {
			type: "error",
			error: errorInfo(
				"skill-kind-symlink-skill-md",
				`${options.inspection.baseRelativePath}/SKILL.md is a symlink; refusing to manage invocation metadata`,
			),
		};
	if (options.inspection.skillMd.type !== "file")
		return {
			type: "error",
			error: errorInfo(
				"skill-kind-missing-skill-md",
				`${options.inspection.baseRelativePath}/SKILL.md does not exist`,
			),
		};
	return { type: "ok", skillName: options.skillName };
}

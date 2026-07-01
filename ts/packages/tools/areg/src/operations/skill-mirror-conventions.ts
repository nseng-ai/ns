import type { AregPathState } from "../gateways.ts";

export function expectedAgentsSkillSymlinkTarget(skillName: string): string {
	return `../../skills/${skillName}`;
}

export function expectedClaudeSkillSymlinkTarget(skillName: string): string {
	return `../../.agents/skills/${skillName}`;
}

export function isAgentsSkillMirror(pathState: AregPathState, skillName: string): boolean {
	return (
		pathState.type === "symlink" && pathState.target === expectedAgentsSkillSymlinkTarget(skillName)
	);
}

export function isClaudeSkillMirror(pathState: AregPathState, skillName: string): boolean {
	return (
		pathState.type === "symlink" && pathState.target === expectedClaudeSkillSymlinkTarget(skillName)
	);
}

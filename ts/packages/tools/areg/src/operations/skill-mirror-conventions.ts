import type { AregErrorInfo, AregPathState } from "../gateways.ts";

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

export function agentsSkillMirrorRelativePath(skillName: string): string {
	return `.agents/skills/${skillName}`;
}

export function claudeSkillMirrorRelativePath(skillName: string): string {
	return `.claude/skills/${skillName}`;
}

/**
 * Returns true when the relative path is exactly an areg-managed skill mirror
 * location: `.agents/skills/<name>` or `.claude/skills/<name>` with a plain
 * single-segment skill name.
 */
export function isSkillMirrorRelativePath(relativePath: string): boolean {
	return expectedMirrorTarget(relativePath) !== undefined;
}

/**
 * Returns the convention symlink target for a skill mirror relative path, or
 * undefined when the path is not a valid skill mirror location.
 */
export function expectedMirrorTarget(relativePath: string): string | undefined {
	const parts = relativePath.split("/");
	if (parts.length !== 3 || parts[1] !== "skills") return undefined;
	const skillName = parts[2];
	if (skillName === undefined || !isPlainSkillNameSegment(skillName)) return undefined;
	if (parts[0] === ".agents") return expectedAgentsSkillSymlinkTarget(skillName);
	if (parts[0] === ".claude") return expectedClaudeSkillSymlinkTarget(skillName);
	return undefined;
}

/**
 * Classifies a skill-mirror symlink deletion target against the delete contract,
 * returning the matching error or undefined when the target is a deletable
 * convention symlink. An undefined `state` is treated as missing so fixture-backed
 * callers share the same cascade as filesystem inspection.
 */
export function classifySkillMirrorSymlinkState(
	relativePath: string,
	state: AregPathState | undefined,
	description: string,
	target: string,
): AregErrorInfo | undefined {
	const expectedTarget = expectedMirrorTarget(relativePath);
	if (expectedTarget === undefined)
		return {
			code: "skill-kind-delete-symlink-refused",
			message: `Refusing to delete ${description}: ${relativePath} is not a managed skill mirror path.`,
		};
	if (state === undefined || state.type === "missing")
		return {
			code: "skill-kind-delete-symlink-missing",
			message: `${description} at ${target} does not exist.`,
		};
	if (state.type !== "symlink")
		return {
			code: "skill-kind-delete-symlink-not-symlink",
			message: `${description} at ${target} is not a symlink; refusing to delete it.`,
		};
	if (state.target !== expectedTarget)
		return {
			code: "skill-kind-delete-symlink-wrong-target",
			message: `${description} at ${target} points to ${state.target}, expected ${expectedTarget}; refusing to delete it.`,
		};
	return undefined;
}

function isPlainSkillNameSegment(segment: string): boolean {
	return (
		segment.length > 0 &&
		segment !== "." &&
		segment !== ".." &&
		!segment.includes("/") &&
		!segment.includes("\\")
	);
}

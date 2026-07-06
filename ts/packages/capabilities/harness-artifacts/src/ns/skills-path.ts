import { ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import { findFirstPartySkillArtifact, resolveHarnessArtifactPath } from "../api.ts";
import {
	harnessPathErrorExit,
	harnessResolutionContext,
	unknownSkillExit,
	type SkillsCommandContext,
} from "./skills-shared.ts";

export const skillsPathRequestSchema = z.object({
	skill: z.string().min(1),
	harness: z.string().min(1),
	scope: z.enum(["user", "project"]).default("project"),
});

export const skillsPathResultSchema = z.object({
	skill: z.string(),
	artifactId: z.string(),
	harness: z.enum(["claude-code", "codex", "pi"]),
	scope: z.enum(["user", "project"]),
	targetRoot: z.string(),
	targetArtifactPath: z.string(),
});
export type SkillsPathResult = z.infer<typeof skillsPathResultSchema>;

export function runSkillsPath(
	context: SkillsCommandContext,
	request: z.output<typeof skillsPathRequestSchema>,
): ClinkrExit<SkillsPathResult> {
	const artifact = findFirstPartySkillArtifact(request.skill);
	if (artifact === undefined) return unknownSkillExit(request.skill);
	const resolvedPath = resolveHarnessArtifactPath({
		harness: request.harness,
		scope: request.scope,
		kind: artifact.kind,
		artifactName: artifact.skillName,
		context: harnessResolutionContext(context),
	});
	if (!resolvedPath.ok) return harnessPathErrorExit(resolvedPath.error);
	return ok({
		skill: artifact.skillName,
		artifactId: artifact.id,
		harness: resolvedPath.value.harness,
		scope: resolvedPath.value.scope,
		targetRoot: resolvedPath.value.rootPath,
		targetArtifactPath: resolvedPath.value.artifactPath,
	});
}

export function renderSkillsPathHuman(result: SkillsPathResult): string {
	return [
		`skill: ${result.skill}`,
		`artifact: ${result.artifactId}`,
		`harness: ${result.harness}`,
		`scope: ${result.scope}`,
		`target root: ${result.targetRoot}`,
		`target path: ${result.targetArtifactPath}`,
		"",
	].join("\n");
}

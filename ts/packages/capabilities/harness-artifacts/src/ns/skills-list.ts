import { ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import { listFirstPartySkillArtifacts } from "../api.ts";

export const skillsListRequestSchema = z.object({});

export const skillsListResultSchema = z.object({
	catalogId: z.string(),
	skills: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			description: z.string(),
			skillName: z.string(),
			sourcePackage: z.string(),
			sourceRelativePath: z.string(),
		}),
	),
});
export type SkillsListResult = z.infer<typeof skillsListResultSchema>;

export function runSkillsList(): ClinkrExit<SkillsListResult> {
	return ok({
		catalogId: "ns-first-party",
		skills: listFirstPartySkillArtifacts().map((artifact) => ({
			id: artifact.id,
			name: artifact.name,
			description: artifact.description,
			skillName: artifact.skillName,
			sourcePackage: artifact.source.packageName,
			sourceRelativePath: artifact.source.relativePath,
		})),
	});
}

export function renderSkillsListHuman(result: SkillsListResult): string {
	const lines = [`ns first-party skills (${result.catalogId})`];
	for (const skill of result.skills) {
		lines.push(`- ${skill.skillName} (${skill.id}) — ${skill.description}`);
	}
	return `${lines.join("\n")}\n`;
}

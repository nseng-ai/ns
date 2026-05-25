import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

export type SkillCommandInfo = {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		baseDir?: string;
	};
};

export type SkillExpansionHost = {
	getCommands(): readonly SkillCommandInfo[];
};

export type ExpandedSkillBlock = {
	name: string;
	commandName: string;
	path: string;
	baseDir: string;
	body: string;
	block: string;
};

export type SkillExpansionOptions = {
	readTextFile?: (path: string) => Promise<string>;
};

function stripSkillFrontmatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

export async function expandSkillBlock(
	host: SkillExpansionHost,
	skillName: string,
	options: SkillExpansionOptions = {},
): Promise<ExpandedSkillBlock | undefined> {
	const command = host
		.getCommands()
		.find((candidate) => candidate.source === "skill" && candidate.name === `skill:${skillName}`);
	if (!command) {
		return undefined;
	}

	const skillPath = command.sourceInfo.path;
	const baseDir = command.sourceInfo.baseDir ?? dirname(skillPath);
	const readTextFile = options.readTextFile ?? ((path: string) => readFile(path, "utf8"));
	const body = stripSkillFrontmatter(await readTextFile(skillPath));

	return {
		name: skillName,
		commandName: command.name,
		path: skillPath,
		baseDir,
		body,
		block: `<skill name="${skillName}" location="${skillPath}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`,
	};
}

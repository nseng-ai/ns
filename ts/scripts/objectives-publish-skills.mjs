import { cp, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export const objectiveSkillNames = [
	"objective",
	"objective-autorun",
	"objective-close",
	"objective-create",
	"objective-critique",
	"objective-next",
	"objective-refresh",
	"objective-retro",
	"objective-runner-step",
	"objective-update",
];

export async function copyObjectivesPublishSkills(options) {
	const sourceSkillsRoot = resolve(options.repoRoot, "skills");
	const publishSkillsRoot = resolve(options.publishRoot, "skills");
	const sourceSkillNames = await objectiveSkillDirectoryNames(sourceSkillsRoot);
	assertExactSkillNames(sourceSkillNames, "canonical repository");

	for (const skillName of objectiveSkillNames) {
		const sourceRoot = resolve(sourceSkillsRoot, skillName);
		const destinationRoot = resolve(publishSkillsRoot, skillName);
		await assertSkillEntry(sourceRoot, skillName, "canonical repository");
		await cp(sourceRoot, destinationRoot, { recursive: true });
	}

	const publishedSkillNames = await objectiveSkillDirectoryNames(publishSkillsRoot);
	assertExactSkillNames(publishedSkillNames, "generated Objectives package");
	for (const skillName of objectiveSkillNames) {
		await assertSkillEntry(
			resolve(publishSkillsRoot, skillName),
			skillName,
			"generated Objectives package",
		);
	}
}

async function objectiveSkillDirectoryNames(root) {
	const entries = await readdir(root, { withFileTypes: true });
	return entries
		.filter(
			(entry) =>
				entry.isDirectory() &&
				(entry.name === "objective" || entry.name.startsWith("objective-")),
		)
		.map((entry) => entry.name)
		.sort();
}

async function assertSkillEntry(root, skillName, label) {
	const skillEntry = await readFile(resolve(root, "SKILL.md"), "utf8");
	if (!skillEntry.startsWith("---\n") || !skillEntry.includes(`\nname: ${skillName}\n`)) {
		throw new Error(
			`${label} skill ${skillName} must contain SKILL.md frontmatter with its canonical name.`,
		);
	}
}

function assertExactSkillNames(actual, label) {
	const expected = [...objectiveSkillNames].sort();
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`${label} Objective skill set mismatch. Expected ${expected.join(", ")}; got ${actual.join(", ")}.`,
		);
	}
}

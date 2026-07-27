import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
const objectiveSkillsRoot = join(repositoryRoot, "skills/incubating/objectives");
const portableSkillNames = [
	"objective",
	"objective-create",
	"objective-list",
	"objective-next",
	"objective-update",
	"objective-refresh",
	"objective-close",
] as const;
const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function createObjective(
	root: string,
	slug: string,
	options: { blocked?: string; closed?: boolean; nestedClosed?: boolean } = {},
): Promise<void> {
	const recordRoot = join(root, ".ns/objectives", slug);
	await mkdir(join(recordRoot, "updates"), { recursive: true });
	const frontmatter =
		options.blocked === undefined ? "" : `---\nblocked: ${options.blocked}\nedges: []\n---\n`;
	await writeFile(join(recordRoot, "objective.md"), `${frontmatter}# ${slug}\n`, "utf8");
	if (options.closed === true) await writeFile(join(recordRoot, "closed.md"), "Closed.\n", "utf8");
	if (options.nestedClosed === true) {
		await writeFile(join(recordRoot, "updates/closed.md"), "Not a closure marker.\n", "utf8");
	}
}

describe("portable Objective skills", () => {
	test("keeps exactly seven ordinary portable skills and retires objective-critique", async () => {
		const entries = await readdir(objectiveSkillsRoot, { withFileTypes: true });
		const ordinarySkills = entries
			.filter(
				(entry) =>
					entry.isDirectory() &&
					!["objective-autorun", "objective-runner-step"].includes(entry.name),
			)
			.map((entry) => entry.name)
			.sort();

		expect(ordinarySkills).toEqual([...portableSkillNames].sort());
		for (const skillName of portableSkillNames) {
			const content = await readFile(join(objectiveSkillsRoot, skillName, "SKILL.md"), "utf8");
			expect(content).toContain(`name: ${skillName}`);
		}
	});

	test("lists direct open records without an Objective CLI", async () => {
		const root = await mkdtemp(join(tmpdir(), "portable-objective-list-"));
		temporaryRoots.push(root);
		await createObjective(root, "zulu-open");
		await createObjective(root, "alpha-blocked", { blocked: "Waiting for an external decision." });
		await createObjective(root, "closed-record", { closed: true });
		await createObjective(root, "nested-marker", { nestedClosed: true });
		await mkdir(join(root, ".ns/objectives/not-a-record/child"), { recursive: true });
		await writeFile(
			join(root, ".ns/objectives/not-a-record/child/objective.md"),
			"# Nested\n",
			"utf8",
		);

		const script = join(objectiveSkillsRoot, "objective-list/scripts/list-objectives.mjs");
		const { stdout, stderr } = await execFileAsync(process.execPath, [script], {
			cwd: root,
			env: { PATH: "" },
		});

		expect(stderr).toBe("");
		expect(stdout.trim().split("\n")).toEqual([
			"alpha-blocked — blocked",
			"nested-marker — open",
			"zulu-open — open",
		]);
	});
});

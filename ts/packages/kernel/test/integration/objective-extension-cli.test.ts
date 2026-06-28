import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInObjectiveExtension } from "../helpers/objective-extension.ts";
import {
	parseJsonOutput,
	runCliWithFakes,
	type ScriptedExecResponse,
} from "../scenario/sdl-cli-fakes.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("checked-in Objective SDL extension loading", () => {
	test("real loader exposes Objective command help without showing hidden exec helpers", async () => {
		const cwd = await createObjectiveProject();

		const help = runWithRealObjectiveExtension({ args: ["objective", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: sdl objective");
		expect(output).toContain("list");
		expect(output).toContain("check");
		expect(output).toContain("archive");
		expect(output).not.toContain("read-objective");
		expect(help.stderr.join("")).toBe("");
	});

	test("visible command help preserves the Objective command surfaces", async () => {
		const cwd = await createObjectiveProject();

		const listHelp = runWithRealObjectiveExtension({ args: ["objective", "list", "--help"], cwd });
		expect(await listHelp.exit).toBe(0);
		const listOutput = listHelp.stdout.join("");
		expect(listOutput).toContain("Usage: sdl objective list");
		expect(listOutput).toContain("--names");
		expect(listOutput).toContain("--status");
		expect(listOutput).toContain("--minimal");

		const checkHelp = runWithRealObjectiveExtension({
			args: ["objective", "check", "--help"],
			cwd,
		});
		expect(await checkHelp.exit).toBe(0);
		expect(checkHelp.stdout.join("")).toContain("Usage: sdl objective check [options] [slug]");

		const archiveHelp = runWithRealObjectiveExtension({
			args: ["objective", "archive", "--help"],
			cwd,
		});
		expect(await archiveHelp.exit).toBe(0);
		expect(archiveHelp.stdout.join("")).toContain("--unarchive");
	});

	test("hidden exec command help is invocable under the SDL exec convention", async () => {
		const cwd = await createObjectiveProject();

		const readHelp = runWithRealObjectiveExtension({
			args: ["objective", "exec", "read-objective", "--help"],
			cwd,
		});
		expect(await readHelp.exit).toBe(0);
		expect(readHelp.stdout.join("")).toContain(
			"Usage: sdl objective exec read-objective [options] [slug]",
		);

		const candidatesHelp = runWithRealObjectiveExtension({
			args: ["objective", "exec", "list-candidates", "--help"],
			cwd,
		});
		expect(await candidatesHelp.exit).toBe(0);
		expect(candidatesHelp.stdout.join("")).toContain("Usage: sdl objective exec list-candidates");

		const usageHelp = runWithRealObjectiveExtension({
			args: ["objective", "exec", "runner-subagent-usage", "--help"],
			cwd,
		});
		expect(await usageHelp.exit).toBe(0);
		expect(usageHelp.stdout.join("")).toContain(
			"Usage: sdl objective exec runner-subagent-usage [options] [session-files...]",
		);

		const orientationsHelp = runWithRealObjectiveExtension({
			args: ["objective", "exec", "load-orientations", "--help"],
			cwd,
		});
		expect(await orientationsHelp.exit).toBe(0);
		expect(orientationsHelp.stdout.join("")).toContain(
			"Usage: sdl objective exec load-orientations",
		);
		expect(orientationsHelp.stdout.join("")).toContain("Load active Objective orientation files");
	});

	test("exec commands without dedicated coverage preserve their behavior", async () => {
		const cwd = await createObjectiveProject();

		const check = runWithRealObjectiveExtension({
			args: ["objective", "check", "demo-objective"],
			cwd,
		});
		expect(await check.exit).toBe(0);
		const checkOutput = check.stdout.join("");
		expect(checkOutput).toContain("Objective check demo-objective");
		expect(checkOutput).toContain("Files objective.md:yes");

		const orientations = runWithRealObjectiveExtension({
			args: ["objective", "exec", "load-orientations", "--format", "md"],
			cwd,
		});
		expect(await orientations.exit).toBe(0);
		const orientationsOutput = orientations.stdout.join("");
		expect(orientationsOutput).toContain("orientation.md");
		expect(orientationsOutput).toContain("Demo orientation direction.");

		const orientationsJson = runWithRealObjectiveExtension({
			args: ["objective", "exec", "load-orientations", "--format", "json"],
			cwd,
		});
		expect(await orientationsJson.exit).toBe(0);
		expect(parseJsonOutput(orientationsJson)).toMatchObject({
			status: "ok",
			exitCode: 0,
			data: { recordCount: 1, records: [{ slug: "demo-objective" }] },
		});
	});

	test("representative commands preserve Objective human, JSON, and markdown outputs", async () => {
		const cwd = await createObjectiveProject();

		const list = runWithRealObjectiveExtension({
			args: ["objective", "list", "--minimal"],
			cwd,
		});
		expect(await list.exit).toBe(0);
		expect(list.stdout.join("")).toContain("demo-objective");

		const listJson = runWithRealObjectiveExtension({
			args: ["objective", "list", "--minimal", "--format", "json"],
			cwd,
		});
		expect(await listJson.exit).toBe(0);
		expect(parseJsonOutput(listJson)).toMatchObject({
			status: "ok",
			exitCode: 0,
			data: { records: [{ slug: "demo-objective", status: "open" }] },
		});

		const read = runWithRealObjectiveExtension({
			args: ["objective", "exec", "read-objective", "demo-objective", "--format", "md"],
			cwd,
		});
		expect(await read.exit).toBe(0);
		expect(read.stdout.join("")).toContain("# Objective `demo-objective`");
		expect(read.stdout.join("")).toContain("## Thesis");
	});
});

async function createObjectiveProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-objective-extension-project-"));
	tempDirs.push(directory);
	installCheckedInObjectiveExtension(directory);
	await writeObjectiveRecord(directory, "demo-objective");
	return directory;
}

async function writeObjectiveRecord(projectRoot: string, slug: string): Promise<void> {
	const recordRoot = join(projectRoot, ".sdl", "objectives", slug);
	await mkdir(join(recordRoot, "updates"), { recursive: true });
	await writeFile(
		join(recordRoot, "objective.md"),
		[
			`# ${slug}`,
			"",
			"## Thesis",
			"Demo thesis.",
			"",
			"## Scope",
			"Demo scope.",
			"",
			"## Non-Goals",
			"None.",
			"",
			"## Completion Criteria",
			"- Demo criterion.",
			"",
			"## Assumptions and Risks",
			"None.",
			"",
			"## Open Questions",
			"None.",
			"",
		].join("\n"),
		"utf8",
	);
	await writeFile(
		join(recordRoot, "roadmap.md"),
		["# Roadmap", "", "## Work", "", "- Demo work.", "", "## Parked", "", "None.", ""].join("\n"),
		"utf8",
	);
	await writeFile(
		join(recordRoot, "orientation.md"),
		["# Orientation", "", "Demo orientation direction.", ""].join("\n"),
		"utf8",
	);
	await writeFile(
		join(recordRoot, "updates", "2026-06-27T000000Z-demo.md"),
		[
			"# Demo update",
			"",
			"## Summary",
			"Demo.",
			"",
			"## Objective Impact",
			"Demo.",
			"",
			"## Follow-Ups",
			"None.",
			"",
		].join("\n"),
		"utf8",
	);
}

function runWithRealObjectiveExtension(options: { args: readonly string[]; cwd: string }) {
	return runCliWithFakes(options, {
		execResponses: () => objectiveGitResponses(options.cwd),
		textGenerationResults: () => [],
	});
}

function objectiveGitResponses(cwd: string): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "git symbolic-ref --short refs/remotes/origin/HEAD", result: { code: 1 } },
		{ match: "git rev-parse --verify refs/heads/main", result: { stdout: "abc123\n" } },
		{ match: "git status --porcelain -- .sdl/objectives/demo-objective", result: { stdout: "" } },
	];
}

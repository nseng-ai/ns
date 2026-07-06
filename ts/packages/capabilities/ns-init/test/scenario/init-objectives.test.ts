import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";

import { initObjectives } from "../../src/init-objectives.ts";
import type { ObjectiveActivationContext } from "../../src/activation-context.ts";
import { InMemoryActivationFilesGateway, InMemorySkillMaterializer } from "../../src/testing.ts";

function initContext(options: { nsToml?: string } = {}): {
	context: ObjectiveActivationContext;
	files: InMemoryActivationFilesGateway;
	skills: InMemorySkillMaterializer;
} {
	const fileState = options.nsToml === undefined ? {} : { projectConfigFile: options.nsToml };
	const files = new InMemoryActivationFilesGateway(fileState);
	const skills = new InMemorySkillMaterializer();
	return {
		context: {
			git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: "main" }),
			files,
			skills,
		},
		files,
		skills,
	};
}

describe("initObjectives", () => {
	it("requires --harness on first activation", async () => {
		const { context } = initContext();
		const result = await initObjectives(context, { cwd: "/repo", harness: [] });

		expect(result.type).toBe("usageError");
		if (result.type !== "usageError") throw new Error("expected usage error");
		expect(result.message).toContain("--harness");
		expect(result.data).toMatchObject({ argument: "harness" });
	});

	it("persists explicit harnesses and activates", async () => {
		const { context, files, skills } = initContext();
		const result = await initObjectives(context, {
			cwd: "/repo",
			harness: ["codex", "claude-code"],
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("expected ok");
		expect(result.data).toMatchObject({
			repoRoot: "/repo",
			trunkBranch: "main",
			harnesses: ["codex", "claude-code"],
			harnessSource: "explicit",
			nsToml: { change: "created" },
		});
		expect(files.projectConfigFileContent()).toBe('harnesses = ["codex","claude-code"]\n');
		expect(files.instructionFileContent("AGENTS.md")).toContain("ns objective list");
		expect(files.instructionFileContent("CLAUDE.md")).toContain("@AGENTS.md");
		expect(files.hasObjectivesDirectory()).toBe(true);
		expect(skills.calls()).toEqual([{ repoRoot: "/repo", harnesses: ["codex", "claude-code"] }]);
	});

	it("uses persisted harnesses on rerun without --harness", async () => {
		const { context, files, skills } = initContext({ nsToml: 'harnesses = ["pi"]\n' });
		const result = await initObjectives(context, { cwd: "/repo", harness: [] });

		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("expected ok");
		expect(result.data.harnessSource).toBe("ns-toml");
		expect(result.data.harnesses).toEqual(["pi"]);
		expect(result.data.nsToml.change).toBe("unchanged");
		expect(files.projectConfigFileContent()).toBe('harnesses = ["pi"]\n');
		expect(skills.calls()).toEqual([{ repoRoot: "/repo", harnesses: ["pi"] }]);
	});

	it("replaces persisted harnesses when explicit harnesses differ", async () => {
		const { context, files } = initContext({ nsToml: 'harnesses = ["pi"]\n' });
		const result = await initObjectives(context, { cwd: "/repo", harness: ["codex"] });

		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("expected ok");
		expect(result.data.nsToml.change).toBe("replaced");
		expect(files.projectConfigFileContent()).toBe('harnesses = ["codex"]\n');
	});

	it("fails on invalid persisted harnesses", async () => {
		const { context } = initContext({ nsToml: 'harnesses = ["cursor"]\n' });
		const result = await initObjectives(context, { cwd: "/repo", harness: [] });

		expect(result.type).toBe("failure");
		if (result.type !== "failure") throw new Error("expected failure");
		expect(result.errorType).toBe("ns-init-config-invalid");
	});
});

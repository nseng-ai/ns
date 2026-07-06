import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";

import { activateObjectives } from "../../src/activate-objectives.ts";
import type { ObjectiveActivationContext } from "../../src/activation-context.ts";
import { pendingBundleSkillMaterializer } from "../../src/pending-bundle-skill-materializer.ts";
import { InMemoryActivationFilesGateway, InMemorySkillMaterializer } from "../../src/testing.ts";

function activationContext(overrides: Partial<ObjectiveActivationContext> = {}): {
	context: ObjectiveActivationContext;
	files: InMemoryActivationFilesGateway;
	skills: InMemorySkillMaterializer;
} {
	const files = new InMemoryActivationFilesGateway();
	const skills = new InMemorySkillMaterializer();
	const context: ObjectiveActivationContext = {
		git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: "main" }),
		files,
		skills,
		...overrides,
	};
	return { context, files, skills };
}

describe("activateObjectives", () => {
	it("activates a fresh customer repo end to end", async () => {
		const { context, files, skills } = activationContext();
		const result = await activateObjectives(context, {
			cwd: "/repo",
			harnesses: ["claude-code", "codex"],
		});

		expect(result).toMatchObject({
			type: "activated",
			report: {
				repoRoot: "/repo",
				trunkBranch: "main",
				agentsInstructionFile: { change: "created" },
				claudeInstructionFile: { change: "created" },
				objectivesDirectory: { created: true },
				skills: { type: "materialized" },
			},
		});
		expect(files.instructionFileContent("AGENTS.md")).toContain("<!-- ns:objectives:begin v1 -->");
		expect(files.instructionFileContent("AGENTS.md")).toContain("ns objective list");
		expect(files.instructionFileContent("CLAUDE.md")).toContain("@AGENTS.md");
		expect(files.hasObjectivesDirectory()).toBe(true);
		expect(skills.calls()).toEqual([{ repoRoot: "/repo", harnesses: ["claude-code", "codex"] }]);
	});

	it("preserves existing instruction files and reports appends", async () => {
		const files = new InMemoryActivationFilesGateway({
			instructionFiles: {
				"AGENTS.md": "# House rules\n",
				"CLAUDE.md": "# Claude notes\n",
			},
		});
		const { context } = activationContext({ files });
		const result = await activateObjectives(context, { cwd: "/repo", harnesses: ["pi"] });

		expect(result).toMatchObject({
			type: "activated",
			report: {
				agentsInstructionFile: { change: "appended" },
				claudeInstructionFile: { change: "appended" },
			},
		});
		expect(files.instructionFileContent("AGENTS.md")).toContain("# House rules");
		expect(files.instructionFileContent("CLAUDE.md")).toContain("# Claude notes");
	});

	it("is idempotent on re-run", async () => {
		const { context } = activationContext();
		const first = await activateObjectives(context, { cwd: "/repo", harnesses: ["claude-code"] });
		expect(first.type).toBe("activated");

		const second = await activateObjectives(context, { cwd: "/repo", harnesses: ["claude-code"] });
		expect(second).toMatchObject({
			type: "activated",
			report: {
				agentsInstructionFile: { change: "unchanged" },
				claudeInstructionFile: { change: "unchanged" },
				objectivesDirectory: { created: false },
			},
		});
	});

	it("requires a git repository", async () => {
		const { context } = activationContext({
			git: new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } }),
		});
		const result = await activateObjectives(context, { cwd: "/repo", harnesses: ["claude-code"] });
		expect(result.type).toBe("not-a-git-repo");
		if (result.type !== "not-a-git-repo") throw new Error("expected not-a-git-repo");
		expect(result.message).toContain("git init");
	});

	it("requires a detectable trunk branch", async () => {
		const { context } = activationContext({
			git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: { type: "missing" } }),
		});
		const result = await activateObjectives(context, { cwd: "/repo", harnesses: ["claude-code"] });
		expect(result.type).toBe("trunk-undetectable");
	});

	it("requires an explicit harness selection", async () => {
		const { context } = activationContext();
		const result = await activateObjectives(context, { cwd: "/repo", harnesses: [] });
		expect(result).toMatchObject({
			type: "error",
			error: { code: "harness-selection-empty" },
		});
	});

	it("surfaces a malformed AGENTS.md block without writing", async () => {
		const files = new InMemoryActivationFilesGateway({
			instructionFiles: { "AGENTS.md": "<!-- ns:objectives:begin v1 -->\nno end marker\n" },
		});
		const { context } = activationContext({ files });
		const result = await activateObjectives(context, { cwd: "/repo", harnesses: ["claude-code"] });
		expect(result.type).toBe("agents-block-malformed");
		expect(files.instructionFileContent("AGENTS.md")).toBe(
			"<!-- ns:objectives:begin v1 -->\nno end marker\n",
		);
	});

	it("reports the pending-bundle skill stub as unavailable without failing activation", async () => {
		const { context } = activationContext({ skills: pendingBundleSkillMaterializer });
		const result = await activateObjectives(context, { cwd: "/repo", harnesses: ["claude-code"] });
		expect(result).toMatchObject({
			type: "activated",
			report: { skills: { type: "unavailable" } },
		});
	});
});

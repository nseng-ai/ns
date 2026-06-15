import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@asdl/core/git/testing";
import { describe, expect, test } from "vitest";

import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregCheckProjectInspectionGateway,
	FakeAregGithubGateway,
	FakeAregHostGateway,
	FakeAregInitProjectGateway,
	type FakeAregInitProjectGatewayOptions,
	FakeAregNpxSkillsGateway,
	type FakeAregNpxSkillsGatewayOptions,
	FakeAregPromptGateway,
	type FakeAregPromptGatewayOptions,
	FakeAregSkillxWorkspaceGateway,
} from "../../src/fake-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

const BOOTSTRAP_REPO = "dagster-io/asdl-tools";

interface InitHarnessOptions {
	initProject?: FakeAregInitProjectGatewayOptions | undefined;
	git?: InMemoryGitGatewayState | undefined;
	npxSkills?: FakeAregNpxSkillsGatewayOptions | undefined;
	prompt?: FakeAregPromptGatewayOptions | undefined;
}

interface InitHarness {
	context: AregCliContext;
	initProject: FakeAregInitProjectGateway;
	npxSkills: FakeAregNpxSkillsGateway;
	prompt: FakeAregPromptGateway;
}

function initHarness(options: InitHarnessOptions = {}): InitHarness {
	const initProject = new FakeAregInitProjectGateway(options.initProject);
	const npxSkills = new FakeAregNpxSkillsGateway(options.npxSkills);
	const prompt = new FakeAregPromptGateway(options.prompt);
	return {
		initProject,
		npxSkills,
		prompt,
		context: {
			host: new FakeAregHostGateway(),
			github: new FakeAregGithubGateway(),
			skillxWorkspace: new FakeAregSkillxWorkspaceGateway(),
			projectInspection: new FakeAregCheckProjectInspectionGateway(),
			git: new InMemoryGitGateway(options.git),
			npxSkills,
			prompt,
			initProject,
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
		},
	};
}

function runInit(args: readonly string[], options: InitHarnessOptions = {}): InitHarness & { exit: Promise<number>; stdout: string[]; stderr: string[] } {
	const harness = initHarness(options);
	const run = runScenario(["init", ...args], { context: harness.context });
	return { ...harness, ...run };
}

describe("areg init CLI", () => {
	test("initializes an existing Git root with default agents", async () => {
		const run = runInit([]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toContain("Initialized areg in /repo");
		expect(run.npxSkills.operations()).toEqual([
			{
				type: "add-skills",
				sourceRepo: BOOTSTRAP_REPO,
				skillNames: ["skill-management", "skillx"],
				targetAgents: ["codex", "claude-code"],
				cwd: "/repo",
			},
		]);
		expect(run.initProject.text("asdl.toml")).toBe('[areg]\nagents = ["codex","claude-code"]\n');
		expect(run.initProject.text("AGENTS.md")).toContain("<!-- areg:skills:start -->");
		expect(run.initProject.text("CLAUDE.md")).toContain("@AGENTS.md");
		expect(run.initProject.text(".claude/settings.local.json")).toContain('"Bash(npx skills:*)"');
	});

	test("uses repeatable --agent values for TOML and npx", async () => {
		const run = runInit([".", "--agent", "codex", "--agent", "windsurf"]);

		expect(await run.exit).toBe(0);
		expect(run.initProject.text("asdl.toml")).toBe('[areg]\nagents = ["codex","windsurf"]\n');
		expect(run.npxSkills.operations()[0]?.targetAgents).toEqual(["codex", "windsurf"]);
	});

	test("preserves unrelated TOML and migrates legacy agents without rewriting areg.json", async () => {
		const run = runInit([], {
			initProject: {
				asdlToml: '[roaster.diff]\nexclude = [".agents/skills/**/*.py"]\n',
				aregJson: { agents: ["codex", "cursor"] },
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.initProject.text("asdl.toml")).toBe('[roaster.diff]\nexclude = [".agents/skills/**/*.py"]\n\n[areg]\nagents = ["codex","cursor"]\n');
		expect(run.initProject.text("areg.json")).toBe('{\n  "agents": [\n    "codex",\n    "cursor"\n  ]\n}\n');
	});

	test("prompts before appending existing prose and honors decline", async () => {
		const run = runInit([], { initProject: { agentsMd: "# Existing\n" }, prompt: { responses: [false] } });

		expect(await run.exit).toBe(0);
		expect(run.initProject.text("AGENTS.md")).toBe("# Existing\n");
		expect(run.prompt.operations()).toEqual([
			{
				type: "confirm",
				message: "AGENTS.md exists without an areg-managed Skills block. Add one?",
				defaultValue: false,
				response: false,
			},
		]);
	});

	test("--yes appends prose without prompting and avoids duplicate Claude include", async () => {
		const run = runInit(["--yes"], { initProject: { claudeMd: "# Existing\n\n@AGENTS.md\n" } });

		expect(await run.exit).toBe(0);
		const claude = run.initProject.text("CLAUDE.md") ?? "";
		expect(claude).toContain("<!-- areg:claude-skills:start -->");
		expect(claude.match(/@AGENTS\.md/gu)).toHaveLength(1);
		expect(run.prompt.operations()).toEqual([]);
	});

	test("--no-append skips existing prose but creates missing peer files", async () => {
		const run = runInit(["--no-append"], { initProject: { agentsMd: "# Existing\n" } });

		expect(await run.exit).toBe(0);
		expect(run.initProject.text("AGENTS.md")).toBe("# Existing\n");
		expect(run.initProject.text("CLAUDE.md")).toContain("<!-- areg:claude-skills:start -->");
	});

	test("malformed managed markers fail before npx and writes", async () => {
		const run = runInit([], { initProject: { agentsMd: "<!-- areg:skills:start -->\nold\n" } });

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("malformed areg-managed block");
		expect(run.npxSkills.operations()).toEqual([]);
		expect(run.initProject.text("asdl.toml")).toBeUndefined();
	});

	test("invalid legacy config is ignored when explicit agents are provided", async () => {
		const run = runInit(["--agent", "codex"], { initProject: { aregJson: "{not json\n" } });

		expect(await run.exit).toBe(0);
		expect(run.initProject.text("asdl.toml")).toBe('[areg]\nagents = ["codex"]\n');
	});

	test("preflight and npx failures do not apply planned writes", async () => {
		const conflict = runInit(["--yes", "--no-append"]);
		expect(await conflict.exit).toBe(1);
		expect(conflict.npxSkills.operations()).toEqual([]);
		expect(conflict.initProject.operations()).toEqual([]);

		const npxFail = runInit([], { npxSkills: { failure: { code: "boom", message: "boom" } } });
		expect(await npxFail.exit).toBe(1);
		expect(npxFail.stderr.join("")).toContain("npx skills add failed: boom");
		expect(npxFail.initProject.text("asdl.toml")).toBeUndefined();
	});

	test("rejects non-Git directories and Git subdirectories", async () => {
		const missingGit = runInit([], { git: { optionalRepoRoot: { type: "missing" } } });
		expect(await missingGit.exit).toBe(1);
		expect(missingGit.stderr.join("")).toContain("Run git init first");
		expect(missingGit.npxSkills.operations()).toEqual([]);

		const subdir = runInit([], { initProject: { projectDir: "/repo/subdir" }, git: { optionalRepoRoot: "/repo" } });
		expect(await subdir.exit).toBe(1);
		expect(subdir.stderr.join("")).toContain("is inside a Git worktree but is not the root");
	});

	test("JSON output returns structured init result", async () => {
		const run = runInit(["--format", "json"]);

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 0,
			data: {
				project_dir: "/repo",
				agents: ["codex", "claude-code"],
				bootstrap_repo: BOOTSTRAP_REPO,
				bootstrap_skills: ["skill-management", "skillx"],
				written_files: ["asdl.toml", "AGENTS.md", "CLAUDE.md", ".claude/settings.local.json"],
				skipped_files: [],
			},
		});
	});
});

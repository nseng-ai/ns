import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@asdl/core/git/testing";
import { describe, expect, test } from "vitest";

import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregGithubGateway,
	FakeAregHostGateway,
	FakeAregNpxSkillsGateway,
	type FakeAregNpxSkillsGatewayOptions,
	FakeAregProjectGateway,
	type FakeAregProjectGatewayOptions,
	FakeAregPromptGateway,
	type FakeAregPromptGatewayOptions,
	FakeAregSkillxWorkspaceGateway,
} from "../../src/fake-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

const BOOTSTRAP_REPO = "dagster-io/asdl-tools";

interface InitHarnessOptions {
	project?: FakeAregProjectGatewayOptions | undefined;
	git?: InMemoryGitGatewayState | undefined;
	npxSkills?: FakeAregNpxSkillsGatewayOptions | undefined;
	prompt?: FakeAregPromptGatewayOptions | undefined;
}

interface InitHarness {
	context: AregCliContext;
	projectGateway: FakeAregProjectGateway;
	npxSkills: FakeAregNpxSkillsGateway;
	prompt: FakeAregPromptGateway;
}

function initHarness(options: InitHarnessOptions = {}): InitHarness {
	const projectGateway = new FakeAregProjectGateway(options.project);
	const npxSkills = new FakeAregNpxSkillsGateway(options.npxSkills);
	const prompt = new FakeAregPromptGateway(options.prompt);
	return {
		projectGateway,
		npxSkills,
		prompt,
		context: {
			host: new FakeAregHostGateway(),
			github: new FakeAregGithubGateway(),
			skillxWorkspace: new FakeAregSkillxWorkspaceGateway(),
			project: projectGateway,
			git: new InMemoryGitGateway(options.git),
			npxSkills,
			prompt,
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
		expect(run.projectGateway.text("asdl.toml")).toBe('[areg]\nagents = ["codex","claude-code"]\n');
		expect(run.projectGateway.text("AGENTS.md")).toContain("<!-- areg:skills:start -->");
		expect(run.projectGateway.text("CLAUDE.md")).toContain("@AGENTS.md");
		expect(run.projectGateway.text(".claude/settings.local.json")).toContain('"Bash(npx skills:*)"');
	});

	test("uses repeatable --agent values for TOML and npx", async () => {
		const run = runInit([".", "--agent", "codex", "--agent", "windsurf"]);

		expect(await run.exit).toBe(0);
		expect(run.projectGateway.text("asdl.toml")).toBe('[areg]\nagents = ["codex","windsurf"]\n');
		expect(run.npxSkills.operations()[0]?.targetAgents).toEqual(["codex", "windsurf"]);
	});

	test("preserves unrelated TOML and migrates legacy agents without rewriting areg.json", async () => {
		const run = runInit([], {
			project: {
				asdlToml: '[roaster.diff]\nexclude = [".agents/skills/**/*.py"]\n',
				aregJson: { agents: ["codex", "cursor"] },
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.projectGateway.text("asdl.toml")).toBe('[roaster.diff]\nexclude = [".agents/skills/**/*.py"]\n\n[areg]\nagents = ["codex","cursor"]\n');
		expect(run.projectGateway.text("areg.json")).toBe('{\n  "agents": [\n    "codex",\n    "cursor"\n  ]\n}\n');
	});

	test("prompts before appending existing prose and honors decline", async () => {
		const run = runInit([], { project: { agentsMd: "# Existing\n" }, prompt: { responses: [false] } });

		expect(await run.exit).toBe(0);
		expect(run.projectGateway.text("AGENTS.md")).toBe("# Existing\n");
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
		const run = runInit(["--yes"], { project: { claudeMd: "# Existing\n\n@AGENTS.md\n" } });

		expect(await run.exit).toBe(0);
		const claude = run.projectGateway.text("CLAUDE.md") ?? "";
		expect(claude).toContain("<!-- areg:claude-skills:start -->");
		expect(claude.match(/@AGENTS\.md/gu)).toHaveLength(1);
		expect(run.prompt.operations()).toEqual([]);
	});

	test("--no-append skips existing prose but creates missing peer files", async () => {
		const run = runInit(["--no-append"], { project: { agentsMd: "# Existing\n" } });

		expect(await run.exit).toBe(0);
		expect(run.projectGateway.text("AGENTS.md")).toBe("# Existing\n");
		expect(run.projectGateway.text("CLAUDE.md")).toContain("<!-- areg:claude-skills:start -->");
	});

	test("malformed managed markers fail before npx and writes", async () => {
		const run = runInit([], { project: { agentsMd: "<!-- areg:skills:start -->\nold\n" } });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("malformed areg-managed block");
		expect(run.npxSkills.operations()).toEqual([]);
		expect(run.projectGateway.text("asdl.toml")).toBeUndefined();
	});

	test("invalid legacy config is ignored when explicit agents are provided", async () => {
		const run = runInit(["--agent", "codex"], { project: { aregJson: "{not json\n" } });

		expect(await run.exit).toBe(0);
		expect(run.projectGateway.text("asdl.toml")).toBe('[areg]\nagents = ["codex"]\n');
	});

	test("preflight and npx failures do not apply planned writes", async () => {
		const conflict = runInit(["--yes", "--no-append"]);
		expect(await conflict.exit).toBe(2);
		expect(conflict.npxSkills.operations()).toEqual([]);
		expect(conflict.projectGateway.operations()).toEqual([]);

		const npxFail = runInit([], { npxSkills: { failure: { code: "boom", message: "boom" } } });
		expect(await npxFail.exit).toBe(1);
		expect(npxFail.stderr.join("")).toContain("npx skills add failed: boom");
		expect(npxFail.stderr.join("")).not.toContain("\"operations\"");
		expect(npxFail.projectGateway.text("asdl.toml")).toBeUndefined();
	});

	test("rejects non-Git directories and Git subdirectories", async () => {
		const missingGit = runInit([], { git: { optionalRepoRoot: { type: "missing" } } });
		expect(await missingGit.exit).toBe(2);
		expect(missingGit.stderr.join("")).toContain("Run git init first");
		expect(missingGit.npxSkills.operations()).toEqual([]);

		const subdir = runInit([], { project: { projectDir: "/repo/subdir" }, git: { optionalRepoRoot: "/repo" } });
		expect(await subdir.exit).toBe(2);
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

	test("JSON preflight failure reports mutation evidence and skips npx", async () => {
		const run = runInit(["--format", "json"], { project: { preflightFailures: { "AGENTS.md": { code: "blocked", message: "blocked" } } } });

		expect(await run.exit).toBe(1);
		const output = JSON.parse(run.stdout.join(""));
		expect(output).toMatchObject({
			exit_code: 1,
			data: {
				mutation_failed: true,
				project_dir: "/repo",
				agents: ["codex", "claude-code"],
				bootstrap_repo: BOOTSTRAP_REPO,
				bootstrap_skills: ["skill-management", "skillx"],
				operations: [
					{ type: "external", path: "npx skills add", status: "not_attempted" },
					{ type: "write", path: "asdl.toml", status: "not_attempted" },
					{ type: "write", path: "AGENTS.md", status: "failed", error: { code: "blocked", message: "blocked" } },
					{ type: "write", path: "CLAUDE.md", status: "not_attempted" },
					{ type: "write", path: ".claude/settings.local.json", status: "not_attempted" },
				],
			},
		});
		expect(run.npxSkills.operations()).toEqual([]);
		expect(run.projectGateway.text("asdl.toml")).toBeUndefined();
	});

	test("JSON npx failure reports external failure and not-attempted file writes", async () => {
		const run = runInit(["--format", "json"], { npxSkills: { failure: { code: "boom", message: "boom" } } });

		expect(await run.exit).toBe(1);
		const output = JSON.parse(run.stdout.join(""));
		expect(output).toMatchObject({
			exit_code: 1,
			data: {
				mutation_failed: true,
				operations: [
					{ type: "external", path: "npx skills add", status: "failed", error: { code: "boom", message: "boom" } },
					{ type: "write", path: "asdl.toml", status: "not_attempted" },
					{ type: "write", path: "AGENTS.md", status: "not_attempted" },
					{ type: "write", path: "CLAUDE.md", status: "not_attempted" },
					{ type: "write", path: ".claude/settings.local.json", status: "not_attempted" },
				],
			},
		});
		expect(run.projectGateway.text("asdl.toml")).toBeUndefined();
	});

	test("JSON file execution failure reports applied external and partial file statuses", async () => {
		const run = runInit(["--format", "json"], { project: { mutationFailures: { "AGENTS.md": { code: "write-blocked", message: "write blocked" } } } });

		expect(await run.exit).toBe(1);
		const output = JSON.parse(run.stdout.join(""));
		expect(output).toMatchObject({
			exit_code: 1,
			data: {
				mutation_failed: true,
				operations: [
					{ type: "external", path: "npx skills add", status: "applied" },
					{ type: "write", path: "asdl.toml", status: "applied" },
					{ type: "write", path: "AGENTS.md", status: "failed", error: { code: "write-blocked", message: "write blocked" } },
					{ type: "write", path: "CLAUDE.md", status: "not_attempted" },
					{ type: "write", path: ".claude/settings.local.json", status: "not_attempted" },
				],
			},
		});
		expect(run.npxSkills.operations()).toHaveLength(1);
		expect(run.projectGateway.text("asdl.toml")).toBe('[areg]\nagents = ["codex","claude-code"]\n');
		expect(run.projectGateway.text("AGENTS.md")).toBeUndefined();
	});
});

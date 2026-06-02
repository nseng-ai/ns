import { describe, expect, test } from "bun:test";

import { listAsdlDevCommands, runCli } from "asdl-dev/src/cli.ts";
import { DEFAULT_PROJECT, DEFAULT_SCOPE } from "asdl-dev/src/preview-url.ts";
import { deploymentRecord } from "../support/builders.ts";
import { inMemoryContext, type InMemoryContextState } from "../support/in-memory-gateways.ts";

function runWithFakes(args: readonly string[], state: InMemoryContextState = {}, options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const fakes = inMemoryContext(state);
	return {
		...fakes,
		stdout,
		stderr,
		exit: runCli(args, {
			context: fakes.context,
			cwd: options.cwd ?? "/work",
			env: options.env ?? {},
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
		}),
	};
}

function parseJsonOutput(run: { stdout: string[] }): Record<string, unknown> {
	return JSON.parse(run.stdout.join("")) as Record<string, unknown>;
}

describe("asdl-dev preview-url CLI help and parsing", () => {
	test("command metadata comes from the flat command table", () => {
		expect(listAsdlDevCommands()).toEqual([
			{ name: "preview-url", description: "Print the Vercel preview URL for a branch." },
			{ name: "cp", description: "Create a checkpoint commit for the current diff." },
			{ name: "submit", description: "Submit the current Graphite stack with gt submit -nps --ai." },
		]);
	});

	test("top-level help lists command-table commands and not the removed command", async () => {
		const run = runWithFakes(["--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("preview-url");
		expect(help).toContain("cp");
		expect(help).toContain("submit");
		expect(help).toContain("flat list of task commands");
		expect(help).not.toContain("latest-branch-deployment");
		expect(run.stderr.join("")).toBe("");
	});

	test("command help documents preview-url options", async () => {
		const run = runWithFakes(["preview-url", "--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("--branch TEXT");
		expect(help).toContain("--project TEXT");
		expect(help).toContain("--scope TEXT");
		expect(help).toContain("--json");
		expect(help).toContain("-h, --help");
	});

	test("command help documents model-only cp behavior", async () => {
		const run = runWithFakes(["cp", "--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: asdl-dev cp");
		expect(help).toContain("model-authored message");
		expect(help).toContain("ASDL_DEV_TEXT_BACKEND");
		expect(help).toContain("ASDL_DEV_CHECKPOINT_MODEL");
		expect(help).toContain("-h, --help");
		expect(help).not.toContain("draft harness");
	});

	test("command help documents submit behavior", async () => {
		const run = runWithFakes(["submit", "--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: asdl-dev submit");
		expect(help).toContain("gt submit -nps --ai");
		expect(help).toContain("--restack");
		expect(help).toContain("-h, --help");
	});

	test("unknown command exits 2 and shows top-level help", async () => {
		const run = runWithFakes(["latest-branch-deployment"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Unknown command: latest-branch-deployment");
		expect(run.stderr.join("")).toContain("preview-url");
		expect(run.stderr.join("")).toContain("cp");
		expect(run.stderr.join("")).toContain("submit");
		expect(run.stdout.join("")).toBe("");
	});

	test("unknown option exits 2", async () => {
		const run = runWithFakes(["preview-url", "--bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Unknown option: --bogus");
	});
});

describe("asdl-dev cp CLI behavior", () => {
	test("default cp drafts with the text-generation gateway and commits a valid model message", async () => {
		const message = `[cp] Update CLI checkpoint

- Add command table coverage`;
		const run = runWithFakes(["cp"], {
			checkpoint: {
				snapshot: {
					root: "/repo",
					branch: "feature/demo",
					status: " M src/app.ts\n",
					diff: "diff --git a/src/app.ts b/src/app.ts\n",
					clean: false,
				},
				commit: { summary: "def456 [cp] Update CLI checkpoint" },
			},
			textGeneration: { results: [{ ok: true, text: message }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`def456 [cp] Update CLI checkpoint\n${message}\n`);
		expect(run.stderr.join("")).toBe("");
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([{ cwd: "/work" }]);
		expect(run.textGeneration.generateTextCalls).toEqual([
			expect.objectContaining({
				modelRef: "openai-codex/gpt-5.4-mini",
				operation: "checkpoint-message",
				maxTokens: 512,
				reasoning: "low",
			}),
		]);
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## git status --porcelain\n\n M src/app.ts");
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## git diff HEAD\n\ndiff --git a/src/app.ts b/src/app.ts");
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([{ cwd: "/work", message }]);
	});

	test("checkpoint model can be selected by environment", async () => {
		const message = `[cp] Update env model

- Use configured model ref`;
		const run = runWithFakes(
			["cp"],
			{
				textGeneration: { results: [{ ok: true, text: message }] },
				checkpoint: { commit: { summary: "abc123 [cp] Update env model" } },
			},
			{ env: { ASDL_DEV_CHECKPOINT_MODEL: "openai-codex/custom-mini" } },
		);

		expect(await run.exit).toBe(0);
		expect(run.textGeneration.generateTextCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([{ cwd: "/work", message }]);
	});

	test("model generation error exits 2 without committing", async () => {
		const run = runWithFakes(["cp"], {
			textGeneration: { results: [{ ok: false, error: "auth failed" }] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("auth failed\n");
		expect(run.textGeneration.generateTextCalls).toHaveLength(1);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
	});

	test("invalid first model output triggers one repair request and commits the repaired message", async () => {
		const repaired = `[cp] Repair checkpoint message

- Keep only valid bullets`;
		const run = runWithFakes(["cp"], {
			textGeneration: {
				results: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: repaired },
				],
			},
			checkpoint: { commit: { summary: "abc123 [cp] Repair checkpoint message" } },
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.textGeneration.generateTextCalls).toHaveLength(2);
		expect(run.textGeneration.generateTextCalls[1]?.prompt).toContain("## previous invalid draft\n\nnot a commit message");
		expect(run.textGeneration.generateTextCalls[1]?.prompt).toContain("## validation feedback");
		expect(run.textGeneration.generateTextCalls[1]?.prompt).toContain("missing_cp_prefix");
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([{ cwd: "/work", message: repaired }]);
	});

	test("invalid first and repaired output exits 2 without committing", async () => {
		const run = runWithFakes(["cp"], {
			textGeneration: {
				results: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: "still invalid" },
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Model produced an invalid checkpoint message after 2 attempts.");
		expect(run.stderr.join("")).toContain("missing_cp_prefix");
		expect(run.textGeneration.generateTextCalls).toHaveLength(2);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
	});

	test("clean worktree exits without model generation or committing", async () => {
		const run = runWithFakes(["cp"], {
			checkpoint: {
				snapshot: {
					root: "/repo",
					branch: "feature/demo",
					status: "",
					diff: "",
					clean: true,
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Working tree is clean; nothing to checkpoint.\n");
		expect(run.textGeneration.generateTextCalls).toEqual([]);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
	});

	test("trunk branch exits without model generation or committing", async () => {
		const run = runWithFakes(["cp"], {
			checkpoint: {
				snapshot: {
					root: "/repo",
					branch: "main",
					status: " M file.ts\n",
					diff: "diff --git a/file.ts b/file.ts\n",
					clean: false,
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toBe("Refusing to create checkpoint commit on trunk branch: main\n");
		expect(run.textGeneration.generateTextCalls).toEqual([]);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
	});

	test("unknown text backend exits 2 before inspecting git", async () => {
		const run = runWithFakes(["cp"], {}, { env: { ASDL_DEV_TEXT_BACKEND: "bogus" } });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain('Invalid ASDL_DEV_TEXT_BACKEND="bogus"');
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([]);
		expect(run.textGeneration.generateTextCalls).toEqual([]);
	});

	test("cp rejects unsupported arguments", async () => {
		const run = runWithFakes(["cp", "--bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Unknown option: --bogus");
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([]);
	});
});

describe("asdl-dev preview-url success behavior", () => {
	test("default success output prints only the preview URL", async () => {
		const run = runWithFakes(["preview-url"], { vercel: { deployments: [deploymentRecord()] } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("https://branch-alias.vercel.app\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("--json success emits compact structured details", async () => {
		const run = runWithFakes(["preview-url", "--json"], { vercel: { deployments: [deploymentRecord()] } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("").startsWith('{"success":true')).toBe(true);
		const payload = parseJsonOutput(run);
		expect(payload).toMatchObject({
			success: true,
			branch: "feature/demo",
			preview_url: "https://branch-alias.vercel.app",
			deployment_url: "https://immutable.vercel.app",
			dashboard_url: "https://vercel.com/schrockns-projects/asdl-tools/abc123",
			project: DEFAULT_PROJECT,
			scope: DEFAULT_SCOPE,
			deployment: {
				id: "dpl_abc123",
				created_at_ms: 1780264074281,
				ready_at_ms: 1780264085134,
				commit_sha: "abc123",
				pr_number: 767,
			},
			evidence: { source: "vercel_github_commit_ref", metadata_keys: ["githubCommitRef"] },
			warnings: [],
		});
		expect(run.stderr.join("")).toBe("");
	});

	test("--branch bypasses current branch lookup", async () => {
		const run = runWithFakes(
			["preview-url", "--branch", "feature/override", "--json"],
			{
				git: { currentBranch: { kind: "detached" } },
				vercel: { deployments: [deploymentRecord({ meta: { githubCommitRef: "feature/override", branchAlias: "override-alias.vercel.app" }, inspection: { id: "dpl_override", url: "override.vercel.app", aliases: ["override-alias.vercel.app"] }, url: "override.vercel.app" })] },
			},
		);

		expect(await run.exit).toBe(0);
		expect(run.git.currentBranchCalls).toEqual([]);
		expect(parseJsonOutput(run).branch).toBe("feature/override");
	});

	test("selects newest matching deployment", async () => {
		const run = runWithFakes(["preview-url"], {
			vercel: {
				deployments: [
					deploymentRecord({ url: "old.vercel.app", createdAt: 100, inspection: { id: "dpl_old", url: "old.vercel.app", aliases: ["old-alias.vercel.app"] }, meta: { githubCommitRef: "feature/demo", branchAlias: "old-alias.vercel.app" } }),
					deploymentRecord({ url: "new.vercel.app", createdAt: 200, inspection: { id: "dpl_new", url: "new.vercel.app", aliases: ["new-alias.vercel.app"] }, meta: { githubCommitRef: "feature/demo", branchAlias: "new-alias.vercel.app" } }),
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("https://new-alias.vercel.app\n");
	});
});

describe("asdl-dev preview-url failure behavior", () => {
	test("detached head returns structured JSON failure and exits 1", async () => {
		const run = runWithFakes(["preview-url", "--json"], { git: { currentBranch: { kind: "detached" } } });

		expect(await run.exit).toBe(1);
		const payload = parseJsonOutput(run) as { success: false; error: { code: string } };
		expect(payload.success).toBe(false);
		expect(payload.error.code).toBe("detached_head");
		expect(run.stderr.join("")).toBe("");
	});

	test("no matching deployment exits 1 with structured JSON failure", async () => {
		const run = runWithFakes(["preview-url", "--json"], { vercel: { deployments: [] } });

		expect(await run.exit).toBe(1);
		const payload = parseJsonOutput(run) as { success: false; error: { code: string }; branch: string; project: string; scope: string };
		expect(payload.error.code).toBe("no_matching_deployment");
		expect(payload.branch).toBe("feature/demo");
		expect(payload.project).toBe(DEFAULT_PROJECT);
		expect(payload.scope).toBe(DEFAULT_SCOPE);
	});

	test("human failure output goes to stderr", async () => {
		const run = runWithFakes(["preview-url"], { vercel: { deployments: [] } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Error: No READY preview deployment found for branch feature/demo in Vercel project asdl-tools.");
	});

	test("Vercel unavailable exits 2 with structured JSON failure", async () => {
		const run = runWithFakes(["preview-url", "--json"], { vercel: { isAvailable: false } });

		expect(await run.exit).toBe(2);
		const payload = parseJsonOutput(run) as { success: false; error: { code: string } };
		expect(payload.error.code).toBe("vercel_cli_unavailable");
	});

	test("Vercel list failure exits 2 with structured JSON failure", async () => {
		const run = runWithFakes(["preview-url", "--json"], { vercel: { listFailure: { code: "vercel_list_failed", message: "list failed" } } });

		expect(await run.exit).toBe(2);
		const payload = parseJsonOutput(run) as { success: false; error: { code: string; message: string } };
		expect(payload.error).toEqual({ code: "vercel_list_failed", message: "list failed" });
	});

	test("Vercel inspect failure exits 2 with structured JSON failure", async () => {
		const run = runWithFakes(["preview-url", "--json"], {
			vercel: {
				deployments: [deploymentRecord()],
				inspectFailure: { code: "vercel_inspect_failed", message: "inspect failed" },
			},
		});

		expect(await run.exit).toBe(2);
		const payload = parseJsonOutput(run) as { success: false; error: { code: string; message: string } };
		expect(payload.error).toEqual({ code: "vercel_inspect_failed", message: "inspect failed" });
	});
});

describe("asdl-dev preview-url project and scope precedence", () => {
	test("reads project name from project config", async () => {
		const run = runWithFakes(
			["preview-url", "--json"],
			{
				projectConfig: { kind: "found", projectName: "config-project" },
				vercel: { deployments: [deploymentRecord({ project: "config-project" })] },
			},
		);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run).project).toBe("config-project");
		expect(run.vercel.listCalls[0]).toMatchObject({ project: "config-project", scope: DEFAULT_SCOPE });
	});

	test("uses env project and scope before config and defaults", async () => {
		const run = runWithFakes(
			["preview-url", "--json"],
			{
				projectConfig: { kind: "found", projectName: "config-project" },
				vercel: { deployments: [deploymentRecord({ project: "env-project", scope: "env-scope" })] },
			},
			{ env: { VERCEL_PROJECT: "env-project", VERCEL_SCOPE: "env-scope" } },
		);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ project: "env-project", scope: "env-scope" });
		expect(run.projectConfig.readProjectConfigCalls).toEqual([]);
	});

	test("uses explicit flags before env", async () => {
		const run = runWithFakes(
			["preview-url", "--project", "flag-project", "--scope", "flag-scope", "--json"],
			{
				vercel: { deployments: [deploymentRecord({ project: "flag-project", scope: "flag-scope" })] },
			},
			{ env: { VERCEL_PROJECT: "env-project", VERCEL_SCOPE: "env-scope" } },
		);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ project: "flag-project", scope: "flag-scope" });
		expect(run.vercel.listCalls[0]).toMatchObject({ project: "flag-project", scope: "flag-scope" });
	});

	test("uses documented defaults when no overrides or config exist", async () => {
		const run = runWithFakes(["preview-url", "--json"], { vercel: { deployments: [deploymentRecord()] }, projectConfig: { kind: "missing" } });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ project: DEFAULT_PROJECT, scope: DEFAULT_SCOPE });
	});

	test("invalid project config warns and uses default project", async () => {
		const run = runWithFakes(["preview-url", "--json"], {
			projectConfig: { kind: "invalid" },
			vercel: { deployments: [deploymentRecord()] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			project: DEFAULT_PROJECT,
			warnings: ["/repo/.vercel/project.json did not contain a projectName; using asdl-tools."],
		});
	});
});

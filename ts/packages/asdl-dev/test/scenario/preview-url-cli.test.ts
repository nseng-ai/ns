import { describe, expect, test } from "bun:test";

import { listAsdlDevCommands, runCli } from "../../src/cli.ts";
import { DEFAULT_PROJECT, DEFAULT_SCOPE } from "../../src/preview-url.ts";
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
		]);
	});

	test("top-level help lists preview-url and not the removed command", async () => {
		const run = runWithFakes(["--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("preview-url");
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

	test("unknown command exits 2 and shows top-level help", async () => {
		const run = runWithFakes(["latest-branch-deployment"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Unknown command: latest-branch-deployment");
		expect(run.stderr.join("")).toContain("preview-url");
		expect(run.stdout.join("")).toBe("");
	});

	test("unknown option exits 2", async () => {
		const run = runWithFakes(["preview-url", "--bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Unknown option: --bogus");
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
		const run = runWithFakes(["preview-url", "--json"], { vercel: { available: false } });

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

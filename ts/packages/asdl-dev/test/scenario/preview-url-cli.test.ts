import { describe, expect, test } from "vitest";

import { listAsdlDevCommands, runCli } from "asdl-dev/cli";
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
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (!isRecord(value)) {
		throw new Error("Expected JSON object output.");
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

const TOP_LEVEL_HELP = `Usage: asdl-dev [options] [command]

Developer tools for asdl-tools.

Options:
  --runtime              Show CLI runtime diagnostics and exit.
  -h, --help             display help for command

Commands:
  preview-url [options]  Print the Vercel preview URL for a branch.
  pr-regen [options]     Regenerate the current branch PR's title and
                         description with the asdl PR-description prompt.
`;

describe("asdl-dev preview-url CLI help and parsing", () => {
	test("command metadata comes from the flat command table", () => {
		expect(listAsdlDevCommands()).toEqual([
			{ name: "preview-url", description: "Print the Vercel preview URL for a branch." },
			{
				name: "pr-regen",
				description: "Regenerate the current branch PR's title and description with the asdl PR-description prompt.",
			},
		]);
	});

	test("top-level help lists command-table commands and not the removed command", async () => {
		const run = runWithFakes(["--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("--runtime");
		expect(help).toContain("preview-url");
		expect(help).not.toContain("cp [options]");
		expect(help).not.toContain("submit [options]");
		expect(help).toContain("display help for command");
		expect(help).not.toContain("latest-branch-deployment");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level runtime reports the TypeScript entrypoint", async () => {
		const run = runWithFakes(["--runtime"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("runtime: typescript\nentry_point: asdl-dev bin asdl-dev -> ts/packages/asdl-dev/src/cli.ts\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("command help documents preview-url options", async () => {
		const run = runWithFakes(["preview-url", "--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		// PINNED CLINKR SEMANTICS (commander leaf help bytes): --branch <value> instead of --branch TEXT
		expect(help).toContain("--branch <value>");
		expect(help).toContain("--project <value>");
		expect(help).toContain("--scope <value>");
		expect(help).toContain("--json");
		expect(help).toContain("--json-schema");
		expect(help).not.toContain("--format");
		expect(help).toContain("VERCEL_PROJECT");
		expect(help).toContain("VERCEL_SCOPE");
		expect(help).toContain("-h, --help");
	});

	test("retired submit command is no longer available from asdl-dev", async () => {
		const run = runWithFakes(["submit"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown command 'submit'");
		expect(run.stdout.join("")).toBe("");
	});

	test("unknown command exits 2 with error message", async () => {
		const run = runWithFakes(["latest-branch-deployment"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown command 'latest-branch-deployment'");
		// Unknown commands from clinkr do not dump help
		expect(run.stdout.join("")).toBe("");
	});

	test("retired cp command is no longer available from asdl-dev", async () => {
		const run = runWithFakes(["cp"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown command 'cp'");
		expect(run.stdout.join("")).toBe("");
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([]);
	});

	test("unknown option exits 2", async () => {
		const run = runWithFakes(["preview-url", "--bogus"]);

		expect(await run.exit).toBe(2);
		// PINNED CLINKR SEMANTICS (usage errors): lowercase error: and raw output, no help dump
		expect(run.stderr.join("")).toContain("error: unknown option");
		expect(run.stderr.join("")).not.toContain("Usage: asdl-dev preview-url");
	});

	test("raw commands reject clinkr --format", async () => {
		const run = runWithFakes(["preview-url", "--format", "json"]);

		expect(await run.exit).toBe(2);
		// PINNED CLINKR SEMANTICS (raw command): handler-owned bytes mean no --format dialect.
		expect(run.stderr.join("")).toContain("error: unknown option '--format'");
		expect(run.stdout.join("")).toBe("");
	});

	test("raw commands expose json schema", async () => {
		const run = runWithFakes(["preview-url", "--json-schema"]);

		expect(await run.exit).toBe(0);
		const document = parseJsonOutput(run);
		expect(document).toHaveProperty("input_json_schema");
		expect(document).toHaveProperty("output_json_schema");
		expect(run.stderr.join("")).toBe("");
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
				git: { currentBranch: { type: "detached" } },
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
		const run = runWithFakes(["preview-url", "--json"], { git: { currentBranch: { type: "detached" } } });

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

describe("asdl-dev CLI surface pinning", () => {
	test.each([[[]], [["-h"]], [["--help"]]])("pins top-level help bytes for %j", async (args) => {
		const run = runWithFakes(args);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(TOP_LEVEL_HELP);
		expect(run.stderr.join("")).toBe("");
	});

	test.each([["--version"], ["-V"]])("pins absence of version flag %s", async (flag) => {
		const run = runWithFakes([flag]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(`error: unknown option '${flag}'\n`);
		// PINNED ABSENCE (clinkr-migration): asdl-dev has no top-level --version/-V behavior.
	});

	test("duplicate scalar flags use the last value", async () => {
		const run = runWithFakes(
			["preview-url", "--branch", "feature/old", "--branch", "feature/new", "--json"],
			{
				git: { currentBranch: { type: "detached" } },
				vercel: {
					deployments: [
						deploymentRecord({
							meta: { githubCommitRef: "feature/new", branchAlias: "new-alias.vercel.app" },
							inspection: { id: "dpl_new", url: "new.vercel.app", aliases: ["new-alias.vercel.app"] },
							url: "new.vercel.app",
						}),
					],
				},
			},
		);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run).branch).toBe("feature/new");
		// PINNED CLINKR SEMANTICS (commander scalar flags): duplicate values are last-wins.
	});

	test("supports inline --branch=value syntax", async () => {
		const run = runWithFakes(["preview-url", "--branch=feature/inline", "--json"], {
			git: { currentBranch: { type: "detached" } },
			vercel: {
				deployments: [
					deploymentRecord({
						meta: { githubCommitRef: "feature/inline", branchAlias: "inline-alias.vercel.app" },
						inspection: { id: "dpl_inline", url: "inline.vercel.app", aliases: ["inline-alias.vercel.app"] },
						url: "inline.vercel.app",
					}),
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run).branch).toBe("feature/inline");
		expect(run.git.currentBranchCalls).toEqual([]);
		// PINNED QUIRK (clinkr-migration): asdl-dev accepts --flag=value while enriched-plan, branch-context, and pr-address do not.
	});

	test("pins compact preview-url JSON failure bytes", async () => {
		const run = runWithFakes(["preview-url", "--json"], { git: { currentBranch: { type: "detached" } } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe(
			`${JSON.stringify({
				success: false,
				error: {
					code: "detached_head",
					message: "git branch --show-current returned no current branch.\nCommand: git branch --show-current",
					displayCommand: "git branch --show-current",
				},
			})}\n`,
		);
		expect(run.stderr.join("")).toBe("");
	});

	test("pins compact preview-url JSON success bytes", async () => {
		const run = runWithFakes(["preview-url", "--json"], { vercel: { deployments: [deploymentRecord()] } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			`${JSON.stringify({
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
			})}\n`,
		);
		expect(run.stderr.join("")).toBe("");
	});
});

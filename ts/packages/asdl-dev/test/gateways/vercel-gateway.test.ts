import { describe, expect, test } from "bun:test";

import { RealVercelDeploymentGateway } from "../../src/gateways/vercel.ts";
import { ScriptedCommandRunner, step } from "../support/scripted-command-runner.ts";

function resolverWith(commands: readonly string[]): (name: string) => string | undefined {
	const available = new Set(commands);
	return (name) => (available.has(name) ? name : undefined);
}

function listArgs(project = "asdl-tools", scope = "schrockns-projects", branch = "feature/demo"): string[] {
	return [
		"ls",
		project,
		"--scope",
		scope,
		"--format=json",
		"--status",
		"READY",
		"--environment",
		"preview",
		"-m",
		`githubCommitRef=${branch}`,
		"--non-interactive",
	];
}

function inspectArgs(scope = "schrockns-projects", url = "https://immutable.vercel.app"): string[] {
	return ["inspect", url, "--scope", scope, "--format=json", "--non-interactive"];
}

function deploymentListJson(): string {
	return JSON.stringify({
		deployments: [
			{
				url: "immutable.vercel.app",
				state: "READY",
				createdAt: 1780264074281,
				ready: "1780264085134",
				meta: {
					githubCommitRef: "feature/demo",
					githubPrId: "767",
					githubCommitSha: "abc123",
					branchAlias: "branch-alias.vercel.app",
				},
			},
		],
	});
}

function inspectJson(): string {
	return JSON.stringify({
		id: "dpl_abc123",
		url: "immutable.vercel.app",
		aliases: ["branch-alias.vercel.app"],
	});
}

describe("RealVercelDeploymentGateway listReadyPreviewDeployments", () => {
	test("uses vercel command and githubCommitRef metadata only", async () => {
		const runner = new ScriptedCommandRunner([step("vercel", listArgs(), deploymentListJson())]);
		const gateway = new RealVercelDeploymentGateway({ runner: runner.runner, resolveCommand: resolverWith(["vercel", "bunx"]) });

		const result = await gateway.listReadyPreviewDeployments({
			project: "asdl-tools",
			scope: "schrockns-projects",
			branch: "feature/demo",
			cwd: "/repo",
		});

		expect(result).toEqual({
			ok: true,
			value: [
				{
					url: "immutable.vercel.app",
					state: "READY",
					createdAt: 1780264074281,
					readyAt: 1780264085134,
					meta: {
						githubCommitRef: "feature/demo",
						githubPrId: "767",
						githubCommitSha: "abc123",
						branchAlias: "branch-alias.vercel.app",
					},
				},
			],
		});
		expect(runner.calls).toEqual([{ command: "vercel", args: listArgs(), cwd: "/repo" }]);
		expect(runner.calls[0]?.args.join(" ")).not.toContain("gitCommitRef");
		runner.assertDone();
	});

	test("falls back to bunx vercel@latest when vercel is unavailable", async () => {
		const runner = new ScriptedCommandRunner([step("bunx", ["vercel@latest", ...listArgs()], JSON.stringify({ deployments: [] }))]);
		const gateway = new RealVercelDeploymentGateway({ runner: runner.runner, resolveCommand: resolverWith(["bunx"]) });

		expect(await gateway.listReadyPreviewDeployments({ project: "asdl-tools", scope: "schrockns-projects", branch: "feature/demo", cwd: "/repo" })).toEqual({
			ok: true,
			value: [],
		});
		expect(runner.calls).toEqual([{ command: "bunx", args: ["vercel@latest", ...listArgs()], cwd: "/repo" }]);
		runner.assertDone();
	});

	test("returns vercel_cli_unavailable when neither vercel nor bunx is available", async () => {
		const runner = new ScriptedCommandRunner([]);
		const gateway = new RealVercelDeploymentGateway({ runner: runner.runner, resolveCommand: resolverWith([]) });

		const result = await gateway.listReadyPreviewDeployments({ project: "asdl-tools", scope: "schrockns-projects", branch: "feature/demo", cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.error.code).toBe("vercel_cli_unavailable");
		runner.assertDone();
	});

	test("maps command failures with structured details", async () => {
		const runner = new ScriptedCommandRunner([step("vercel", listArgs(), "", 1, "auth failed")]);
		const gateway = new RealVercelDeploymentGateway({ runner: runner.runner, resolveCommand: resolverWith(["vercel"]) });

		const result = await gateway.listReadyPreviewDeployments({ project: "asdl-tools", scope: "schrockns-projects", branch: "feature/demo", cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.error).toMatchObject({
			code: "vercel_list_failed",
			details: { command: "vercel", args: listArgs(), exit_code: 1, stderr: "auth failed" },
		});
		runner.assertDone();
	});

	test("maps malformed JSON and invalid shapes", async () => {
		const malformed = new ScriptedCommandRunner([step("vercel", listArgs(), "not json")]);
		const malformedGateway = new RealVercelDeploymentGateway({ runner: malformed.runner, resolveCommand: resolverWith(["vercel"]) });

		const malformedResult = await malformedGateway.listReadyPreviewDeployments({ project: "asdl-tools", scope: "schrockns-projects", branch: "feature/demo", cwd: "/repo" });
		expect(malformedResult.ok).toBe(false);
		if (malformedResult.ok) throw new Error("expected malformed failure");
		expect(malformedResult.error.code).toBe("vercel_json_parse_error");
		malformed.assertDone();

		const invalid = new ScriptedCommandRunner([step("vercel", listArgs(), JSON.stringify({ deployments: {} }))]);
		const invalidGateway = new RealVercelDeploymentGateway({ runner: invalid.runner, resolveCommand: resolverWith(["vercel"]) });

		const invalidResult = await invalidGateway.listReadyPreviewDeployments({ project: "asdl-tools", scope: "schrockns-projects", branch: "feature/demo", cwd: "/repo" });
		expect(invalidResult).toEqual({
			ok: false,
			error: {
				code: "vercel_deployment_list_shape_error",
				message: "Vercel deployment list JSON did not contain a deployments array.",
			},
		});
		invalid.assertDone();
	});
});

describe("RealVercelDeploymentGateway inspectDeployment", () => {
	test("uses vercel inspect with normalized https URL", async () => {
		const runner = new ScriptedCommandRunner([step("vercel", inspectArgs(), inspectJson())]);
		const gateway = new RealVercelDeploymentGateway({ runner: runner.runner, resolveCommand: resolverWith(["vercel"]) });

		expect(await gateway.inspectDeployment({ url: "immutable.vercel.app", scope: "schrockns-projects", cwd: "/repo" })).toEqual({
			ok: true,
			value: {
				id: "dpl_abc123",
				url: "immutable.vercel.app",
				aliases: ["branch-alias.vercel.app"],
			},
		});
		expect(runner.calls).toEqual([{ command: "vercel", args: inspectArgs(), cwd: "/repo" }]);
		runner.assertDone();
	});

	test("maps inspect command failure and shape errors", async () => {
		const failed = new ScriptedCommandRunner([step("vercel", inspectArgs(), "", 1, "missing deployment")]);
		const failedGateway = new RealVercelDeploymentGateway({ runner: failed.runner, resolveCommand: resolverWith(["vercel"]) });

		const failedResult = await failedGateway.inspectDeployment({ url: "immutable.vercel.app", scope: "schrockns-projects", cwd: "/repo" });
		expect(failedResult.ok).toBe(false);
		if (failedResult.ok) throw new Error("expected failure");
		expect(failedResult.error).toMatchObject({ code: "vercel_inspect_failed", details: { stderr: "missing deployment" } });
		failed.assertDone();

		const invalid = new ScriptedCommandRunner([step("vercel", inspectArgs(), JSON.stringify({ id: "dpl_abc123" }))]);
		const invalidGateway = new RealVercelDeploymentGateway({ runner: invalid.runner, resolveCommand: resolverWith(["vercel"]) });

		expect(await invalidGateway.inspectDeployment({ url: "immutable.vercel.app", scope: "schrockns-projects", cwd: "/repo" })).toEqual({
			ok: false,
			error: {
				code: "vercel_inspect_shape_error",
				message: "Vercel inspect JSON was missing required id or url fields.",
			},
		});
		invalid.assertDone();
	});
});

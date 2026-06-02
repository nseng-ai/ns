import { describe, expect, test } from "bun:test";

import { deploymentRecord, inspectedDeployment } from "../support/builders.ts";
import {
	InMemoryGitGateway,
	InMemoryVercelDeploymentGateway,
	InMemoryVercelProjectConfigStore,
	inMemoryContext,
} from "../support/in-memory-gateways.ts";

describe("in-memory git gateway", () => {
	test("returns configured branch and repo root while recording narrow logs", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/demo", repoRoot: "/repo" });

		expect(await git.currentBranch({ cwd: "/work" })).toEqual({ ok: true, value: "feature/demo" });
		expect(await git.repoRoot({ cwd: "/work" })).toEqual({ ok: true, value: "/repo" });
		expect(git.currentBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.repoRootCalls).toEqual([{ cwd: "/work" }]);
	});

	test("models detached head and repo-root failure states", async () => {
		const git = new InMemoryGitGateway({
			currentBranch: { kind: "detached" },
			repoRoot: { kind: "failure", error: { code: "repo_root_unresolved", message: "no root" } },
		});

		const branch = await git.currentBranch({ cwd: "/work" });
		expect(branch.ok).toBe(false);
		if (branch.ok) throw new Error("expected branch failure");
		expect(branch.error.code).toBe("detached_head");

		const root = await git.repoRoot({ cwd: "/work" });
		expect(root).toEqual({ ok: false, error: { code: "repo_root_unresolved", message: "no root" } });
	});
});

describe("in-memory Vercel deployment gateway", () => {
	test("filters deployments by project, scope, environment, READY state, and githubCommitRef", async () => {
		const vercel = new InMemoryVercelDeploymentGateway({
			deployments: [
				deploymentRecord({ url: "match.vercel.app", createdAt: 400 }),
				deploymentRecord({ url: "wrong-project.vercel.app", project: "other-project" }),
				deploymentRecord({ url: "wrong-scope.vercel.app", scope: "other-scope" }),
				deploymentRecord({ url: "production.vercel.app", environment: "production" }),
				deploymentRecord({ url: "building.vercel.app", state: "BUILDING" }),
				deploymentRecord({ url: "wrong-branch.vercel.app", meta: { githubCommitRef: "other" } }),
			],
		});

		const listed = await vercel.listReadyPreviewDeployments({
			project: "asdl-tools",
			scope: "schrockns-projects",
			branch: "feature/demo",
			cwd: "/repo",
		});

		expect(listed).toEqual({
			ok: true,
			value: [
				{
					url: "match.vercel.app",
					state: "READY",
					createdAt: 400,
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
		expect(vercel.listCalls).toEqual([{ project: "asdl-tools", scope: "schrockns-projects", branch: "feature/demo", cwd: "/repo" }]);
	});

	test("inspects a matching deployment by URL and scope", async () => {
		const inspection = inspectedDeployment({ id: "dpl_match", url: "match.vercel.app", aliases: ["alias.vercel.app"] });
		const vercel = new InMemoryVercelDeploymentGateway({
			deployments: [deploymentRecord({ url: "match.vercel.app", inspection })],
		});

		expect(await vercel.inspectDeployment({ url: "https://match.vercel.app", scope: "schrockns-projects", cwd: "/repo" })).toEqual({
			ok: true,
			value: inspection,
		});
		expect(vercel.inspectCalls).toEqual([{ url: "https://match.vercel.app", scope: "schrockns-projects", cwd: "/repo" }]);
	});

	test("models unavailable, list failure, and inspect failure states", async () => {
		const unavailable = new InMemoryVercelDeploymentGateway({ available: false });
		const unavailableList = await unavailable.listReadyPreviewDeployments({ project: "asdl-tools", scope: "schrockns-projects", branch: "feature/demo", cwd: "/repo" });
		expect(unavailableList.ok).toBe(false);
		if (unavailableList.ok) throw new Error("expected unavailable failure");
		expect(unavailableList.error.code).toBe("vercel_cli_unavailable");

		const listFailure = new InMemoryVercelDeploymentGateway({ listFailure: { code: "vercel_list_failed", message: "list failed" } });
		expect(await listFailure.listReadyPreviewDeployments({ project: "asdl-tools", scope: "schrockns-projects", branch: "feature/demo", cwd: "/repo" })).toEqual({
			ok: false,
			error: { code: "vercel_list_failed", message: "list failed" },
		});

		const inspectFailure = new InMemoryVercelDeploymentGateway({ inspectFailure: { code: "vercel_inspect_failed", message: "inspect failed" } });
		expect(await inspectFailure.inspectDeployment({ url: "missing.vercel.app", scope: "schrockns-projects", cwd: "/repo" })).toEqual({
			ok: false,
			error: { code: "vercel_inspect_failed", message: "inspect failed" },
		});
	});
});

describe("in-memory project config store", () => {
	test("returns the configured project config variant and records reads", async () => {
		const store = new InMemoryVercelProjectConfigStore({ kind: "found", projectName: "custom-project" });

		expect(await store.readProjectConfig({ repoRoot: "/repo" })).toEqual({ kind: "found", projectName: "custom-project" });
		expect(store.readProjectConfigCalls).toEqual([{ repoRoot: "/repo" }]);
	});
});

describe("in-memory context", () => {
	test("returns an AsdlDevContext plus concrete fake references", async () => {
		const { context, git, vercel, projectConfig } = inMemoryContext({
			vercel: { deployments: [deploymentRecord()] },
			projectConfig: { kind: "missing" },
		});

		expect(context.git).toBe(git);
		expect(context.vercel).toBe(vercel);
		expect(context.projectConfig).toBe(projectConfig);
	});
});

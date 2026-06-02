import { describe, expect, test } from "bun:test";

import {
	DEFAULT_PROJECT,
	DEFAULT_SCOPE,
	buildSuccessPayload,
	dashboardUrl,
	resolvePreviewUrl,
	selectNewestDeployment,
} from "../../src/preview-url.ts";
import { deploymentCandidate, inspectedDeployment } from "../support/builders.ts";
import { InMemoryVercelProjectConfigStore } from "../support/in-memory-gateways.ts";
import { resolveProjectScope } from "../../src/preview-url.ts";

describe("preview URL policy", () => {
	test("prefers branchAlias when it is present in inspected aliases", () => {
		const candidate = deploymentCandidate({
			url: "immutable.vercel.app",
			meta: {
				githubCommitRef: "feature/demo",
				branchAlias: "branch-alias.vercel.app",
			},
		});
		const inspected = inspectedDeployment({ url: "immutable.vercel.app", aliases: ["branch-alias.vercel.app"] });

		expect(resolvePreviewUrl(candidate, inspected)).toBe("https://branch-alias.vercel.app");
	});

	test("falls back to first inspected alias", () => {
		const candidate = deploymentCandidate({
			url: "immutable.vercel.app",
			meta: {
				githubCommitRef: "feature/demo",
				branchAlias: "missing-branch-alias.vercel.app",
			},
		});

		expect(resolvePreviewUrl(candidate, inspectedDeployment({ aliases: ["first-alias.vercel.app"] }))).toBe("https://first-alias.vercel.app");
	});

	test("falls back to immutable deployment URL when no aliases are inspected", () => {
		const candidate = deploymentCandidate({ url: "immutable.vercel.app" });

		expect(resolvePreviewUrl(candidate, inspectedDeployment({ url: "immutable.vercel.app", aliases: [] }))).toBe("https://immutable.vercel.app");
	});
});

describe("preview URL payload policy", () => {
	test("builds dashboard URL by stripping dpl_", () => {
		expect(dashboardUrl("schrockns-projects", "asdl-tools", "dpl_5j6tx8")).toBe(
			"https://vercel.com/schrockns-projects/asdl-tools/5j6tx8",
		);
	});

	test("selects the newest deployment from gateway-returned candidates", () => {
		const selected = selectNewestDeployment([
			deploymentCandidate({ url: "old.vercel.app", createdAt: 100 }),
			deploymentCandidate({ url: "new.vercel.app", createdAt: 300 }),
			deploymentCandidate({ url: "middle.vercel.app", createdAt: 200 }),
		]);

		expect(selected?.url).toBe("new.vercel.app");
	});

	test("builds success payload with deployment metadata, evidence, and warnings", () => {
		const payload = buildSuccessPayload({
			branch: "feature/demo",
			project: "asdl-tools",
			scope: "schrockns-projects",
			candidate: deploymentCandidate({
				readyAt: 123,
				meta: {
					githubCommitRef: "feature/demo",
					githubPrId: "767",
					githubCommitSha: "abc123",
					branchAlias: "branch-alias.vercel.app",
				},
			}),
			inspected: inspectedDeployment({ id: "dpl_abc", url: "immutable.vercel.app", aliases: ["branch-alias.vercel.app"] }),
			warnings: ["watch out"],
		});

		expect(payload).toMatchObject({
			success: true,
			preview_url: "https://branch-alias.vercel.app",
			deployment_url: "https://immutable.vercel.app",
			dashboard_url: "https://vercel.com/schrockns-projects/asdl-tools/abc",
			deployment: {
				id: "dpl_abc",
				created_at_ms: 100,
				ready_at_ms: 123,
				commit_sha: "abc123",
				pr_number: 767,
			},
			evidence: { source: "vercel_github_commit_ref", metadata_keys: ["githubCommitRef"] },
			warnings: ["watch out"],
		});
	});

	test("omits non-numeric PR metadata", () => {
		const payload = buildSuccessPayload({
			branch: "feature/demo",
			project: "asdl-tools",
			scope: "schrockns-projects",
			candidate: deploymentCandidate({ meta: { githubCommitRef: "feature/demo", githubPrId: "not-a-number" } }),
			inspected: inspectedDeployment({ aliases: [] }),
			warnings: [],
		});

		expect(payload.deployment).toEqual({ id: "dpl_abc123", created_at_ms: 100 });
	});
});

describe("project and scope resolution", () => {
	test("uses explicit project and scope before env and config", async () => {
		const projectConfig = new InMemoryVercelProjectConfigStore({ kind: "found", projectName: "config-project" });

		const resolved = await resolveProjectScope({
			explicitProject: "explicit-project",
			explicitScope: "explicit-scope",
			env: { VERCEL_PROJECT: "env-project", VERCEL_SCOPE: "env-scope" },
			repoRoot: "/repo",
			projectConfig,
		});

		expect(resolved).toEqual({ project: "explicit-project", scope: "explicit-scope", warnings: [] });
		expect(projectConfig.readProjectConfigCalls).toEqual([]);
	});

	test("uses env before project config and defaults", async () => {
		const projectConfig = new InMemoryVercelProjectConfigStore({ kind: "found", projectName: "config-project" });

		const resolved = await resolveProjectScope({
			env: { VERCEL_PROJECT: "env-project", VERCEL_SCOPE: "env-scope" },
			repoRoot: "/repo",
			projectConfig,
		});

		expect(resolved).toEqual({ project: "env-project", scope: "env-scope", warnings: [] });
		expect(projectConfig.readProjectConfigCalls).toEqual([]);
	});

	test("uses project config before default project", async () => {
		const resolved = await resolveProjectScope({
			env: {},
			repoRoot: "/repo",
			projectConfig: new InMemoryVercelProjectConfigStore({ kind: "found", projectName: "config-project" }),
		});

		expect(resolved).toEqual({ project: "config-project", scope: DEFAULT_SCOPE, warnings: [] });
	});

	test("uses defaults and warns for invalid project config", async () => {
		const resolved = await resolveProjectScope({
			env: {},
			repoRoot: "/repo",
			projectConfig: new InMemoryVercelProjectConfigStore({ kind: "invalid" }),
		});

		expect(resolved.project).toBe(DEFAULT_PROJECT);
		expect(resolved.scope).toBe(DEFAULT_SCOPE);
		expect(resolved.warnings).toEqual(["/repo/.vercel/project.json did not contain a projectName; using asdl-tools."]);
	});
});

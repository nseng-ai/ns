import { describe, expect, test } from "bun:test";

import {
	buildSuccessPayload,
	dashboardUrl,
	dedupeDeployments,
	parseDeploymentList,
	parseInspectDeployment,
	resolvePreviewUrl,
	selectLatestBranchDeployment,
	type DeploymentCandidate,
	type InspectedDeployment,
} from "../src/deployment-lookup.ts";

function mustParseDeployments(stdout: string): DeploymentCandidate[] {
	const parsed = parseDeploymentList(stdout);
	if (!parsed.ok) throw new Error(parsed.error.message);
	return parsed.value;
}

function mustParseInspect(stdout: string): InspectedDeployment {
	const parsed = parseInspectDeployment(stdout);
	if (!parsed.ok) throw new Error(parsed.error.message);
	return parsed.value;
}

function deployment(overrides: Partial<DeploymentCandidate> = {}): DeploymentCandidate {
	return {
		url: "asdl-tools-old.vercel.app",
		state: "READY",
		createdAt: 100,
		meta: { githubCommitRef: "feature/demo" },
		...overrides,
	};
}

describe("Vercel deployment parsing", () => {
	test("parses Vercel list deployments and preserves metadata", () => {
		const deployments = mustParseDeployments(
			JSON.stringify({
				deployments: [
					{
						url: "asdl-tools-abc.vercel.app",
						state: "READY",
						createdAt: 1780264074281,
						ready: 1780264085134,
						meta: {
							githubCommitRef: "feature/demo",
							githubPrId: "767",
							githubCommitSha: "abc123",
							branchAlias: "asdl-tools-git-feature-demo.vercel.app",
						},
					},
				],
			}),
		);

		expect(deployments).toEqual([
			{
				url: "asdl-tools-abc.vercel.app",
				state: "READY",
				createdAt: 1780264074281,
				readyAt: 1780264085134,
				meta: {
					githubCommitRef: "feature/demo",
					githubPrId: "767",
					githubCommitSha: "abc123",
					branchAlias: "asdl-tools-git-feature-demo.vercel.app",
				},
			},
		]);
	});

	test("returns structured parse errors for malformed JSON", () => {
		const parsed = parseDeploymentList("not json");

		expect(parsed.ok).toBe(false);
		if (parsed.ok) throw new Error("expected parse failure");
		expect(parsed.error.code).toBe("vercel_json_parse_error");
		expect(parsed.error.message).toBe("Vercel deployment list output was not valid JSON.");
		expect(typeof parsed.error.details?.parse_error).toBe("string");
	});

	test("returns structured parse errors for invalid top-level shape", () => {
		const parsed = parseDeploymentList(JSON.stringify({ deployments: {} }));

		expect(parsed).toEqual({
			ok: false,
			error: {
				code: "vercel_deployment_list_shape_error",
				message: "Vercel deployment list JSON did not contain a deployments array.",
			},
		});
	});

	test("parses Vercel inspect output and defaults missing aliases to empty", () => {
		expect(mustParseInspect(JSON.stringify({ id: "dpl_abc", url: "asdl-tools-abc.vercel.app" }))).toEqual({
			id: "dpl_abc",
			url: "asdl-tools-abc.vercel.app",
			aliases: [],
		});
	});
});

describe("deployment selection", () => {
	test("selects the newest READY deployment matching githubCommitRef", () => {
		const selected = selectLatestBranchDeployment(
			[
				deployment({ url: "old.vercel.app", createdAt: 100 }),
				deployment({ url: "new.vercel.app", createdAt: 200 }),
				deployment({ url: "other.vercel.app", createdAt: 300, meta: { githubCommitRef: "other" } }),
				deployment({ url: "building.vercel.app", state: "BUILDING", createdAt: 400 }),
			],
			"feature/demo",
		);

		expect(selected?.url).toBe("new.vercel.app");
	});

	test("accepts gitCommitRef branch metadata", () => {
		const selected = selectLatestBranchDeployment(
			[deployment({ url: "git-meta.vercel.app", meta: { gitCommitRef: "feature/demo" } })],
			"feature/demo",
		);

		expect(selected?.url).toBe("git-meta.vercel.app");
	});

	test("deduplicates deployments by URL while preserving merged metadata", () => {
		const deduped = dedupeDeployments([
			deployment({ url: "same.vercel.app", meta: { githubCommitRef: "feature/demo" } }),
			deployment({ url: "same.vercel.app", meta: { gitCommitRef: "feature/demo" } }),
		]);

		expect(deduped).toEqual([
			{
				url: "same.vercel.app",
				state: "READY",
				createdAt: 100,
				meta: { githubCommitRef: "feature/demo", gitCommitRef: "feature/demo" },
			},
		]);
	});
});

describe("URL and payload construction", () => {
	test("prefers branchAlias when it is present in inspected aliases", () => {
		const candidate = deployment({
			url: "immutable.vercel.app",
			meta: {
				githubCommitRef: "feature/demo",
				branchAlias: "branch-alias.vercel.app",
			},
		});
		const inspected = { id: "dpl_abc", url: "immutable.vercel.app", aliases: ["branch-alias.vercel.app"] };

		expect(resolvePreviewUrl(candidate, inspected)).toBe("https://branch-alias.vercel.app");
	});

	test("falls back to first inspected alias, then immutable deployment URL", () => {
		const candidate = deployment({ url: "immutable.vercel.app" });
		expect(resolvePreviewUrl(candidate, { id: "dpl_abc", url: "immutable.vercel.app", aliases: ["first-alias.vercel.app"] })).toBe(
			"https://first-alias.vercel.app",
		);
		expect(resolvePreviewUrl(candidate, { id: "dpl_abc", url: "immutable.vercel.app", aliases: [] })).toBe(
			"https://immutable.vercel.app",
		);
	});

	test("builds dashboard URL by stripping dpl_", () => {
		expect(dashboardUrl("schrockns-projects", "asdl-tools", "dpl_5j6tx8")).toBe(
			"https://vercel.com/schrockns-projects/asdl-tools/5j6tx8",
		);
	});

	test("builds success payload with numeric PR only when present and numeric", () => {
		const inspected = { id: "dpl_abc", url: "immutable.vercel.app", aliases: [] };
		const withPr = buildSuccessPayload({
			branch: "feature/demo",
			project: "asdl-tools",
			scope: "schrockns-projects",
			candidate: deployment({ readyAt: 123, meta: { githubCommitRef: "feature/demo", githubPrId: "767", githubCommitSha: "abc123" } }),
			inspected,
			warnings: [],
		});
		const withoutPr = buildSuccessPayload({
			branch: "feature/demo",
			project: "asdl-tools",
			scope: "schrockns-projects",
			candidate: deployment({ meta: { githubCommitRef: "feature/demo", githubPrId: "not-a-number" } }),
			inspected,
			warnings: [],
		});

		expect(withPr.deployment).toEqual({
			id: "dpl_abc",
			created_at_ms: 100,
			ready_at_ms: 123,
			commit_sha: "abc123",
			pr_number: 767,
		});
		expect(withoutPr.deployment).toEqual({ id: "dpl_abc", created_at_ms: 100 });
		expect(withoutPr.success).toBe(true);
	});
});

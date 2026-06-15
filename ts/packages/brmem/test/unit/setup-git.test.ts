import { describe, expect, it } from "vitest";

import { buildGitSetupPlan } from "../../src/operations/setup-git.ts";

const brmemRefspec = "refs/brmem/*:refs/brmem/*";

describe("buildGitSetupPlan", () => {
	it("adds HEAD plus Branch Memory push and fetch refspecs for fresh remote push config", () => {
		const plan = buildGitSetupPlan({
			remote: "origin",
			existing: { push: [], fetch: ["+refs/heads/*:refs/remotes/origin/*"] },
		});

		expect(plan.additions).toEqual([
			{ key: "remote.origin.push", value: "HEAD", reason: "preserve-default-push" },
			{ key: "remote.origin.push", value: brmemRefspec, reason: "branch-memory-push" },
			{ key: "remote.origin.fetch", value: brmemRefspec, reason: "branch-memory-fetch" },
		]);
	});

	it("preserves existing custom push policy instead of adding HEAD", () => {
		const plan = buildGitSetupPlan({
			remote: "upstream",
			existing: { push: ["refs/heads/main:refs/heads/main"], fetch: ["+refs/heads/*:refs/remotes/upstream/*"] },
		});

		expect(plan.additions).toEqual([
			{ key: "remote.upstream.push", value: brmemRefspec, reason: "branch-memory-push" },
			{ key: "remote.upstream.fetch", value: brmemRefspec, reason: "branch-memory-fetch" },
		]);
	});

	it("is idempotent when Branch Memory push and fetch refspecs already exist", () => {
		const plan = buildGitSetupPlan({
			remote: "origin",
			existing: { push: ["HEAD", brmemRefspec], fetch: ["+refs/heads/*:refs/remotes/origin/*", brmemRefspec] },
		});

		expect(plan.additions).toEqual([]);
	});
});

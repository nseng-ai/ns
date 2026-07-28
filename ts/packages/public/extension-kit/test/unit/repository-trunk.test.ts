import { describe, expect, test } from "vitest";

import {
	resolveRepositoryTrunk,
	validateRepositoryTrunkReadiness,
	type RepositoryTrunk,
	type RepositoryTrunkConfig,
	type RepositoryTrunkConfigError,
	type RepositoryTrunkConfigLoader,
} from "@nseng-ai/extension-kit/repository-trunk";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { Result } from "@nseng-ai/foundation/result";

const ROOT = "/repo";
const LOCAL_MAIN = "refs/heads/main";
const REMOTE_MAIN = "refs/remotes/origin/main";
const REMOTE_HEAD = "refs/remotes/origin/HEAD";
const TRUNK: RepositoryTrunk = {
	branch: "main",
	remote: "origin",
	localRef: LOCAL_MAIN,
	remoteTrackingRef: REMOTE_MAIN,
	source: "configured",
};

function loader(
	result: Result<RepositoryTrunkConfig, RepositoryTrunkConfigError>,
): RepositoryTrunkConfigLoader {
	return { load: () => result };
}

function config(value: RepositoryTrunkConfig): RepositoryTrunkConfigLoader {
	return loader({ ok: true, value });
}

async function resolve(
	git: InMemoryGitGateway,
	configLoader: RepositoryTrunkConfigLoader = config({ remote: "origin" }),
) {
	return resolveRepositoryTrunk({ repoRoot: ROOT, git, config: configLoader });
}

function configuredGit(overrides: ConstructorParameters<typeof InMemoryGitGateway>[0] = {}) {
	return new InMemoryGitGateway(overrides);
}

function validate(git: InMemoryGitGateway, requiredRefs: readonly ("local" | "remote-tracking")[]) {
	return validateRepositoryTrunkReadiness({ repoRoot: ROOT, git, trunk: TRUNK, requiredRefs });
}

describe("repository trunk identity", () => {
	test("propagates config read failures", async () => {
		const result = await resolve(
			configuredGit(),
			loader({
				ok: false,
				error: { code: "config-read-failed", message: "Failed to read ns.toml: denied" },
			}),
		);
		expect(result).toEqual({
			ok: false,
			error: { code: "config-read-failed", message: "Failed to read ns.toml: denied" },
		});
	});

	test("propagates invalid config", async () => {
		const result = await resolve(
			configuredGit(),
			loader({
				ok: false,
				error: { code: "config-invalid", message: "ns.toml: invalid [git]" },
			}),
		);
		expect(result).toMatchObject({ ok: false, error: { code: "config-invalid" } });
	});

	test("resolves a configured literal slash branch without refs or presence probes", async () => {
		const branch = "release/stable";
		const git = configuredGit();
		const result = await resolve(git, config({ remote: "company", trunk: branch }));
		expect(result).toEqual({
			ok: true,
			value: {
				branch,
				remote: "company",
				localRef: `refs/heads/${branch}`,
				remoteTrackingRef: `refs/remotes/company/${branch}`,
				source: "configured",
			},
		});
		expect(git.symbolicRefCalls).toEqual([]);
		expect(git.exactRefPresenceCalls).toEqual([]);
	});

	test("resolves cached remote HEAD offline without requiring branch refs", async () => {
		const git = configuredGit({ symbolicRefs: { [REMOTE_HEAD]: REMOTE_MAIN } });
		expect(await resolve(git)).toEqual({
			ok: true,
			value: { ...TRUNK, source: "cached-remote-head" },
		});
		expect(git.exactRefPresenceCalls).toEqual([]);
	});

	test("rejects an invalid remote before constructing unsafe lookup refs", async () => {
		const git = configuredGit({ invalidRefNames: ["refs/remotes/bad remote/trunk-validation"] });
		const result = await resolve(git, config({ remote: "bad remote", trunk: "main" }));
		expect(result).toMatchObject({ ok: false, error: { code: "remote-invalid" } });
		expect(git.symbolicRefCalls).toEqual([]);
		expect(git.exactRefPresenceCalls).toEqual([]);
	});

	test("rejects an invalid configured branch", async () => {
		const git = configuredGit({ invalidBranchNames: ["bad branch"] });
		const result = await resolve(git, config({ remote: "origin", trunk: "bad branch" }));
		expect(result).toMatchObject({ ok: false, error: { code: "branch-invalid" } });
	});

	test("reports a missing cached remote HEAD with offline recovery guidance", async () => {
		const result = await resolve(configuredGit());
		expect(result).toMatchObject({
			ok: false,
			error: { code: "cached-remote-head-missing" },
		});
		if (result.ok) throw new Error("expected failure");
		expect(result.error.message).toContain("Resolution is offline");
	});

	test("rejects malformed cached remote HEAD targets", async () => {
		for (const target of ["", REMOTE_HEAD, "refs/remotes/upstream/main"]) {
			const result = await resolve(configuredGit({ symbolicRefs: { [REMOTE_HEAD]: target } }));
			expect(result).toMatchObject({
				ok: false,
				error: { code: "cached-remote-head-malformed" },
			});
		}
	});

	test("wraps neutral Git failures with their cause", async () => {
		const cause = { code: "git_symbolic_ref_failed", message: "git was interrupted" };
		const git = configuredGit({
			symbolicRefs: { [REMOTE_HEAD]: { type: "failure", error: cause } },
		});
		const result = await resolve(git);
		expect(result).toEqual({
			ok: false,
			error: {
				code: "git-failed",
				message: "Git failed while attempting to read the cached remote HEAD. git was interrupted",
				cause,
			},
		});
	});
});

describe("repository trunk readiness", () => {
	test("validates only the local ref", async () => {
		const git = configuredGit({ existingRefs: [LOCAL_MAIN] });
		expect(await validate(git, ["local"])).toEqual({ ok: true, value: TRUNK });
		expect(git.exactRefPresenceCalls).toEqual([{ cwd: ROOT, ref: LOCAL_MAIN }]);
	});

	test("validates only the remote-tracking ref", async () => {
		const git = configuredGit({ existingRefs: [REMOTE_MAIN] });
		expect(await validate(git, ["remote-tracking"])).toEqual({ ok: true, value: TRUNK });
		expect(git.exactRefPresenceCalls).toEqual([{ cwd: ROOT, ref: REMOTE_MAIN }]);
	});

	test("normalizes duplicates and validates local then remote deterministically", async () => {
		const git = configuredGit({ existingRefs: [LOCAL_MAIN, REMOTE_MAIN] });
		expect(await validate(git, ["remote-tracking", "local", "remote-tracking", "local"])).toEqual({
			ok: true,
			value: TRUNK,
		});
		expect(git.exactRefPresenceCalls).toEqual([
			{ cwd: ROOT, ref: LOCAL_MAIN },
			{ cwd: ROOT, ref: REMOTE_MAIN },
		]);
	});

	test("reports a missing local ref and does not probe the opposite ref", async () => {
		const git = configuredGit({ existingRefs: [REMOTE_MAIN] });
		const result = await validate(git, ["local"]);
		expect(result).toEqual({
			ok: false,
			error: {
				code: "local-branch-missing",
				message: `Repository trunk local ref \`${LOCAL_MAIN}\` is missing. Create a local branch \`main\` from \`${REMOTE_MAIN}\` after fetching if needed.`,
			},
		});
		expect(git.exactRefPresenceCalls).toEqual([{ cwd: ROOT, ref: LOCAL_MAIN }]);
	});

	test("reports a missing remote-tracking ref and does not probe the opposite ref", async () => {
		const git = configuredGit({ existingRefs: [LOCAL_MAIN] });
		const result = await validate(git, ["remote-tracking"]);
		expect(result).toEqual({
			ok: false,
			error: {
				code: "remote-tracking-branch-missing",
				message: `Repository trunk tracking ref \`${REMOTE_MAIN}\` is missing. Fetch remote \`origin\`; cached remote HEAD data may be stale.`,
			},
		});
		expect(git.exactRefPresenceCalls).toEqual([{ cwd: ROOT, ref: REMOTE_MAIN }]);
	});

	test("preserves a Git failure cause", async () => {
		const cause = { code: "git_show_ref_failed", message: "git was interrupted" };
		const git = configuredGit({ exactRefPresenceFailures: { [LOCAL_MAIN]: cause } });
		expect(await validate(git, ["local"])).toEqual({
			ok: false,
			error: {
				code: "git-failed",
				message: `Git failed while attempting to check required ref \`${LOCAL_MAIN}\`. git was interrupted`,
				cause,
			},
		});
	});

	test("rejects an empty requirement as a programmer error without probing", async () => {
		const git = configuredGit();
		await expect(validate(git, [])).rejects.toThrow(
			"Repository trunk readiness requires at least one ref kind.",
		);
		expect(git.exactRefPresenceCalls).toEqual([]);
	});
});

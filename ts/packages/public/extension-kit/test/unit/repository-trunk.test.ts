import { describe, expect, test } from "vitest";

import {
	resolveRepositoryTrunk,
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
	return new InMemoryGitGateway({ existingRefs: [LOCAL_MAIN, REMOTE_MAIN], ...overrides });
}

describe("repository trunk", () => {
	test("1. propagates config read failures", async () => {
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

	test("2. propagates invalid config", async () => {
		const result = await resolve(
			configuredGit(),
			loader({
				ok: false,
				error: { code: "config-invalid", message: "ns.toml: invalid [git]" },
			}),
		);
		expect(result).toMatchObject({ ok: false, error: { code: "config-invalid" } });
	});

	test("3. resolves a configured literal slash branch without reading remote HEAD", async () => {
		const branch = "release/stable";
		const git = configuredGit({
			existingRefs: [`refs/heads/${branch}`, `refs/remotes/company/${branch}`],
		});
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
	});

	test("4. resolves cached remote HEAD offline and preserves provenance", async () => {
		const git = configuredGit({ symbolicRefs: { [REMOTE_HEAD]: REMOTE_MAIN } });
		expect(await resolve(git)).toEqual({
			ok: true,
			value: {
				branch: "main",
				remote: "origin",
				localRef: LOCAL_MAIN,
				remoteTrackingRef: REMOTE_MAIN,
				source: "cached-remote-head",
			},
		});
	});

	test("5. rejects an invalid remote before constructing unsafe lookup refs", async () => {
		const git = configuredGit({ invalidRefNames: ["refs/remotes/bad remote/trunk-validation"] });
		const result = await resolve(git, config({ remote: "bad remote", trunk: "main" }));
		expect(result).toMatchObject({ ok: false, error: { code: "remote-invalid" } });
		expect(git.symbolicRefCalls).toEqual([]);
		expect(git.exactRefPresenceCalls).toEqual([]);
	});

	test("6. rejects an invalid configured branch", async () => {
		const git = configuredGit({ invalidBranchNames: ["bad branch"] });
		const result = await resolve(git, config({ remote: "origin", trunk: "bad branch" }));
		expect(result).toMatchObject({ ok: false, error: { code: "branch-invalid" } });
	});

	test("7. reports a missing cached remote HEAD with offline recovery guidance", async () => {
		const result = await resolve(configuredGit());
		expect(result).toMatchObject({
			ok: false,
			error: { code: "cached-remote-head-missing" },
		});
		if (result.ok) throw new Error("expected failure");
		expect(result.error.message).toContain("Resolution is offline");
	});

	test("8. rejects an empty cached remote HEAD target", async () => {
		const result = await resolve(configuredGit({ symbolicRefs: { [REMOTE_HEAD]: "" } }));
		expect(result).toMatchObject({ ok: false, error: { code: "cached-remote-head-malformed" } });
	});

	test("9. rejects a self-referential cached remote HEAD", async () => {
		const result = await resolve(configuredGit({ symbolicRefs: { [REMOTE_HEAD]: REMOTE_HEAD } }));
		expect(result).toMatchObject({ ok: false, error: { code: "cached-remote-head-malformed" } });
	});

	test("10. rejects a cross-remote cached remote HEAD", async () => {
		const result = await resolve(
			configuredGit({ symbolicRefs: { [REMOTE_HEAD]: "refs/remotes/upstream/main" } }),
		);
		expect(result).toMatchObject({ ok: false, error: { code: "cached-remote-head-malformed" } });
	});

	test("11. requires the exact local branch ref", async () => {
		const git = configuredGit({
			symbolicRefs: { [REMOTE_HEAD]: REMOTE_MAIN },
			existingRefs: [REMOTE_MAIN],
		});
		const result = await resolve(git);
		expect(result).toMatchObject({ ok: false, error: { code: "local-branch-missing" } });
	});

	test("12. requires the exact remote-tracking branch ref", async () => {
		const git = configuredGit({
			symbolicRefs: { [REMOTE_HEAD]: REMOTE_MAIN },
			existingRefs: [LOCAL_MAIN],
		});
		const result = await resolve(git);
		expect(result).toMatchObject({
			ok: false,
			error: { code: "remote-tracking-branch-missing" },
		});
	});

	test("13. wraps neutral Git failures with their cause", async () => {
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

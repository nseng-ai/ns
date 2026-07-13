import { describe, expect, it } from "vitest";

import type { MintPurpose } from "../../src/mint/contracts.ts";
import {
	createDispatchTokenMinter,
	type GitHubInstallationTokenGateway,
	type GitHubInstallationTokenResult,
} from "../../src/mint/mint-core.ts";

class InMemoryGitHubInstallationTokenGateway implements GitHubInstallationTokenGateway {
	readonly #result: GitHubInstallationTokenResult;
	readonly calls: Array<{ repository: string; purpose: MintPurpose }> = [];

	constructor(result: GitHubInstallationTokenResult) {
		this.#result = result;
	}

	async mintRepositoryToken(options: {
		readonly repository: string;
		readonly purpose: MintPurpose;
	}): Promise<GitHubInstallationTokenResult> {
		this.calls.push({ ...options });
		return this.#result;
	}
}

function successfulGitHubResult(): GitHubInstallationTokenResult {
	return {
		ok: true,
		value: { token: "installation-token", expiresAt: "2026-07-12T18:00:00Z" },
	};
}

function createMinter(
	options: { github?: InMemoryGitHubInstallationTokenGateway; configuredRepository?: string } = {},
) {
	const github =
		options.github ?? new InMemoryGitHubInstallationTokenGateway(successfulGitHubResult());
	const minter = createDispatchTokenMinter({
		repository: options.configuredRepository ?? "nseng-ai/ns",
		github,
	});
	return { minter, github };
}

describe("createDispatchTokenMinter", () => {
	it.each(["clone", "landing"] as const)(
		"mints a %s token for the configured repository",
		async (purpose) => {
			const { minter, github } = createMinter();

			const result = await minter.mintDispatchToken({ repository: "nseng-ai/ns", purpose });

			expect(result).toEqual({
				ok: true,
				value: {
					token: "installation-token",
					expiresAt: "2026-07-12T18:00:00Z",
					repository: "nseng-ai/ns",
					purpose,
				},
			});
			expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose }]);
		},
	);

	it("normalizes repository casing on both sides of the constraint", async () => {
		const { minter, github } = createMinter({ configuredRepository: "NSENG-AI/NS" });

		const result = await minter.mintDispatchToken({
			repository: "NsEng-AI/Ns",
			purpose: "clone",
		});

		expect(result.ok).toBe(true);
		expect(github.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
	});

	it("refuses a valid repository other than the configured repository", async () => {
		const { minter, github } = createMinter();

		const result = await minter.mintDispatchToken({
			repository: "nseng-ai/other",
			purpose: "clone",
		});

		expect(result).toEqual({ ok: false, error: { code: "repository-not-allowed" } });
		expect(github.calls).toEqual([]);
	});

	it.each([
		["repository URL", "https://github.com/nseng-ai/ns"],
		["git suffix", "nseng-ai/ns.git"],
		["nested path", "nseng-ai/ns/subdir"],
		["empty string", ""],
	] as const)("refuses a malformed repository (%s) without minting", async (_name, repository) => {
		const { minter, github } = createMinter();

		const result = await minter.mintDispatchToken({ repository, purpose: "landing" });

		expect(result).toEqual({ ok: false, error: { code: "repository-not-allowed" } });
		expect(github.calls).toEqual([]);
	});

	it("returns only a stable code when GitHub minting fails", async () => {
		const github = new InMemoryGitHubInstallationTokenGateway({ ok: false });
		const { minter } = createMinter({ github });

		const result = await minter.mintDispatchToken({
			repository: "nseng-ai/ns",
			purpose: "landing",
		});

		expect(result).toEqual({ ok: false, error: { code: "github-token-mint-failed" } });
	});
});

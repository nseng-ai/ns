// The mint core: exact-repository constraint enforcement plus GitHub App
// installation-token minting behind the GitHubInstallationTokenGateway seam.
// Both callers named in the credentials design sit above this module:
// - the dispatch workflow mints in-process (clone token at sandbox creation,
//   landing token at landing time) with no HTTP hop;
// - the `POST /api/mint` route stays a thin adapter that authenticates the
//   Development caller and delegates here.
// Token material must never be logged, echoed, or persisted; failures carry
// stable codes only.
import { normalizeGitHubRepository, parseGitHubRepository, type MintPurpose } from "./contracts.ts";
import type { MintRuntimeConfig } from "./runtime-config.ts";

export interface GitHubInstallationToken {
	readonly token: string;
	readonly expiresAt: string;
}

export type GitHubInstallationTokenResult =
	| { readonly ok: true; readonly value: GitHubInstallationToken }
	| { readonly ok: false };

export interface GitHubInstallationTokenGateway {
	mintRepositoryToken(options: {
		readonly repository: string;
		readonly purpose: MintPurpose;
	}): Promise<GitHubInstallationTokenResult>;
}

export interface MintedDispatchToken {
	readonly token: string;
	readonly expiresAt: string;
	readonly repository: string;
	readonly purpose: MintPurpose;
}

export type DispatchTokenMintErrorCode = "repository-not-allowed" | "github-token-mint-failed";

export type DispatchTokenMintResult =
	| { readonly ok: true; readonly value: MintedDispatchToken }
	| { readonly ok: false; readonly error: { readonly code: DispatchTokenMintErrorCode } };

export interface DispatchTokenMinter {
	mintDispatchToken(options: {
		readonly repository: string;
		readonly purpose: MintPurpose;
	}): Promise<DispatchTokenMintResult>;
}

export interface DispatchTokenMinterOptions {
	readonly config: Pick<MintRuntimeConfig, "githubRepository">;
	readonly github: GitHubInstallationTokenGateway;
}

export function createDispatchTokenMinter(
	options: DispatchTokenMinterOptions,
): DispatchTokenMinter {
	const allowedRepository = normalizeGitHubRepository(options.config.githubRepository);
	return {
		async mintDispatchToken(request) {
			// `=== false` rather than `!`: the Vercel builder typechecks without
			// strictNullChecks, where truthiness checks do not narrow the union.
			const repositoryResult = parseGitHubRepository(request.repository);
			if (repositoryResult.ok === false || repositoryResult.value !== allowedRepository) {
				return { ok: false, error: { code: "repository-not-allowed" } };
			}

			const mintResult = await options.github.mintRepositoryToken({
				repository: repositoryResult.value,
				purpose: request.purpose,
			});
			if (mintResult.ok === false) {
				return { ok: false, error: { code: "github-token-mint-failed" } };
			}

			return {
				ok: true,
				value: {
					token: mintResult.value.token,
					expiresAt: mintResult.value.expiresAt,
					repository: repositoryResult.value,
					purpose: request.purpose,
				},
			};
		},
	};
}

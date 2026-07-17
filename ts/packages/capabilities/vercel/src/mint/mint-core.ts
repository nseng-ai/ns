// The mint core: exact-repository constraint enforcement plus GitHub App
// installation-token minting behind the GitHubInstallationTokenGateway seam.
// Both callers named in the credentials design sit above this module:
// - the dispatch workflow mints in-process (clone token at sandbox creation,
//   landing token at landing time) with no HTTP hop;
// - the `POST /api/mint` route stays a thin adapter that authenticates the
//   Development caller and delegates here.
// Token material must never be logged, echoed, or persisted. Internal failure
// diagnostics may accompany stable codes but public adapters must project only
// their established safe contracts.
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { normalizeGitHubRepository, parseGitHubRepository, type MintPurpose } from "./contracts.ts";

export interface GitHubInstallationToken {
	readonly token: string;
	readonly expiresAt: string;
}

export type GitHubInstallationTokenResult =
	| { readonly ok: true; readonly value: GitHubInstallationToken }
	| { readonly ok: false; readonly message?: string };

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
	| {
			readonly ok: false;
			readonly error: { readonly code: DispatchTokenMintErrorCode; readonly message?: string };
	  };

export interface DispatchTokenMinter {
	mintDispatchToken(options: {
		readonly repository: string;
		readonly purpose: MintPurpose;
	}): Promise<DispatchTokenMintResult>;
}

export interface DispatchTokenMinterOptions {
	readonly repository: string;
	readonly github: GitHubInstallationTokenGateway;
}

export function createDispatchTokenMinter(
	options: DispatchTokenMinterOptions,
): DispatchTokenMinter {
	const allowedRepository = normalizeGitHubRepository(options.repository);
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
				return {
					ok: false,
					error: {
						code: "github-token-mint-failed",
						...optionalEntry("message", mintResult.message),
					},
				};
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

import { z } from "zod";

export const mintPurposeValues = ["clone", "landing"] as const;

export type MintPurpose = (typeof mintPurposeValues)[number];

export interface MintSuccess {
	readonly token: string;
	readonly expiresAt: string;
	readonly repository: string;
	readonly purpose: MintPurpose;
}

export type MintErrorCode =
	| "github-token-mint-failed"
	| "invalid-request"
	| "mint-endpoint-misconfigured"
	| "forbidden"
	| "unauthorized";

export interface MintError {
	readonly code: MintErrorCode;
	readonly message: string;
}

export type MintResponse =
	| { readonly status: 200; readonly body: MintSuccess }
	| { readonly status: 400 | 401 | 403 | 500 | 502; readonly body: { readonly error: MintError } };

export type GitHubRepositoryPermissions =
	| { readonly contents: "read" }
	| {
			readonly contents: "write";
			readonly pull_requests: "write";
			readonly issues: "write";
	  };

const githubRepositorySchema = z
	.string()
	.regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/)
	.refine((repository) => {
		const name = repository.slice(repository.indexOf("/") + 1);
		return name !== "." && name !== ".." && !name.toLowerCase().endsWith(".git");
	})
	.transform(normalizeGitHubRepository);

export const mintRequestSchema = z.strictObject({
	repository: githubRepositorySchema,
	purpose: z.enum(mintPurposeValues),
});

export type MintRequest = z.infer<typeof mintRequestSchema>;

export function parseGitHubRepository(
	repository: unknown,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
	const result = githubRepositorySchema.safeParse(repository);
	if (!result.success) return { ok: false };
	return { ok: true, value: result.data };
}

export function normalizeGitHubRepository(repository: string): string {
	return repository.toLowerCase();
}

export function githubPermissionsForPurpose(purpose: MintPurpose): GitHubRepositoryPermissions {
	if (purpose === "clone") return { contents: "read" };
	return {
		contents: "write",
		pull_requests: "write",
		issues: "write",
	};
}

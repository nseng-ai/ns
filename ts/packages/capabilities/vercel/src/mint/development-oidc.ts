// The verified Development-caller trust machinery shared by the deployable's
// authenticated routes (`POST /api/mint` and the workflow trigger/observe
// routes): a Vercel OIDC token presented on the dispatch-owned
// `x-ns-dispatch-oidc-token` header, verified against the configured issuer
// and audience, then matched against the exact team, project, and
// `development` environment. The caller-owned header exists because Vercel
// replaces its reserved `x-vercel-oidc-token` request header with the
// Function's own workload identity.

export interface VercelOidcIdentity {
	readonly ownerId: string;
	readonly projectId: string;
	readonly environment: string;
}

export type VercelOidcVerificationResult =
	| { readonly ok: true; readonly value: VercelOidcIdentity }
	| { readonly ok: false };

export interface VercelOidcGateway {
	verifyDevelopmentIdentity(options: {
		readonly token: string;
		readonly issuer: string;
		readonly audience: string;
	}): Promise<VercelOidcVerificationResult>;
}

export interface DevelopmentCallerExpectation {
	readonly issuer: string;
	readonly audience: string;
	readonly teamId: string;
	readonly projectId: string;
}

export type DevelopmentCallerAuthentication =
	| { readonly ok: true }
	| { readonly ok: false; readonly status: 401 | 403 };

export async function authenticateDevelopmentCaller(
	token: string | null,
	expectation: DevelopmentCallerExpectation,
	oidc: VercelOidcGateway,
): Promise<DevelopmentCallerAuthentication> {
	if (token === null || token.length === 0) return { ok: false, status: 401 };
	const result = await oidc.verifyDevelopmentIdentity({
		token,
		issuer: expectation.issuer,
		audience: expectation.audience,
	});
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (result.ok === false) return { ok: false, status: 401 };
	if (
		result.value.ownerId !== expectation.teamId ||
		result.value.projectId !== expectation.projectId ||
		result.value.environment !== "development"
	) {
		return { ok: false, status: 403 };
	}
	return { ok: true };
}

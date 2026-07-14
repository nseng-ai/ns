import type {
	VercelOidcGateway,
	VercelOidcVerificationResult,
} from "../../src/auth/development-oidc.ts";
import type { OidcTrustEnvironment } from "../../src/auth/oidc-trust-config.ts";

export const DEVELOPMENT_OIDC_TRUST_ENVIRONMENT = {
	NS_DISPATCH_VERCEL_TEAM_ID: "team_dispatch",
	NS_DISPATCH_VERCEL_PROJECT_ID: "prj_dispatch",
	NS_DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/nseng-ai",
	NS_DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/nseng-ai",
} as const satisfies OidcTrustEnvironment;

export function developmentOidcIdentity(): VercelOidcVerificationResult {
	return {
		ok: true,
		value: {
			ownerId: "team_dispatch",
			projectId: "prj_dispatch",
			environment: "development",
		},
	};
}

export class InMemoryVercelOidcGateway implements VercelOidcGateway {
	readonly #result: VercelOidcVerificationResult;
	readonly tokens: string[] = [];

	constructor(result: VercelOidcVerificationResult = developmentOidcIdentity()) {
		this.#result = result;
	}

	async verifyDevelopmentIdentity(token: string): Promise<VercelOidcVerificationResult> {
		this.tokens.push(token);
		return this.#result;
	}
}

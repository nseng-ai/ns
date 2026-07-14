import {
	createDevelopmentCallerAuthenticator,
	createJoseDevelopmentCallerAuthenticator,
	type VercelOidcGateway,
} from "../src/auth/development-oidc.ts";
import type { OidcTrustConfig } from "../src/auth/oidc-trust-config.ts";
import { jsonResponse, readJsonBody } from "../src/http/http.ts";
import { DISPATCH_OIDC_HEADER_NAME, httpErrorBody } from "../src/http/wire.ts";
import { handleMintRequest } from "../src/mint/handle-mint-request.ts";
import {
	createDispatchTokenMinter,
	type GitHubInstallationTokenGateway,
} from "../src/mint/mint-core.ts";
import {
	createGitHubInstallationTokenGateway,
	type GitHubAppAuthenticationConfig,
} from "../src/mint/real-gateways.ts";
import {
	parseGitHubAppMintConfig,
	parseMintOidcTrustConfig,
	type MintEndpointConfigError,
	type MintEnvironment,
} from "../src/mint/runtime-config.ts";

export type MintPostHandler = (request: Request) => Promise<Response>;

export interface MintPostHandlerOptions {
	readonly environment: MintEnvironment;
	readonly createOidcGateway?: (config: OidcTrustConfig) => VercelOidcGateway;
	readonly createGitHubGateway?: (
		config: GitHubAppAuthenticationConfig,
	) => GitHubInstallationTokenGateway;
}

export function createMintPostHandler(options: MintPostHandlerOptions): MintPostHandler {
	const appConfigResult = parseGitHubAppMintConfig(options.environment);
	if (appConfigResult.ok === false) return misconfiguredHandler(appConfigResult.error);
	const oidcTrustResult = parseMintOidcTrustConfig(options.environment);
	if (oidcTrustResult.ok === false) return misconfiguredHandler(oidcTrustResult.error);

	const appConfig = appConfigResult.value;
	const oidcTrust = oidcTrustResult.value;
	const developmentCaller =
		options.createOidcGateway === undefined
			? createJoseDevelopmentCallerAuthenticator(oidcTrust)
			: createDevelopmentCallerAuthenticator(oidcTrust, options.createOidcGateway(oidcTrust));
	const githubAuthentication = {
		githubAppId: appConfig.githubAppId,
		githubAppInstallationId: appConfig.githubAppInstallationId,
		githubAppPrivateKey: appConfig.githubAppPrivateKey,
	};
	const github =
		options.createGitHubGateway?.(githubAuthentication) ??
		createGitHubInstallationTokenGateway(githubAuthentication);
	const minter = createDispatchTokenMinter({ repository: appConfig.githubRepository, github });

	return async function mintPostHandler(request) {
		const bodyResult = await readJsonBody(request);
		if (bodyResult.ok === false) {
			return jsonResponse(httpErrorBody("invalid-request", "Invalid mint request."), 400);
		}

		const result = await handleMintRequest(
			{
				body: bodyResult.value,
				oidcToken: request.headers.get(DISPATCH_OIDC_HEADER_NAME),
			},
			{ developmentCaller, minter },
		);
		return jsonResponse(result.body, result.status);
	};
}

const productionHandler = createMintPostHandler({ environment: process.env });

export async function POST(request: Request): Promise<Response> {
	return productionHandler(request);
}

function misconfiguredHandler(error: MintEndpointConfigError): MintPostHandler {
	return async () => jsonResponse(httpErrorBody(error.code, error.message), 500);
}

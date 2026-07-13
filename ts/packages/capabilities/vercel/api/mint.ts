import type { VercelOidcGateway } from "../src/mint/development-oidc.ts";
import { handleMintRequest } from "../src/mint/handle-mint-request.ts";
import {
	createDispatchTokenMinter,
	type GitHubInstallationTokenGateway,
} from "../src/mint/mint-core.ts";
import type { OidcTrustConfig } from "../src/mint/oidc-trust-config.ts";
import {
	createGitHubInstallationTokenGateway,
	createJoseVercelOidcGateway,
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
	const oidc = options.createOidcGateway?.(oidcTrust) ?? createJoseVercelOidcGateway();
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
			return jsonResponse(
				{ error: { code: "invalid-request", message: "Invalid mint request." } },
				400,
			);
		}

		const result = await handleMintRequest(
			{
				body: bodyResult.value,
				oidcToken: request.headers.get("x-ns-dispatch-oidc-token"),
			},
			{ oidcTrust, oidc, minter },
		);
		return jsonResponse(result.body, result.status);
	};
}

export async function POST(request: Request): Promise<Response> {
	return createMintPostHandler({ environment: process.env })(request);
}

function misconfiguredHandler(error: MintEndpointConfigError): MintPostHandler {
	return async () =>
		jsonResponse(
			{
				error: {
					code: error.code,
					message: error.message,
				},
			},
			500,
		);
}

async function readJsonBody(
	request: Request,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> {
	try {
		return { ok: true, value: await request.json() };
	} catch {
		// Malformed and unreadable JSON intentionally share the public 400
		// response; parser details are neither logged nor exposed to callers.
		return { ok: false };
	}
}

function jsonResponse(body: unknown, status: number): Response {
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}

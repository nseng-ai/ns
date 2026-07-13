import {
	handleMintRequest,
	type GitHubInstallationTokenGateway,
	type LandingCredentialGateway,
	type VercelOidcGateway,
} from "../src/mint/handle-mint-request.ts";
import {
	createGitHubInstallationTokenGateway,
	createJoseVercelOidcGateway,
	createSharedSecretLandingCredentialGateway,
} from "../src/mint/real-gateways.ts";
import {
	parseMintRuntimeConfig,
	type MintEnvironment,
	type MintRuntimeConfig,
} from "../src/mint/runtime-config.ts";

export type MintPostHandler = (request: Request) => Promise<Response>;

export interface MintPostHandlerOptions {
	readonly environment: MintEnvironment;
	readonly createOidcGateway?: (config: MintRuntimeConfig) => VercelOidcGateway;
	readonly createLandingCredentialGateway?: (config: MintRuntimeConfig) => LandingCredentialGateway;
	readonly createGitHubGateway?: (config: MintRuntimeConfig) => GitHubInstallationTokenGateway;
}

export function createMintPostHandler(options: MintPostHandlerOptions): MintPostHandler {
	const configResult = parseMintRuntimeConfig(options.environment);
	if (configResult.ok === false) {
		const { error } = configResult;
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

	const config = configResult.value;
	const oidc = options.createOidcGateway?.(config) ?? createJoseVercelOidcGateway();
	const landingCredential =
		options.createLandingCredentialGateway?.(config) ??
		createSharedSecretLandingCredentialGateway(config.sandboxMintSecret);
	const github =
		options.createGitHubGateway?.(config) ?? createGitHubInstallationTokenGateway(config);

	return async function mintPostHandler(request) {
		const bodyResult = await readJsonBody(request);
		if (!bodyResult.ok) {
			return jsonResponse(
				{ error: { code: "invalid-request", message: "Invalid mint request." } },
				400,
			);
		}

		const result = await handleMintRequest(
			{
				body: bodyResult.value,
				oidcToken: request.headers.get("x-ns-dispatch-oidc-token"),
				authorization: request.headers.get("authorization"),
			},
			{ config, oidc, landingCredential, github },
		);
		return jsonResponse(result.body, result.status);
	};
}

export async function POST(request: Request): Promise<Response> {
	return createMintPostHandler({ environment: process.env })(request);
}

async function readJsonBody(
	request: Request,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> {
	try {
		return { ok: true, value: await request.json() };
	} catch {
		return { ok: false };
	}
}

function jsonResponse(body: unknown, status: number): Response {
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}

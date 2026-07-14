import { createHash, timingSafeEqual } from "node:crypto";

import { createAppAuth } from "@octokit/auth-app";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import { githubPermissionsForPurpose, type GitHubRepositoryPermissions } from "./contracts.ts";
import type { VercelOidcGateway } from "./development-oidc.ts";
import type { LandingCredentialGateway } from "./handle-mint-request.ts";
import {
	createDispatchTokenMinter,
	type DispatchTokenMinter,
	type GitHubInstallationTokenGateway,
} from "./mint-core.ts";
import type { MintRuntimeConfig } from "./runtime-config.ts";

export interface AppAuthFactoryOptions {
	readonly appId: string;
	readonly installationId: string;
	readonly privateKey: string;
}

export interface InstallationAuthOptions {
	readonly type: "installation";
	readonly installationId: string;
	readonly repositoryNames: readonly [string];
	readonly permissions: GitHubRepositoryPermissions;
	readonly refresh: true;
}

export interface InstallationAuthentication {
	readonly token: string;
	readonly expiresAt: string;
}

export type AppAuthFunction = (
	options: InstallationAuthOptions,
) => Promise<InstallationAuthentication>;

export type AppAuthFactory = (options: AppAuthFactoryOptions) => AppAuthFunction;

export interface JoseVercelOidcGatewayOptions {
	readonly keyResolver?: JWTVerifyGetKey;
}

const vercelOidcClaimsSchema = z.object({
	owner_id: z.string().min(1),
	project_id: z.string().min(1),
	environment: z.string().min(1),
	exp: z.number().int().positive(),
});

export function createJoseVercelOidcGateway(
	options: JoseVercelOidcGatewayOptions = {},
): VercelOidcGateway {
	return {
		async verifyDevelopmentIdentity(input) {
			try {
				const keyResolver =
					options.keyResolver ??
					createRemoteJWKSet(new URL(`${input.issuer.replace(/\/$/, "")}/.well-known/jwks`));
				const verification = await jwtVerify(input.token, keyResolver, {
					issuer: input.issuer,
					audience: input.audience,
				});
				const claims = vercelOidcClaimsSchema.safeParse(verification.payload);
				if (!claims.success) return { ok: false };
				return {
					ok: true,
					value: {
						ownerId: claims.data.owner_id,
						projectId: claims.data.project_id,
						environment: claims.data.environment,
					},
				};
			} catch {
				return { ok: false };
			}
		},
	};
}

export function createGitHubInstallationTokenGateway(
	config: MintRuntimeConfig,
	authFactory: AppAuthFactory = defaultAppAuthFactory,
): GitHubInstallationTokenGateway {
	return {
		async mintRepositoryToken(options) {
			try {
				const auth = authFactory({
					appId: config.githubAppId,
					installationId: config.githubAppInstallationId,
					privateKey: config.githubAppPrivateKey,
				});
				const repositoryName = options.repository.slice(options.repository.indexOf("/") + 1);
				const authentication = await auth({
					type: "installation",
					installationId: config.githubAppInstallationId,
					repositoryNames: [repositoryName],
					permissions: githubPermissionsForPurpose(options.purpose),
					refresh: true,
				});
				if (!isInstallationAuthentication(authentication)) return { ok: false };
				return {
					ok: true,
					value: {
						token: authentication.token,
						expiresAt: authentication.expiresAt,
					},
				};
			} catch {
				return { ok: false };
			}
		},
	};
}

// The in-process minting entry for the dispatch workflow (clone token at
// sandbox creation, landing token at landing time): the mint core over the
// real GitHub App installation-token gateway, no HTTP hop. `authFactory` is
// the test seam; production callers pass only the parsed runtime config.
export function createGitHubAppDispatchTokenMinter(
	config: MintRuntimeConfig,
	authFactory: AppAuthFactory = defaultAppAuthFactory,
): DispatchTokenMinter {
	return createDispatchTokenMinter({
		config,
		github: createGitHubInstallationTokenGateway(config, authFactory),
	});
}

export function createSharedSecretLandingCredentialGateway(
	sharedSecret: string,
): LandingCredentialGateway {
	const expectedDigest = createHash("sha256").update(sharedSecret).digest();
	return {
		verifyLandingCredential(credential) {
			const actualDigest = createHash("sha256").update(credential).digest();
			return timingSafeEqual(actualDigest, expectedDigest);
		},
	};
}

function defaultAppAuthFactory(options: AppAuthFactoryOptions): AppAuthFunction {
	const auth = createAppAuth({
		appId: options.appId,
		installationId: options.installationId,
		privateKey: options.privateKey,
	});
	return async (authOptions) => {
		const authentication = await auth({
			type: authOptions.type,
			installationId: authOptions.installationId,
			repositoryNames: [...authOptions.repositoryNames],
			permissions: authOptions.permissions,
			refresh: authOptions.refresh,
		});
		return {
			token: authentication.token,
			expiresAt: authentication.expiresAt,
		};
	};
}

function isInstallationAuthentication(value: InstallationAuthentication): boolean {
	return (
		value.token.length > 0 &&
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.expiresAt) &&
		!Number.isNaN(Date.parse(value.expiresAt))
	);
}

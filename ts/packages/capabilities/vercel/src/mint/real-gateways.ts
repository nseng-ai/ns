import { createAppAuth } from "@octokit/auth-app";
import { githubPermissionsForPurpose, type GitHubRepositoryPermissions } from "./contracts.ts";
import {
	createDispatchTokenMinter,
	type DispatchTokenMinter,
	type GitHubInstallationTokenGateway,
} from "./mint-core.ts";
import type { GitHubAppMintConfig } from "./runtime-config.ts";

export interface AppAuthFactoryOptions {
	readonly appId: string;
	readonly installationId: string;
	readonly privateKey: string;
}

export type GitHubAppAuthenticationConfig = Pick<
	GitHubAppMintConfig,
	"githubAppId" | "githubAppInstallationId" | "githubAppPrivateKey"
>;

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

export function createGitHubInstallationTokenGateway(
	config: GitHubAppAuthenticationConfig,
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
// the test seam; production callers pass only the parsed GitHub App config.
export function createGitHubAppDispatchTokenMinter(
	config: GitHubAppMintConfig,
	authFactory: AppAuthFactory = defaultAppAuthFactory,
): DispatchTokenMinter {
	return createDispatchTokenMinter({
		repository: config.githubRepository,
		github: createGitHubInstallationTokenGateway(config, authFactory),
	});
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

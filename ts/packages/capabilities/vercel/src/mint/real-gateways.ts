import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
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
				if (!isInstallationAuthentication(authentication)) {
					return {
						ok: false,
						reason: "invalid-response",
						message: "GitHub App authentication returned an invalid installation token response",
					};
				}
				return {
					ok: true,
					value: {
						token: authentication.token,
						expiresAt: authentication.expiresAt,
					},
				};
			} catch (error) {
				return {
					ok: false,
					reason: classifyGitHubTokenMintFailure(error),
					message: formatErrorMessage(error),
				};
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

function classifyGitHubTokenMintFailure(
	error: unknown,
):
	| "authentication-failed"
	| "transport-failed"
	| "request-rejected"
	| "target-not-found"
	| "rate-limited"
	| "upstream-unavailable" {
	const status = readHttpStatus(error);
	if (status === undefined) return "transport-failed";
	if (status === 401) return "authentication-failed";
	if (status === 403) return "request-rejected";
	if (status === 404) return "target-not-found";
	if (status === 429) return "rate-limited";
	if (status >= 500) return "upstream-unavailable";
	return "request-rejected";
}

function readHttpStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
	return typeof error.status === "number" ? error.status : undefined;
}

function isInstallationAuthentication(value: InstallationAuthentication): boolean {
	return (
		value.token.length > 0 &&
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.expiresAt) &&
		!Number.isNaN(Date.parse(value.expiresAt))
	);
}

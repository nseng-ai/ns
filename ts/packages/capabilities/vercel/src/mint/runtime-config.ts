import { z } from "zod";

import { parseOidcTrustConfig, type OidcTrustConfig } from "../auth/oidc-trust-config.ts";
import { parseGitHubRepository } from "./contracts.ts";

export interface GitHubAppMintConfig {
	readonly githubAppId: string;
	readonly githubAppInstallationId: string;
	readonly githubAppPrivateKey: string;
	readonly githubRepository: string;
}

export interface MintEndpointConfigError {
	readonly code: "mint-endpoint-misconfigured";
	readonly message: string;
	readonly variable: string;
}

export type GitHubAppMintConfigParseResult =
	| { readonly ok: true; readonly value: GitHubAppMintConfig }
	| { readonly ok: false; readonly error: MintEndpointConfigError };

export type MintOidcTrustConfigParseResult =
	| { readonly ok: true; readonly value: OidcTrustConfig }
	| { readonly ok: false; readonly error: MintEndpointConfigError };

export type MintEnvironment = Readonly<Record<string, string | undefined>>;

const positiveIntegerIdSchema = z.string().regex(/^[1-9][0-9]*$/);
const privateKeySchema = z
	.string()
	.transform(normalizeEscapedPemNewlines)
	.refine((value) =>
		/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[\s\S]+\n-----END (?:RSA )?PRIVATE KEY-----\n?$/.test(
			value,
		),
	);
const repositorySchema = z.string().transform((value, context) => {
	const result = parseGitHubRepository(value);
	if (result.ok === false) {
		context.addIssue({ code: "custom", message: "invalid repository" });
		return z.NEVER;
	}
	return result.value;
});

const githubAppEnvironmentSchema = z.strictObject({
	NS_DISPATCH_GITHUB_APP_ID: positiveIntegerIdSchema,
	NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: positiveIntegerIdSchema,
	NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: privateKeySchema,
	NS_DISPATCH_GITHUB_REPOSITORY: repositorySchema,
});

const githubAppEnvironmentNames = [
	"NS_DISPATCH_GITHUB_APP_ID",
	"NS_DISPATCH_GITHUB_APP_INSTALLATION_ID",
	"NS_DISPATCH_GITHUB_APP_PRIVATE_KEY",
	"NS_DISPATCH_GITHUB_REPOSITORY",
] as const;

export function parseGitHubAppMintConfig(
	environment: MintEnvironment,
): GitHubAppMintConfigParseResult {
	const result = githubAppEnvironmentSchema.safeParse({
		NS_DISPATCH_GITHUB_APP_ID: environment.NS_DISPATCH_GITHUB_APP_ID,
		NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: environment.NS_DISPATCH_GITHUB_APP_INSTALLATION_ID,
		NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: environment.NS_DISPATCH_GITHUB_APP_PRIVATE_KEY,
		NS_DISPATCH_GITHUB_REPOSITORY: environment.NS_DISPATCH_GITHUB_REPOSITORY,
	});
	if (!result.success) {
		const issuePath = result.error.issues[0]?.path[0];
		return mintConfigFailure(
			isGitHubAppEnvironmentName(issuePath) ? issuePath : "mint endpoint environment",
		);
	}

	return {
		ok: true,
		value: {
			githubAppId: result.data.NS_DISPATCH_GITHUB_APP_ID,
			githubAppInstallationId: result.data.NS_DISPATCH_GITHUB_APP_INSTALLATION_ID,
			githubAppPrivateKey: result.data.NS_DISPATCH_GITHUB_APP_PRIVATE_KEY,
			githubRepository: result.data.NS_DISPATCH_GITHUB_REPOSITORY,
		},
	};
}

export function parseMintOidcTrustConfig(
	environment: MintEnvironment,
): MintOidcTrustConfigParseResult {
	const result = parseOidcTrustConfig(environment);
	if (result.ok === false) {
		return mintConfigFailure(result.error.variable);
	}
	return result;
}

export function normalizeEscapedPemNewlines(value: string): string {
	return value.replaceAll("\\n", "\n");
}

function mintConfigFailure(variable: string): {
	readonly ok: false;
	readonly error: MintEndpointConfigError;
} {
	return {
		ok: false,
		error: {
			code: "mint-endpoint-misconfigured",
			message: `Mint endpoint configuration is invalid: ${variable}.`,
			variable,
		},
	};
}

function isGitHubAppEnvironmentName(
	value: PropertyKey | undefined,
): value is (typeof githubAppEnvironmentNames)[number] {
	return typeof value === "string" && githubAppEnvironmentNames.some((name) => name === value);
}

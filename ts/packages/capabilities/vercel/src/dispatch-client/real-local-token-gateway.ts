import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { errorCodeFromUnknown, formatErrorMessage } from "@nseng-ai/foundation/primitives";

import type { DispatchLocalTokenGateway } from "../dispatch-client/contracts.ts";

/** The env name `vercel env pull` writes the Development token under. */
export const DISPATCH_OIDC_TOKEN_ENV_NAME = "VERCEL_OIDC_TOKEN";

export interface RealDispatchLocalTokenGatewayOptions {
	readonly env: Readonly<Record<string, string | undefined>>;
}

export function createRealDispatchLocalTokenGateway(
	options: RealDispatchLocalTokenGatewayOptions,
): DispatchLocalTokenGateway {
	return {
		async readDevelopmentOidcToken({ repoRoot }) {
			const fromEnv = options.env[DISPATCH_OIDC_TOKEN_ENV_NAME];
			if (fromEnv !== undefined && fromEnv.length > 0) {
				return { type: "found", token: fromEnv };
			}
			const envLocalPath = join(repoRoot, ".env.local");
			let content: string;
			try {
				content = await readFile(envLocalPath, "utf8");
			} catch (error) {
				if (errorCodeFromUnknown(error) === "ENOENT") {
					return { type: "missing", detail: missingTokenDetail(envLocalPath) };
				}
				return { type: "error", message: formatErrorMessage(error) };
			}
			const token = parseEnvFileValue(content, DISPATCH_OIDC_TOKEN_ENV_NAME);
			if (token === null || token.length === 0) {
				return { type: "missing", detail: missingTokenDetail(envLocalPath) };
			}
			return { type: "found", token };
		},
	};
}

function missingTokenDetail(envLocalPath: string): string {
	return (
		`${DISPATCH_OIDC_TOKEN_ENV_NAME} is not available (checked the process environment and ${envLocalPath}). ` +
		"Run `vercel env pull .env.local --environment=development` from the repository root."
	);
}

/**
 * Minimal `.env.local` value lookup for one known key: `KEY=value` or
 * `KEY="value"` lines as `vercel env pull` writes them. Only the named
 * key's value is ever extracted.
 */
export function parseEnvFileValue(content: string, name: string): string | null {
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith(`${name}=`)) continue;
		const raw = trimmed.slice(name.length + 1);
		if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
			return raw.slice(1, -1);
		}
		return raw;
	}
	return null;
}

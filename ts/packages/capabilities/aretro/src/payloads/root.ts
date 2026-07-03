/**
 * Payload root and session-id resolution helpers.
 */

import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { PayloadError } from "./errors.ts";
import { isSafeSegment } from "./segments.ts";

export const SDL_PAYLOAD_ROOT_ENV = "NS_PAYLOAD_ROOT";
export const SDL_PAYLOAD_SESSION_ID_ENV = "NS_PAYLOAD_SESSION_ID";

export function defaultPayloadRoot(options?: { tempDir?: string }): string {
	const baseTempDir = options?.tempDir ?? tmpdir();
	return join(baseTempDir, "ns");
}

export function resolvePayloadRoot(options?: {
	env?: Record<string, string | undefined>;
	tempDir?: string;
}): string {
	const sourceEnv = options?.env ?? process.env;
	const envValue = sourceEnv[SDL_PAYLOAD_ROOT_ENV];
	if (envValue === undefined || envValue === "") {
		return defaultPayloadRoot(
			options?.tempDir !== undefined ? { tempDir: options.tempDir } : undefined,
		);
	}

	if (isAbsolute(envValue)) {
		return envValue;
	}
	throw new PayloadError(
		"payload-root-invalid",
		`${SDL_PAYLOAD_ROOT_ENV} must be an absolute path: ${JSON.stringify(envValue)}`,
	);
}

export function resolvePayloadSessionId(
	explicitSessionId: string | undefined,
	options?: { env?: Record<string, string | undefined> },
): string {
	const sourceEnv = options?.env ?? process.env;
	let sessionId: string;
	if (explicitSessionId !== undefined && explicitSessionId !== "") {
		sessionId = explicitSessionId;
	} else {
		const envSessionId = sourceEnv[SDL_PAYLOAD_SESSION_ID_ENV];
		if (envSessionId === undefined || envSessionId === "") {
			throw new PayloadError(
				"payload-session-required",
				`Payload artifact mode requires a session id from an explicit option or ${SDL_PAYLOAD_SESSION_ID_ENV}.`,
			);
		}
		sessionId = envSessionId;
	}

	if (isSafeSegment(sessionId)) {
		return sessionId;
	}
	throw new PayloadError(
		"payload-session-invalid",
		`Payload session id must be a safe segment: ${JSON.stringify(sessionId)}`,
	);
}

import { derivePayloadSessionIdFromHarnessSessionId } from "../../src/payload-store.ts";

export interface ExpectedHarnessSession {
	payloadSessionId: string;
	harnessSessionIdDigest: string;
}

export function expectedHarnessSession(rawHarnessSessionId: string): ExpectedHarnessSession {
	const derived = derivePayloadSessionIdFromHarnessSessionId(rawHarnessSessionId);
	return {
		payloadSessionId: derived.payloadSessionId,
		harnessSessionIdDigest: derived.harnessSessionIdDigest,
	};
}

export function expectedHarnessSessionText(text: string, rawHarnessSessionId: string): string {
	const session = expectedHarnessSession(rawHarnessSessionId);
	const escapedPayloadSessionId = escapeRegExp(session.payloadSessionId);
	return text
		.replaceAll(`/sessions/${rawHarnessSessionId}/`, `/sessions/${session.payloadSessionId}/`)
		.replaceAll(`"session_id": "${rawHarnessSessionId}"`, `"session_id": "${session.payloadSessionId}"`)
		.replaceAll(`"payload_session_id": "${rawHarnessSessionId}"`, `"payload_session_id": "${session.payloadSessionId}"`)
		.replace(
			new RegExp(`(\\n(\\s*)"payload_session_id": "${escapedPayloadSessionId}")`, "g"),
			`$1,\n$2"harness_session_id_digest": "${session.harnessSessionIdDigest}"`,
		);
}

export function expectedHarnessSessionRelativePath(relativePath: string, rawHarnessSessionId: string): string {
	const session = expectedHarnessSession(rawHarnessSessionId);
	return relativePath.replaceAll(`sessions/${rawHarnessSessionId}/`, `sessions/${session.payloadSessionId}/`);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

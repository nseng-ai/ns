import {
	parseManagedRegion,
	replaceMalformedManagedRegionFromBegin,
	replaceManagedRegion,
} from "@nseng-ai/foundation/managed-region";
import { sha256Digest } from "@nseng-ai/foundation/primitives";

import type { PrCommitMessage } from "./github-pr-gateway.ts";

export const GENERATED_BODY_MARKER = "<!-- generated-by: ji-dev pr-description v1 -->";
export const MANAGED_BODY_BEGIN_MARKER = "<!-- ns-pr-description:begin";
export const MANAGED_BODY_END_MARKER = "<!-- ns-pr-description:end -->";
export const PR_DESCRIPTION_GENERATOR_VERSION = "ns-pr-description-v2";

export interface PrDescriptionFingerprintMetadata {
	version: "2";
	patchId: string;
	promptHash: string;
	generator: string;
}

export type ManagedGeneratedRegionParseResult =
	| {
			type: "found";
			metadata: PrDescriptionFingerprintMetadata;
			body: string;
			start: number;
			end: number;
	  }
	| { type: "missing" }
	| { type: "malformed"; reason: string };

export type PrDescriptionFingerprintPolicy = "skip-current" | "force";

export type PrBodyUpdateDecision = { type: "skip" } | { type: "regenerate"; reason: string };

export function buildFingerprint(input: {
	patchId: string;
	promptText: string;
}): PrDescriptionFingerprintMetadata {
	return {
		version: "2",
		patchId: input.patchId,
		promptHash: hashPrDescriptionPrompt(input.promptText),
		generator: PR_DESCRIPTION_GENERATOR_VERSION,
	};
}

export function decidePrBodyUpdate(input: {
	existingBody: string;
	fingerprint: PrDescriptionFingerprintMetadata;
	policy: PrDescriptionFingerprintPolicy;
}): PrBodyUpdateDecision {
	const parsedRegion = parseManagedGeneratedRegion(input.existingBody);
	if (
		input.policy === "skip-current" &&
		parsedRegion.type === "found" &&
		fingerprintsMatch(parsedRegion.metadata, input.fingerprint)
	) {
		return { type: "skip" };
	}
	return { type: "regenerate", reason: formatFingerprintMismatchReason(parsedRegion.type) };
}

export function mergeGeneratedBody(input: {
	existingBody: string;
	generatedBody: string;
	fingerprint: PrDescriptionFingerprintMetadata;
	commits: readonly PrCommitMessage[];
}): string {
	const region = formatManagedGeneratedRegion(input.generatedBody, input.fingerprint);
	const parsed = parseManagedGeneratedRegion(input.existingBody);
	if (parsed.type === "found") {
		return replaceManagedRegion({
			text: input.existingBody,
			replacement: region,
			start: parsed.start,
			end: parsed.end,
		});
	}
	if (parsed.type === "malformed") {
		return replaceMalformedManagedRegionFromBegin({
			text: input.existingBody,
			beginPrefix: MANAGED_BODY_BEGIN_MARKER,
			replacement: region,
		});
	}
	if (
		input.existingBody.includes(GENERATED_BODY_MARKER) ||
		isCommitMessagePrefillBody(input.existingBody, input.commits)
	) {
		return region;
	}
	const trimmedExisting = input.existingBody.trim();
	return trimmedExisting === "" ? region : `${region}\n\n${trimmedExisting}`;
}

export function prewrittenMetadataMatches(
	title: string,
	body: string,
	metadata: { title: string; body: string },
): boolean {
	return title.trim() === metadata.title.trim() && body.trim() === metadata.body.trim();
}

/** Legacy second-write body format retained until marker-strategy unification (G2). */
export function prewrittenFallbackBody(body: string): string {
	const withoutExistingMarker = body.replace(GENERATED_BODY_MARKER, "").trimEnd();
	return `${withoutExistingMarker}\n\n${GENERATED_BODY_MARKER}`;
}

export function hasGeneratedMarker(body: string): boolean {
	return body.includes(GENERATED_BODY_MARKER) || body.includes(MANAGED_BODY_BEGIN_MARKER);
}

export function hashPrDescriptionPrompt(promptText: string): string {
	return `sha256:${sha256Digest(promptText)}`;
}

export function formatManagedGeneratedRegion(
	body: string,
	metadata: PrDescriptionFingerprintMetadata,
): string {
	const begin = `${MANAGED_BODY_BEGIN_MARKER} version=${metadata.version} patch-id=${metadata.patchId} prompt=${metadata.promptHash} generator=${metadata.generator} -->`;
	return [
		begin,
		"<details>",
		"<summary><h2>Mechanical inventory of changes</h2></summary>",
		"",
		body.trim(),
		"",
		"</details>",
		MANAGED_BODY_END_MARKER,
	].join("\n");
}

export function parseManagedGeneratedRegion(body: string): ManagedGeneratedRegionParseResult {
	const parsed = parseManagedRegion({
		text: body,
		markers: { beginPrefix: MANAGED_BODY_BEGIN_MARKER, end: MANAGED_BODY_END_MARKER },
		parseMetadata: parseManagedRegionMetadata,
		extractBody: extractManagedRegionBody,
	});
	if (parsed.type !== "found") return parsed;
	return {
		type: "found",
		metadata: parsed.metadata,
		body: parsed.body,
		start: parsed.start,
		end: parsed.end,
	};
}

export function isCommitMessagePrefillBody(
	body: string,
	commits: readonly PrCommitMessage[],
): boolean {
	const trimmedBody = body.trim();
	// Empty bodies are owned by the existing empty-body overwrite check.
	if (trimmedBody === "") return false;
	return commits.some((commit) => commit.body?.trim() === trimmedBody);
}

function parseManagedRegionMetadata(comment: string): PrDescriptionFingerprintMetadata | undefined {
	const fields = new Map<string, string>();
	for (const match of comment.matchAll(/([a-z-]+)=([^\s>]+)/g)) {
		const key = match[1];
		const value = match[2];
		if (key === undefined || value === undefined) continue;
		fields.set(key, value);
	}
	const version = fields.get("version");
	const patchId = fields.get("patch-id");
	const promptHash = fields.get("prompt");
	const generator = fields.get("generator");
	if (
		version !== "2" ||
		patchId === undefined ||
		promptHash === undefined ||
		generator === undefined
	)
		return undefined;
	return { version, patchId, promptHash, generator };
}

function extractManagedRegionBody(regionContents: string): string {
	const normalized = regionContents.replace(/\r/g, "");
	// Accept the current collapsed inventory form plus the legacy forms
	// (`<details open>` disclosure, plain "Generated PR description" summary)
	// still present in previously generated PR bodies.
	const match = normalized.match(
		/<details(?: open)?>\n<summary>(?:<h2>Mechanical inventory of changes<\/h2>|Generated PR description)<\/summary>\n\n([\s\S]*?)\n\n<\/details>/,
	);
	return match?.[1]?.trim() ?? normalized.trim();
}

function formatFingerprintMismatchReason(
	type: ReturnType<typeof parseManagedGeneratedRegion>["type"],
): string {
	switch (type) {
		case "missing":
			return "no generated fingerprint found";
		case "malformed":
			return "generated fingerprint is malformed";
		case "found":
			return "generated fingerprint changed";
	}
}

function fingerprintsMatch(
	left: PrDescriptionFingerprintMetadata,
	right: PrDescriptionFingerprintMetadata,
): boolean {
	return (
		left.version === right.version &&
		left.patchId === right.patchId &&
		left.promptHash === right.promptHash &&
		left.generator === right.generator
	);
}

import { createHash } from "node:crypto";
import { encodeCrockfordBase32Lower } from "./vendored/crockford-base32.ts";
import { generateUlid } from "./vendored/ulid.ts";
import { artifactIdSchema, type ArtifactId } from "./artifact.ts";
import type { ArtifactEntry } from "./domain.ts";

export type IdentityResult<T> =
	| { readonly ok: true; readonly value: T }
	| {
			readonly ok: false;
			readonly code: "invalid-entry-kind" | "invalid-path";
			readonly message: string;
	  };
export interface ContentDigest {
	readonly text: `sha256:${string}`;
	readonly bytes: Uint8Array;
	readonly manifest: readonly { readonly path: string; readonly sha256: string }[];
}

function u64be(value: number): Uint8Array {
	if (!Number.isSafeInteger(value) || value < 0)
		throw new RangeError("u64 framing value must be a non-negative safe integer");
	const bytes = new Uint8Array(8);
	let remaining = BigInt(value);
	for (let index = 7; index >= 0; index--) {
		bytes[index] = Number(remaining & 255n);
		remaining >>= 8n;
	}
	return bytes;
}
function frame(bytes: Uint8Array): Uint8Array {
	return Buffer.concat([u64be(bytes.byteLength), bytes]);
}
function hash(parts: readonly Uint8Array[]): Uint8Array {
	const digest = createHash("sha256");
	for (const part of parts) digest.update(part);
	return digest.digest();
}
function compareBytes(left: Uint8Array, right: Uint8Array): number {
	return Buffer.compare(left, right);
}
function crockfordBase32Lower(bytes: Uint8Array): string {
	return encodeCrockfordBase32Lower(bytes);
}
export function digestArtifactContent(
	entries: readonly ArtifactEntry[],
): IdentityResult<ContentDigest> {
	const prepared: { path: string; pathBytes: Uint8Array; bytes: Uint8Array }[] = [];
	const paths = new Set<string>();
	for (const entry of entries) {
		if (entry.kind !== "regular-file")
			return {
				ok: false,
				code: "invalid-entry-kind",
				message: `Artifact entry ${entry.path} is ${entry.kind}, not a regular file.`,
			};
		const segments = entry.path.split("/");
		if (
			entry.path === "" ||
			entry.path.startsWith("/") ||
			entry.path.endsWith("/") ||
			segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
			entry.path.includes("\\")
		)
			return {
				ok: false,
				code: "invalid-path",
				message: `Artifact entry path is not normalized: ${entry.path}`,
			};
		if (paths.has(entry.path))
			return {
				ok: false,
				code: "invalid-path",
				message: `Artifact entry path is duplicated: ${entry.path}`,
			};
		paths.add(entry.path);
		prepared.push({
			path: entry.path,
			pathBytes: Buffer.from(entry.path, "utf8"),
			bytes: new Uint8Array(entry.bytes),
		});
	}
	prepared.sort((left, right) => compareBytes(left.pathBytes, right.pathBytes));
	const parts = prepared.flatMap((entry) => [frame(entry.pathBytes), frame(entry.bytes)]);
	const bytes = hash(parts);
	const manifest = prepared.map((entry) => ({
		path: entry.path,
		sha256: createHash("sha256").update(entry.bytes).digest("hex"),
	}));
	return {
		ok: true,
		value: { text: `sha256:${Buffer.from(bytes).toString("hex")}`, bytes, manifest },
	};
}
export function deriveRevisionId(options: {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	/** Repository-relative artifact directory; the repository root is represented by "". */
	readonly artifactPath: string;
	readonly contentDigest: Uint8Array;
}): `gpr_${string}` {
	if (options.contentDigest.byteLength !== 32)
		throw new RangeError("content digest must contain 32 bytes");
	return `gpr_${crockfordBase32Lower(
		hash([
			frame(Buffer.from(options.sourceId)),
			frame(Buffer.from(options.artifactId)),
			frame(Buffer.from(options.artifactPath)),
			options.contentDigest,
		]),
	)}`;
}
export const ARTIFACT_EVENT_TYPES = [
	"artifact.created",
	"artifact.restored",
	"artifact.revised",
	"artifact.deleted",
] as const;
export type ArtifactEventType = (typeof ARTIFACT_EVENT_TYPES)[number];
export function deriveEventId(options: {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly reconciledCommit: string;
	readonly eventType: ArtifactEventType;
}): `gpe_${string}` {
	return `gpe_${crockfordBase32Lower(hash([frame(Buffer.from(options.sourceId)), frame(Buffer.from(options.artifactId)), frame(Buffer.from(options.reconciledCommit)), frame(Buffer.from(options.eventType))]))}`;
}
export interface ArtifactIdGenerator {
	generateArtifactId(): ArtifactId;
}
export function createArtifactIdGenerator(options: {
	readonly clock: { now(): Date };
}): ArtifactIdGenerator {
	return {
		generateArtifactId: () => artifactIdSchema.parse(generateUlid(options.clock.now().getTime())),
	};
}

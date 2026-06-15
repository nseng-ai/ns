import { chmod, lstat, mkdir, open, readdir, readFile, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

import { formatErrorMessage, truncatedSha256Digest } from "@asdl/core";
import { z } from "zod";

import { payloadReferenceSchema } from "./feedback-manifest-contracts.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread } from "./gateways.ts";

export const ASDL_PAYLOAD_ROOT_ENV = "ASDL_PAYLOAD_ROOT";
export const HARNESS_SESSION_ID_ENV = "HARNESS_SESSION_ID";

export const SAFE_SEGMENT_PATTERN_TEXT = "^[a-z0-9][a-z0-9._-]{0,127}$";
const SAFE_SEGMENT_PATTERN = new RegExp(SAFE_SEGMENT_PATTERN_TEXT);

export const PAYLOAD_FILENAME_PATTERN = /^\d{8}t\d{6}z-(?<sequence>\d+)-(?<descriptor>[a-z0-9][a-z0-9._-]{0,127})\.(?<role>raw|summary|log)\.(?<extension>json|txt)$/;

export type PayloadErrorType =
	| "harness_session_required"
	| "harness_session_invalid"
	| "payload_root_invalid"
	| "payload_directory_unsafe"
	| "payload_write_failed"
	| "payload_lookup_failed";

export type PayloadRole = "raw" | "summary" | "log";
export type PayloadExtension = "json" | "txt";
export type JsonPayloadRole = "raw" | "summary";
export type LogPayloadRole = "log";

export type PayloadClock = () => Date;

export type PayloadResult<T> = { type: "ok"; value: T } | { type: "error"; errorType: PayloadErrorType; message: string };

export const DEFAULT_JSON_PAYLOAD_ROLES: ReadonlySet<string> = new Set(["raw", "summary"]);

export interface PayloadArtifactStore {
	readonly root: string;
	readonly sessionId: string;
	readonly payloadDir: string;
	writeJsonArtifact(options: { descriptor: string; role: JsonPayloadRole; payload: unknown }): Promise<PayloadResult<PayloadReference>>;
	writeTextArtifact(options: { descriptor: string; role: LogPayloadRole; text: string }): Promise<PayloadResult<PayloadReference>>;
	readJsonArtifact(options: { payloadPath: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<unknown>>;
	readJsonArtifactWithReference(options: { payloadPath: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<ResolvedJsonPayloadArtifact>>;
	readJsonArtifactValue(options: { payloadPath: string; pointer: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<unknown>>;
	findLatestJsonArtifact(options: { descriptor: string; role: JsonPayloadRole }): Promise<PayloadResult<ResolvedJsonPayloadArtifact>>;
}

export interface PayloadStoreFactory {
	open(options: OpenPayloadStoreOptions): Promise<PayloadResult<PayloadArtifactStore>>;
	fromEnvironment(options?: PayloadStoreFromEnvironmentOptions): Promise<PayloadResult<PayloadArtifactStore>>;
	openContainingArtifact(payloadPath: string, options?: { clock?: PayloadClock | undefined }): Promise<PayloadResult<PayloadArtifactStore>>;
}

/** Store-owned facts for a written payload artifact. Mirrors the Python `PayloadReference` wire shape. */
export interface PayloadReference {
	payload_path: string;
	session_id: string;
	descriptor: string;
	role: PayloadRole;
	created_at_utc: string;
	sequence: number;
	payload_bytes: number;
	content_type: string;
	extension: PayloadExtension;
}

export interface ResolvedJsonPayloadArtifact {
	reference: PayloadReference;
	value: unknown;
}

export interface ParsedPayloadCandidate {
	parsed: ParsedPayloadFilename;
}

export function selectLatestJsonPayloadCandidate<T extends ParsedPayloadCandidate>(
	candidates: readonly T[],
	options: { descriptor: string; role: JsonPayloadRole },
): T | null {
	let latest: T | null = null;
	for (const candidate of candidates) {
		if (candidate.parsed.descriptor !== options.descriptor || candidate.parsed.role !== options.role || candidate.parsed.extension !== "json") continue;
		if (latest === null || candidate.parsed.sequence > latest.parsed.sequence) latest = candidate;
	}
	return latest;
}

export function nextPayloadSequence(candidates: readonly ParsedPayloadCandidate[]): number {
	let maxSequence = 0;
	for (const candidate of candidates) maxSequence = Math.max(maxSequence, candidate.parsed.sequence);
	return maxSequence + 1;
}

export function isSafeSegment(value: string): boolean {
	return SAFE_SEGMENT_PATTERN.test(value);
}

/** Throws on unsafe segments: descriptor safety is a programmer-error contract, mirroring Python's `ValueError`. */
export function requireSafeSegment(value: string, options: { label: string }): string {
	if (isSafeSegment(value)) return value;
	throw new Error(`${options.label} must match safe segment pattern ${pythonRepr(SAFE_SEGMENT_PATTERN_TEXT)}: ${pythonRepr(value)}`);
}

export function defaultPayloadRoot(options: { tempDir?: string | undefined } = {}): string {
	return join(options.tempDir ?? tmpdir(), "asdl");
}

export function resolvePayloadRoot(options: { env?: NodeJS.ProcessEnv | undefined; tempDir?: string | undefined } = {}): PayloadResult<string> {
	const sourceEnv = options.env ?? process.env;
	const envValue = sourceEnv[ASDL_PAYLOAD_ROOT_ENV];
	if (envValue === undefined || envValue === "") return { type: "ok", value: defaultPayloadRoot({ tempDir: options.tempDir }) };
	if (isAbsolute(envValue)) return { type: "ok", value: envValue };
	return payloadError("payload_root_invalid", `${ASDL_PAYLOAD_ROOT_ENV} must be an absolute path: ${pythonRepr(envValue)}`);
}

export function resolveHarnessSessionId(
	explicitHarnessSessionId: string | null | undefined,
	options: { env?: NodeJS.ProcessEnv | undefined } = {},
): PayloadResult<string> {
	const sourceEnv = options.env ?? process.env;
	const harnessSessionId =
		explicitHarnessSessionId !== undefined && explicitHarnessSessionId !== null && explicitHarnessSessionId !== "" ? explicitHarnessSessionId : sourceEnv[HARNESS_SESSION_ID_ENV];
	if (harnessSessionId === undefined || harnessSessionId === "") {
		return payloadError("harness_session_required", `Payload artifact mode requires ${HARNESS_SESSION_ID_ENV} from the harness or --harness-session-id.`);
	}
	if (isSafeSegment(harnessSessionId)) return { type: "ok", value: harnessSessionId };
	return payloadError("harness_session_invalid", `Harness session id must be a safe segment: ${pythonRepr(harnessSessionId)}`);
}

export function hasConfiguredPayloadSession(
	explicitHarnessSessionId: string | null | undefined,
	options: { env?: NodeJS.ProcessEnv | undefined } = {},
): boolean {
	const sourceEnv = options.env ?? process.env;
	if (explicitHarnessSessionId !== undefined && explicitHarnessSessionId !== null && explicitHarnessSessionId !== "") return true;
	const envSessionId = sourceEnv[HARNESS_SESSION_ID_ENV];
	return envSessionId !== undefined && envSessionId !== "";
}

export interface OpenPayloadStoreOptions {
	root: string;
	sessionId: string;
	clock?: PayloadClock | undefined;
}

export interface PayloadStoreFromEnvironmentOptions {
	explicitHarnessSessionId?: string | null | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	tempDir?: string | undefined;
	clock?: PayloadClock | undefined;
}

/** Store for one validated payload root and session id. Filesystem layout: `{root}/sessions/{session-id}/payloads/`. */
export class PayloadStore implements PayloadArtifactStore {
	readonly root: string;
	readonly sessionId: string;
	readonly payloadDir: string;
	private readonly clock: PayloadClock;

	private constructor(options: { root: string; sessionId: string; payloadDir: string; clock: PayloadClock }) {
		this.root = options.root;
		this.sessionId = options.sessionId;
		this.payloadDir = options.payloadDir;
		this.clock = options.clock;
	}

	/** Validate and prepare the store directories for the session id. */
	static async open(options: OpenPayloadStoreOptions): Promise<PayloadResult<PayloadStore>> {
		if (!isAbsolute(options.root)) return payloadError("payload_root_invalid", `Payload root must be an absolute path: ${options.root}`);
		if (!isSafeSegment(options.sessionId)) {
			return payloadError("harness_session_invalid", `Harness session id must be a safe segment: ${pythonRepr(options.sessionId)}`);
		}

		const sessionsDir = join(options.root, "sessions");
		const sessionDir = join(sessionsDir, options.sessionId);
		const payloadDir = join(sessionDir, "payloads");

		const directoryPlans: ReadonlyArray<{ path: string; notDirectoryErrorType: PayloadErrorType; createErrorType: PayloadErrorType }> = [
			{ path: options.root, notDirectoryErrorType: "payload_root_invalid", createErrorType: "payload_root_invalid" },
			{ path: sessionsDir, notDirectoryErrorType: "payload_directory_unsafe", createErrorType: "payload_directory_unsafe" },
			{ path: sessionDir, notDirectoryErrorType: "payload_directory_unsafe", createErrorType: "payload_directory_unsafe" },
			{ path: payloadDir, notDirectoryErrorType: "payload_directory_unsafe", createErrorType: "payload_directory_unsafe" },
		];
		for (const plan of directoryPlans) {
			const ensured = await ensurePrivateDirectory(plan.path, { notDirectoryErrorType: plan.notDirectoryErrorType, createErrorType: plan.createErrorType });
			if (ensured.type === "error") return ensured;
		}

		return {
			type: "ok",
			value: new PayloadStore({
				root: options.root,
				sessionId: options.sessionId,
				payloadDir,
				clock: options.clock ?? defaultClock,
			}),
		};
	}

	/** Open the managed payload store containing an existing artifact path. */
	static async openContainingArtifact(payloadPath: string, options: { clock?: PayloadClock | undefined } = {}): Promise<PayloadResult<PayloadStore>> {
		const validated = await validateContainedArtifactPath(payloadPath);
		if (validated.type === "error") return validated;
		const payloadDir = dirname(payloadPath);
		const sessionDir = dirname(payloadDir);
		return await PayloadStore.open({
			root: dirname(dirname(sessionDir)),
			sessionId: basename(sessionDir),
			clock: options.clock,
		});
	}

	/** Open a store using environment-backed root and harness-session resolution. */
	static async fromEnvironment(options: PayloadStoreFromEnvironmentOptions = {}): Promise<PayloadResult<PayloadStore>> {
		const root = resolvePayloadRoot({ env: options.env, tempDir: options.tempDir });
		if (root.type === "error") return root;
		const harnessSessionId = resolveHarnessSessionId(options.explicitHarnessSessionId, { env: options.env });
		if (harnessSessionId.type === "error") return harnessSessionId;
		return await PayloadStore.open({
			root: root.value,
			sessionId: harnessSessionId.value,
			clock: options.clock,
		});
	}

	/** Write a JSON raw or summary artifact and return its payload reference. */
	async writeJsonArtifact(options: { descriptor: string; role: JsonPayloadRole; payload: unknown }): Promise<PayloadResult<PayloadReference>> {
		if (options.role !== "raw" && options.role !== "summary") {
			throw new Error(`JSON artifact role must be 'raw' or 'summary': ${pythonRepr(String(options.role))}`);
		}
		const serialized = serializeJsonPayload(options.payload);
		if (serialized.type === "error") {
			return payloadError("payload_write_failed", `Failed to serialize JSON payload for descriptor ${pythonRepr(options.descriptor)}: ${serialized.message}`);
		}
		return await this.writeArtifact({
			descriptor: options.descriptor,
			role: options.role,
			extension: "json",
			contentType: "application/json",
			payloadBytes: Buffer.from(serialized.text, "utf8"),
		});
	}

	/** Write a text log artifact and return its payload reference. */
	async writeTextArtifact(options: { descriptor: string; role: LogPayloadRole; text: string }): Promise<PayloadResult<PayloadReference>> {
		if (options.role !== "log") throw new Error(`Text artifact role must be 'log': ${pythonRepr(String(options.role))}`);
		return await this.writeArtifact({
			descriptor: options.descriptor,
			role: options.role,
			extension: "txt",
			contentType: "text/plain",
			payloadBytes: Buffer.from(options.text, "utf8"),
		});
	}

	/** Validate and load a JSON payload artifact from an explicit absolute path. */
	async readJsonArtifact(options: { payloadPath: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<unknown>> {
		return await readJsonPayloadArtifact(options.payloadPath, { allowedRoles: options.allowedRoles });
	}

	/** Validate and load a JSON payload artifact with its store-owned reference. */
	async readJsonArtifactWithReference(options: { payloadPath: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<ResolvedJsonPayloadArtifact>> {
		return await readJsonPayloadArtifactWithReference(options.payloadPath, { allowedRoles: options.allowedRoles });
	}

	/** Read one JSON Pointer value from a validated payload artifact. */
	async readJsonArtifactValue(options: { payloadPath: string; pointer: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<unknown>> {
		return await readJsonPayloadArtifactValue(options.payloadPath, options.pointer, { allowedRoles: options.allowedRoles });
	}

	async findLatestJsonArtifact(options: { descriptor: string; role: JsonPayloadRole }): Promise<PayloadResult<ResolvedJsonPayloadArtifact>> {
		const candidate = await this.latestJsonPayloadCandidate(options);
		if (candidate.type === "error") return candidate;
		const payloadPath = join(this.payloadDir, candidate.value.filename);
		let payloadStats;
		try {
			payloadStats = await stat(payloadPath);
		} catch (error) {
			return payloadError("payload_lookup_failed", `Failed to stat latest payload artifact ${payloadPath}: ${formatErrorMessage(error)}`);
		}
		const parsed = await this.readJsonArtifact({ payloadPath, allowedRoles: new Set([options.role]) });
		if (parsed.type === "error") return parsed;
		return {
			type: "ok",
			value: {
				reference: buildPayloadReference({
					payloadPath,
					sessionId: this.sessionId,
					descriptor: candidate.value.parsed.descriptor,
					role: candidate.value.parsed.role,
					createdAtUtc: candidate.value.parsed.createdAtUtc,
					sequence: candidate.value.parsed.sequence,
					payloadBytes: payloadStats.size,
					contentType: "application/json",
					extension: candidate.value.parsed.extension,
				}),
				value: parsed.value,
			},
		};
	}

	private async writeArtifact(options: {
		descriptor: string;
		role: PayloadRole;
		extension: PayloadExtension;
		contentType: string;
		payloadBytes: Buffer;
	}): Promise<PayloadResult<PayloadReference>> {
		requireSafeSegment(options.descriptor, { label: "descriptor" });
		const { createdAtUtc, filenameTimestamp } = payloadTimestamps(this.clock());

		// Retry on exclusive-create collisions so concurrent writers each claim a unique sequence.
		for (;;) {
			const sequenceResult = await this.nextSequence();
			if (sequenceResult.type === "error") return sequenceResult;
			const sequence = sequenceResult.value;
			const payloadPath = join(
				this.payloadDir,
				payloadFilename({ filenameTimestamp, sequence, descriptor: options.descriptor, role: options.role, extension: options.extension }),
			);
			const written = await writeBytesExclusive(payloadPath, options.payloadBytes);
			if (written.type === "exists") continue;
			if (written.type === "error") {
				return payloadError("payload_write_failed", `Failed to write payload artifact ${payloadPath}: ${written.message}`);
			}
			return {
				type: "ok",
				value: buildPayloadReference({
					payloadPath,
					sessionId: this.sessionId,
					descriptor: options.descriptor,
					role: options.role,
					createdAtUtc,
					sequence,
					payloadBytes: options.payloadBytes.byteLength,
					contentType: options.contentType,
					extension: options.extension,
				}),
			};
		}
	}

	private async nextSequence(): Promise<PayloadResult<number>> {
		let payloadEntries: readonly string[];
		try {
			payloadEntries = await readdir(this.payloadDir);
		} catch (error) {
			return payloadError("payload_write_failed", `Failed to scan payload directory ${this.payloadDir}: ${formatErrorMessage(error)}`);
		}
		const candidates: ParsedPayloadCandidate[] = [];
		for (const payloadEntry of payloadEntries) {
			const parsed = parsePayloadFilename(payloadEntry);
			if (parsed !== null) candidates.push({ parsed });
		}
		return { type: "ok", value: nextPayloadSequence(candidates) };
	}

	private async latestJsonPayloadCandidate(options: { descriptor: string; role: JsonPayloadRole }): Promise<PayloadResult<{ filename: string; parsed: ParsedPayloadFilename }>> {
		let entries: readonly string[];
		try {
			entries = await readdir(this.payloadDir);
		} catch (error) {
			return payloadError("payload_lookup_failed", `Failed to scan payload session ${this.sessionId} at ${this.payloadDir}: ${formatErrorMessage(error)}`);
		}
		const candidates: Array<{ filename: string; parsed: ParsedPayloadFilename }> = [];
		for (const filename of entries) {
			const parsed = parsePayloadFilename(filename);
			if (parsed !== null) candidates.push({ filename, parsed });
		}
		const latest = selectLatestJsonPayloadCandidate(candidates, options);
		if (latest === null) return missingLatestJsonArtifactError({ sessionId: this.sessionId, descriptor: options.descriptor, role: options.role });
		return { type: "ok", value: latest };
	}
}

export function createNodePayloadStoreFactory(): PayloadStoreFactory {
	return {
		open: async (options) => await PayloadStore.open(options),
		fromEnvironment: async (options = {}) => await PayloadStore.fromEnvironment(options),
		openContainingArtifact: async (payloadPath, options = {}) => await PayloadStore.openContainingArtifact(payloadPath, options),
	};
}

export interface InMemoryPayloadStoreFactoryOptions {
	env?: NodeJS.ProcessEnv | undefined;
	tempDir?: string | undefined;
	clock?: PayloadClock | undefined;
	artifacts?: ReadonlyMap<string, string> | Record<string, string> | undefined;
}

const registeredInMemoryPayloadArtifacts = new Map<string, string>();

export class InMemoryPayloadStoreFactory implements PayloadStoreFactory {
	private readonly artifacts: Map<string, string>;
	private readonly env: NodeJS.ProcessEnv | undefined;
	private readonly tempDir: string | undefined;
	private readonly clock: PayloadClock | undefined;

	constructor(options: InMemoryPayloadStoreFactoryOptions = {}) {
		this.artifacts = new Map(options.artifacts instanceof Map ? options.artifacts : Object.entries(options.artifacts ?? {}));
		for (const [payloadPath, text] of this.artifacts.entries()) {
			registeredInMemoryPayloadArtifacts.set(payloadPath, text);
		}
		this.env = options.env === undefined ? undefined : { ...options.env };
		this.tempDir = options.tempDir;
		this.clock = options.clock;
	}

	get artifactPaths(): readonly string[] {
		return [...this.artifacts.keys()].sort();
	}

	artifactText(payloadPath: string): string | undefined {
		return this.artifacts.get(payloadPath);
	}

	async open(options: OpenPayloadStoreOptions): Promise<PayloadResult<PayloadArtifactStore>> {
		if (!isAbsolute(options.root)) return payloadError("payload_root_invalid", `Payload root must be an absolute path: ${options.root}`);
		if (!isSafeSegment(options.sessionId)) {
			return payloadError("harness_session_invalid", `Harness session id must be a safe segment: ${pythonRepr(options.sessionId)}`);
		}
		const payloadDir = join(options.root, "sessions", options.sessionId, "payloads");
		return {
			type: "ok",
			value: new InMemoryPayloadStore({
				root: options.root,
				sessionId: options.sessionId,
				payloadDir,
				clock: options.clock ?? this.clock ?? defaultClock,
				artifacts: this.artifacts,
			}),
		};
	}

	async fromEnvironment(options: PayloadStoreFromEnvironmentOptions = {}): Promise<PayloadResult<PayloadArtifactStore>> {
		const root = resolvePayloadRoot({ env: options.env ?? this.env, tempDir: options.tempDir ?? this.tempDir });
		if (root.type === "error") return root;
		const harnessSessionId = resolveHarnessSessionId(options.explicitHarnessSessionId, { env: options.env ?? this.env });
		if (harnessSessionId.type === "error") return harnessSessionId;
		return await this.open({
			root: root.value,
			sessionId: harnessSessionId.value,
			clock: options.clock ?? this.clock,
		});
	}

	async openContainingArtifact(payloadPath: string, options: { clock?: PayloadClock | undefined } = {}): Promise<PayloadResult<PayloadArtifactStore>> {
		const validated = validateInMemoryArtifactPath(payloadPath, this.artifacts);
		if (validated.type === "error") return validated;
		return await this.open({ root: validated.value.root, sessionId: validated.value.sessionId, clock: options.clock ?? this.clock });
	}
}

class InMemoryPayloadStore implements PayloadArtifactStore {
	readonly root: string;
	readonly sessionId: string;
	readonly payloadDir: string;
	private readonly clock: PayloadClock;
	private readonly artifacts: Map<string, string>;

	constructor(options: { root: string; sessionId: string; payloadDir: string; clock: PayloadClock; artifacts: Map<string, string> }) {
		this.root = options.root;
		this.sessionId = options.sessionId;
		this.payloadDir = options.payloadDir;
		this.clock = options.clock;
		this.artifacts = options.artifacts;
	}

	async writeJsonArtifact(options: { descriptor: string; role: JsonPayloadRole; payload: unknown }): Promise<PayloadResult<PayloadReference>> {
		if (options.role !== "raw" && options.role !== "summary") {
			throw new Error(`JSON artifact role must be 'raw' or 'summary': ${pythonRepr(String(options.role))}`);
		}
		const serialized = serializeJsonPayload(options.payload);
		if (serialized.type === "error") {
			return payloadError("payload_write_failed", `Failed to serialize JSON payload for descriptor ${pythonRepr(options.descriptor)}: ${serialized.message}`);
		}
		return this.writeArtifact({ descriptor: options.descriptor, role: options.role, extension: "json", contentType: "application/json", text: serialized.text });
	}

	async writeTextArtifact(options: { descriptor: string; role: LogPayloadRole; text: string }): Promise<PayloadResult<PayloadReference>> {
		if (options.role !== "log") throw new Error(`Text artifact role must be 'log': ${pythonRepr(String(options.role))}`);
		return this.writeArtifact({ descriptor: options.descriptor, role: options.role, extension: "txt", contentType: "text/plain", text: options.text });
	}

	async readJsonArtifact(options: { payloadPath: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<unknown>> {
		const validated = validateInMemoryArtifactPath(options.payloadPath, this.artifacts);
		if (validated.type === "error") return validated;
		const allowedRoles = options.allowedRoles ?? DEFAULT_JSON_PAYLOAD_ROLES;
		if (!allowedRoles.has(validated.value.role)) {
			return payloadError("payload_lookup_failed", `Payload artifact role ${pythonRepr(validated.value.role)} is not allowed for this lookup: ${options.payloadPath}`);
		}
		if (validated.value.extension !== "json") {
			return payloadError("payload_lookup_failed", `Payload artifact extension must be json: ${options.payloadPath}`);
		}
		const artifactText = this.artifacts.get(options.payloadPath);
		if (artifactText === undefined) return payloadError("payload_lookup_failed", `Payload artifact path does not exist: ${options.payloadPath}`);
		try {
			return { type: "ok", value: JSON.parse(artifactText) as unknown };
		} catch (error) {
			return payloadError("payload_lookup_failed", `Failed to parse JSON payload artifact ${options.payloadPath}: ${formatErrorMessage(error)}`);
		}
	}

	async readJsonArtifactValue(options: { payloadPath: string; pointer: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<unknown>> {
		const document = await this.readJsonArtifact({ payloadPath: options.payloadPath, allowedRoles: options.allowedRoles });
		if (document.type === "error") return document;
		return resolveJsonPointer(document.value, options.pointer);
	}

	async readJsonArtifactWithReference(options: { payloadPath: string; allowedRoles?: ReadonlySet<string> | undefined }): Promise<PayloadResult<ResolvedJsonPayloadArtifact>> {
		const validated = validateInMemoryArtifactPath(options.payloadPath, this.artifacts);
		if (validated.type === "error") return validated;
		const parsed = await this.readJsonArtifact({ payloadPath: options.payloadPath, allowedRoles: options.allowedRoles });
		if (parsed.type === "error") return parsed;
		const artifactText = this.artifacts.get(options.payloadPath);
		if (artifactText === undefined) return payloadError("payload_lookup_failed", `Payload artifact path does not exist: ${options.payloadPath}`);
		return {
			type: "ok",
			value: {
				reference: buildPayloadReference({
					payloadPath: options.payloadPath,
					sessionId: validated.value.sessionId,
					descriptor: validated.value.descriptor,
					role: validated.value.role,
					createdAtUtc: validated.value.createdAtUtc,
					sequence: validated.value.sequence,
					payloadBytes: Buffer.byteLength(artifactText, "utf8"),
					contentType: "application/json",
					extension: validated.value.extension,
				}),
				value: parsed.value,
			},
		};
	}

	async findLatestJsonArtifact(options: { descriptor: string; role: JsonPayloadRole }): Promise<PayloadResult<ResolvedJsonPayloadArtifact>> {
		const candidates: Array<{ payloadPath: string; parsed: ParsedPayloadFilename; text: string }> = [];
		for (const [payloadPath, text] of this.artifacts.entries()) {
			if (dirname(payloadPath) !== this.payloadDir) continue;
			const parsed = parsePayloadFilename(basename(payloadPath));
			if (parsed !== null) candidates.push({ payloadPath, parsed, text });
		}
		const latest = selectLatestJsonPayloadCandidate(candidates, options);
		if (latest === null) return missingLatestJsonArtifactError({ sessionId: this.sessionId, descriptor: options.descriptor, role: options.role });
		const parsed = await this.readJsonArtifact({ payloadPath: latest.payloadPath, allowedRoles: new Set([options.role]) });
		if (parsed.type === "error") return parsed;
		return {
			type: "ok",
			value: {
				reference: buildPayloadReference({
					payloadPath: latest.payloadPath,
					sessionId: this.sessionId,
					descriptor: latest.parsed.descriptor,
					role: latest.parsed.role,
					createdAtUtc: latest.parsed.createdAtUtc,
					sequence: latest.parsed.sequence,
					payloadBytes: Buffer.byteLength(latest.text, "utf8"),
					contentType: "application/json",
					extension: latest.parsed.extension,
				}),
				value: parsed.value,
			},
		};
	}

	private writeArtifact(options: { descriptor: string; role: PayloadRole; extension: PayloadExtension; contentType: string; text: string }): PayloadResult<PayloadReference> {
		requireSafeSegment(options.descriptor, { label: "descriptor" });
		const { createdAtUtc, filenameTimestamp } = payloadTimestamps(this.clock());
		const sequence = this.nextSequence();
		const payloadPath = join(this.payloadDir, payloadFilename({ filenameTimestamp, sequence, descriptor: options.descriptor, role: options.role, extension: options.extension }));
		this.artifacts.set(payloadPath, options.text);
		registeredInMemoryPayloadArtifacts.set(payloadPath, options.text);
		return {
			type: "ok",
			value: buildPayloadReference({
				payloadPath,
				sessionId: this.sessionId,
				descriptor: options.descriptor,
				role: options.role,
				createdAtUtc,
				sequence,
				payloadBytes: Buffer.byteLength(options.text, "utf8"),
				contentType: options.contentType,
				extension: options.extension,
			}),
		};
	}

	private nextSequence(): number {
		const candidates: ParsedPayloadCandidate[] = [];
		for (const payloadPath of this.artifacts.keys()) {
			if (dirname(payloadPath) !== this.payloadDir) continue;
			const parsed = parsePayloadFilename(basename(payloadPath));
			if (parsed !== null) candidates.push({ parsed });
		}
		return nextPayloadSequence(candidates);
	}
}

function validateInMemoryArtifactPath(
	payloadPath: string,
	artifacts: ReadonlyMap<string, string>,
): PayloadResult<ValidatedPayloadArtifactName & { root: string; sessionId: string }> {
	if (!isAbsolute(payloadPath)) return payloadError("payload_lookup_failed", `Payload artifact path must be absolute: ${payloadPath}`);
	if (!artifacts.has(payloadPath)) return payloadError("payload_lookup_failed", `Payload artifact path does not exist: ${payloadPath}`);
	const shaped = validateContainedArtifactPathShape(payloadPath);
	if (shaped.type === "error") return shaped;
	return shaped;
}

function validateContainedArtifactPathShape(payloadPath: string): PayloadResult<ValidatedPayloadArtifactName & { root: string; sessionId: string }> {
	const payloadDir = dirname(payloadPath);
	if (basename(payloadDir) !== "payloads") {
		return payloadError("payload_lookup_failed", `Payload artifact must live under a payloads directory: ${payloadPath}`);
	}

	const sessionDir = dirname(payloadDir);
	const sessionId = basename(sessionDir);
	if (!isSafeSegment(sessionId)) {
		return payloadError("payload_lookup_failed", `Payload artifact session id must be a safe segment: ${pythonRepr(sessionId)}`);
	}
	const sessionsDir = dirname(sessionDir);
	if (basename(sessionsDir) !== "sessions") {
		return payloadError("payload_lookup_failed", `Payload artifact must live under sessions/<session-id>/payloads: ${payloadPath}`);
	}
	const parsed = parsePayloadFilename(basename(payloadPath));
	if (parsed === null) {
		return payloadError("payload_lookup_failed", `Payload artifact filename does not match payload contract: ${basename(payloadPath)}`);
	}
	return {
		type: "ok",
		value: {
			root: dirname(sessionsDir),
			sessionId,
			sequence: parsed.sequence,
			descriptor: parsed.descriptor,
			role: parsed.role,
			extension: parsed.extension,
			createdAtUtc: parsed.createdAtUtc,
		},
	};
}

export interface ParsedPayloadFilename {
	sequence: number;
	descriptor: string;
	role: PayloadRole;
	extension: PayloadExtension;
	createdAtUtc: string;
}

export interface ValidatedPayloadArtifactName {
	sequence: number;
	descriptor: string;
	role: PayloadRole;
	extension: PayloadExtension;
	createdAtUtc: string;
}

/**
 * Validate that an absolute path is a managed payload artifact under
 * `{root}/sessions/{session-id}/payloads/` with a contract-conforming filename.
 */
export async function validateContainedArtifactPath(payloadPath: string): Promise<PayloadResult<ValidatedPayloadArtifactName>> {
	if (!isAbsolute(payloadPath)) return payloadError("payload_lookup_failed", `Payload artifact path must be absolute: ${payloadPath}`);
	const status = await artifactPathStatus(payloadPath);
	if (status === "symlink") return payloadError("payload_lookup_failed", `Payload artifact path must not be a symlink: ${payloadPath}`);
	if (status === "missing") return payloadError("payload_lookup_failed", `Payload artifact path does not exist: ${payloadPath}`);
	if (status === "not-file") return payloadError("payload_lookup_failed", `Payload artifact path must be a regular file: ${payloadPath}`);
	const payloadDir = dirname(payloadPath);
	if (basename(payloadDir) !== "payloads") {
		return payloadError("payload_lookup_failed", `Payload artifact must live under a payloads directory: ${payloadPath}`);
	}

	const sessionId = basename(dirname(payloadDir));
	if (!isSafeSegment(sessionId)) {
		return payloadError("payload_lookup_failed", `Payload artifact session id must be a safe segment: ${pythonRepr(sessionId)}`);
	}
	if (basename(dirname(dirname(payloadDir))) !== "sessions") {
		return payloadError("payload_lookup_failed", `Payload artifact must live under sessions/<session-id>/payloads: ${payloadPath}`);
	}
	const parsed = parsePayloadFilename(basename(payloadPath));
	if (parsed === null) {
		return payloadError("payload_lookup_failed", `Payload artifact filename does not match payload contract: ${basename(payloadPath)}`);
	}
	return {
		type: "ok",
		value: {
			sequence: parsed.sequence,
			descriptor: parsed.descriptor,
			role: parsed.role,
			extension: parsed.extension,
			createdAtUtc: parsed.createdAtUtc,
		},
	};
}


/** Validate and load a JSON payload artifact from an explicit absolute path using the node filesystem adapter. */
export async function readJsonPayloadArtifact(
	payloadPath: string,
	options: { allowedRoles?: ReadonlySet<string> | undefined } = {},
): Promise<PayloadResult<unknown>> {
	const allowedRoles = options.allowedRoles ?? DEFAULT_JSON_PAYLOAD_ROLES;
	const validated = await validateContainedArtifactPath(payloadPath);
	if (validated.type === "error") return validated;
	if (!allowedRoles.has(validated.value.role)) {
		return payloadError("payload_lookup_failed", `Payload artifact role ${pythonRepr(validated.value.role)} is not allowed for this lookup: ${payloadPath}`);
	}
	if (validated.value.extension !== "json") {
		return payloadError("payload_lookup_failed", `Payload artifact extension must be json: ${payloadPath}`);
	}

	let artifactText: string;
	try {
		artifactText = await readFile(payloadPath, "utf8");
	} catch (error) {
		return payloadError("payload_lookup_failed", `Failed to read payload artifact ${payloadPath}: ${formatErrorMessage(error)}`);
	}
	try {
		return { type: "ok", value: JSON.parse(artifactText) as unknown };
	} catch (error) {
		return payloadError("payload_lookup_failed", `Failed to parse JSON payload artifact ${payloadPath}: ${formatErrorMessage(error)}`);
	}
}

/** Validate and load a JSON payload artifact with its store-owned reference using the node filesystem adapter. */
export async function readJsonPayloadArtifactWithReference(
	payloadPath: string,
	options: { allowedRoles?: ReadonlySet<string> | undefined } = {},
): Promise<PayloadResult<ResolvedJsonPayloadArtifact>> {
	const inMemory = readRegisteredInMemoryJsonPayloadArtifactWithReference(payloadPath, options);
	if (inMemory !== null) return inMemory;
	const validated = await validateContainedArtifactPath(payloadPath);
	if (validated.type === "error") return validated;
	const value = await readJsonPayloadArtifact(payloadPath, options);
	if (value.type === "error") return value;
	let payloadStats;
	try {
		payloadStats = await stat(payloadPath);
	} catch (error) {
		return payloadError("payload_lookup_failed", `Failed to stat payload artifact ${payloadPath}: ${formatErrorMessage(error)}`);
	}
	return {
		type: "ok",
		value: {
			reference: buildPayloadReference({
				payloadPath,
				sessionId: basename(dirname(dirname(payloadPath))),
				descriptor: validated.value.descriptor,
				role: validated.value.role,
				createdAtUtc: validated.value.createdAtUtc,
				sequence: validated.value.sequence,
				payloadBytes: payloadStats.size,
				contentType: "application/json",
				extension: validated.value.extension,
			}),
			value: value.value,
		},
	};
}

function readRegisteredInMemoryJsonPayloadArtifactWithReference(
	payloadPath: string,
	options: { allowedRoles?: ReadonlySet<string> | undefined },
): PayloadResult<ResolvedJsonPayloadArtifact> | null {
	const artifactText = registeredInMemoryPayloadArtifacts.get(payloadPath);
	if (artifactText === undefined) return null;
	const validated = validateInMemoryArtifactPath(payloadPath, registeredInMemoryPayloadArtifacts);
	if (validated.type === "error") return validated;
	const allowedRoles = options.allowedRoles ?? DEFAULT_JSON_PAYLOAD_ROLES;
	if (!allowedRoles.has(validated.value.role)) {
		return payloadError("payload_lookup_failed", `Payload artifact role ${pythonRepr(validated.value.role)} is not allowed for this lookup: ${payloadPath}`);
	}
	if (validated.value.extension !== "json") {
		return payloadError("payload_lookup_failed", `Payload artifact extension must be json: ${payloadPath}`);
	}
	try {
		return {
			type: "ok",
			value: {
				reference: buildPayloadReference({
					payloadPath,
					sessionId: validated.value.sessionId,
					descriptor: validated.value.descriptor,
					role: validated.value.role,
					createdAtUtc: validated.value.createdAtUtc,
					sequence: validated.value.sequence,
					payloadBytes: Buffer.byteLength(artifactText, "utf8"),
					contentType: "application/json",
					extension: validated.value.extension,
				}),
				value: JSON.parse(artifactText) as unknown,
			},
		};
	} catch (error) {
		return payloadError("payload_lookup_failed", `Failed to parse JSON payload artifact ${payloadPath}: ${formatErrorMessage(error)}`);
	}
}

/** Read one JSON Pointer value from a validated payload artifact using the node filesystem adapter. */
export async function readJsonPayloadArtifactValue(
	payloadPath: string,
	pointer: string,
	options: { allowedRoles?: ReadonlySet<string> | undefined } = {},
): Promise<PayloadResult<unknown>> {
	const document = await readJsonPayloadArtifact(payloadPath, options);
	if (document.type === "error") return document;
	return resolveJsonPointer(document.value, pointer);
}

/** Resolve an RFC 6901 JSON Pointer against a parsed JSON document. */
export function resolveJsonPointer(document: unknown, pointer: string): PayloadResult<unknown> {
	if (pointer === "") return { type: "ok", value: document };
	if (!pointer.startsWith("/")) {
		return payloadError("payload_lookup_failed", `JSON Pointer must be empty or start with '/': ${pythonRepr(pointer)}`);
	}

	let current: unknown = document;
	for (const rawToken of pointer.split("/").slice(1)) {
		const token = unescapePointerToken(rawToken, pointer);
		if (token.type === "error") return token;
		if (isJsonObject(current)) {
			// Object.hasOwn mirrors Python dict membership; the `in` operator would also match prototype keys.
			if (!Object.hasOwn(current, token.value)) {
				return payloadError("payload_lookup_failed", `JSON Pointer token ${pythonRepr(token.value)} was not found in object: ${pythonRepr(pointer)}`);
			}
			current = current[token.value];
			continue;
		}
		if (Array.isArray(current)) {
			const index = arrayIndexForToken(token.value, pointer);
			if (index.type === "error") return index;
			if (index.value >= current.length) {
				return payloadError(
					"payload_lookup_failed",
					`JSON Pointer array index ${index.value} is out of range for array of length ${current.length}: ${pythonRepr(pointer)}`,
				);
			}
			current = current[index.value];
			continue;
		}
		return payloadError("payload_lookup_failed", `JSON Pointer cannot traverse scalar value at token ${pythonRepr(token.value)}: ${pythonRepr(pointer)}`);
	}
	return { type: "ok", value: current };
}

const reviewInputSchema = z.object({
	id: z.string(),
	author: z.string(),
	body: z.string(),
	state: z.string(),
	submitted_at: z.string(),
});

const reviewCommentInputSchema = z.object({
	id: z.number().int(),
	body: z.string(),
	author: z.string(),
	path: z.string(),
	line: z.number().int().nullable(),
	start_line: z.number().int().nullable(),
	created_at: z.string(),
});

const reviewThreadInputSchema = z.object({
	id: z.string(),
	path: z.string(),
	line: z.number().int().nullable(),
	start_line: z.number().int().nullable(),
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comments: z.array(reviewCommentInputSchema).readonly(),
});

const discussionCommentInputSchema = z.object({
	id: z.number().int(),
	body: z.string(),
	author: z.string(),
	url: z.string(),
});

export const getFeedbackPayloadManifestInputSchema = z.object({
	payload_reference: payloadReferenceSchema,
	pr_number: z.number().int(),
	reviews: z.array(reviewInputSchema).readonly(),
	review_threads: z.array(reviewThreadInputSchema).readonly(),
	discussion_comments: z.array(discussionCommentInputSchema).readonly(),
});

export const prepareRunPayloadManifestInputSchema = z.object({
	payload_reference: payloadReferenceSchema,
	found: z.boolean(),
	current_branch: z.string().nullable().optional(),
	number: z.number().int().nullable().optional(),
	pr_number: z.number().int().nullable().optional(),
	title: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	head_ref_name: z.string().nullable().optional(),
	base_ref_name: z.string().nullable().optional(),
	state: z.string().nullable().optional(),
	reviews: z.array(reviewInputSchema).readonly().optional(),
	review_threads: z.array(reviewThreadInputSchema).readonly().optional(),
	discussion_comments: z.array(discussionCommentInputSchema).readonly().optional(),
	reopened_thread_ids: z.array(z.string()).readonly().optional(),
	restructured_files: z.array(z.unknown()).readonly().optional(),
	warnings: z.array(z.string()).readonly().optional(),
	error: z.string().nullable().optional(),
	returncode: z.number().int().nullable().optional(),
});

export type GetFeedbackPayloadManifestInput = z.input<typeof getFeedbackPayloadManifestInputSchema>;
export type PrepareRunPayloadManifestInput = z.input<typeof prepareRunPayloadManifestInputSchema>;

type Review = PRReview;
type ReviewComment = PRReviewThread["comments"][number];
type ReviewThread = PRReviewThread;
type DiscussionComment = PRDiscussionComment;
type ManifestPayloadReference = z.output<typeof payloadReferenceSchema>;

interface FeedbackCounts extends Record<string, unknown> {
	reviews: number;
	review_threads: number;
	unresolved_review_threads: number;
	resolved_review_threads: number;
	thread_comments: number;
	discussion_comments: number;
}

interface FeedbackCollections {
	reviews: readonly Review[];
	review_threads: readonly ReviewThread[];
	discussion_comments: readonly DiscussionComment[];
}

export interface GetFeedbackPayloadManifest {
	payload_mode: "payload";
	payload_reference: ManifestPayloadReference;
	pr_number: number;
	counts: FeedbackCounts;
	reviews: unknown[];
	review_threads: unknown[];
	discussion_comments: Array<{ comment_id: number; author: string; url: string; body_locator: unknown }>;
}

export interface PrepareRunPayloadManifest {
	payload_mode: "payload";
	payload_reference: ManifestPayloadReference;
	found: boolean;
	current_branch: string | null;
	number: number | null;
	pr_number: number | null;
	title: string | null;
	url: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
	state: string | null;
	counts: FeedbackCounts | null;
	reviews: unknown[];
	review_threads: unknown[];
	discussion_comments: unknown[];
	reopened_thread_ids: string[];
	restructured_files: unknown[];
	warnings: string[];
	error: string | null;
	returncode: number | null;
}

export function buildGetFeedbackPayloadManifest(input: GetFeedbackPayloadManifestInput): GetFeedbackPayloadManifest {
	return {
		payload_mode: "payload",
		payload_reference: input.payload_reference,
		pr_number: input.pr_number,
		counts: feedbackCounts(input),
		reviews: reviewManifestItems(input.reviews),
		review_threads: threadManifestItems(input.review_threads),
		discussion_comments: discussionManifestItems(input.discussion_comments),
	};
}

export function buildPrepareRunPayloadManifest(input: PrepareRunPayloadManifestInput): PrepareRunPayloadManifest {
	const reviews = input.reviews ?? [];
	const reviewThreads = input.review_threads ?? [];
	const discussionComments = input.discussion_comments ?? [];
	return {
		payload_mode: "payload",
		payload_reference: input.payload_reference,
		found: input.found,
		current_branch: input.current_branch ?? null,
		number: input.number ?? null,
		pr_number: input.pr_number ?? input.number ?? null,
		title: input.title ?? null,
		url: input.url ?? null,
		head_ref_name: input.head_ref_name ?? null,
		base_ref_name: input.base_ref_name ?? null,
		state: input.state ?? null,
		counts: input.found ? feedbackCounts({ reviews, review_threads: reviewThreads, discussion_comments: discussionComments }) : null,
		reviews: reviewManifestItems(reviews),
		review_threads: threadManifestItems(reviewThreads),
		discussion_comments: discussionManifestItems(discussionComments),
		reopened_thread_ids: [...(input.reopened_thread_ids ?? [])],
		restructured_files: [...(input.restructured_files ?? [])],
		warnings: [...(input.warnings ?? [])],
		error: input.error ?? null,
		returncode: input.returncode ?? null,
	};
}

export function payloadError(errorType: PayloadErrorType, message: string): { type: "error"; errorType: PayloadErrorType; message: string } {
	return { type: "error", errorType, message };
}

function feedbackCounts(input: FeedbackCollections): FeedbackCounts {
	const resolvedCount = input.review_threads.filter((thread) => thread.is_resolved).length;
	return {
		reviews: input.reviews.length,
		review_threads: input.review_threads.length,
		unresolved_review_threads: input.review_threads.length - resolvedCount,
		resolved_review_threads: resolvedCount,
		thread_comments: input.review_threads.reduce((total, thread) => total + thread.comments.length, 0),
		discussion_comments: input.discussion_comments.length,
	};
}

function reviewManifestItems(reviews: readonly Review[]): unknown[] {
	return reviews.map((review, reviewIndex) => {
		const itemPointer = `/data/reviews/${reviewIndex}`;
		return {
			id: review.id,
			author: review.author,
			state: review.state,
			submitted_at: review.submitted_at,
			body_locator: {
				body_chars: review.body.length,
				json_pointer: `${itemPointer}/body`,
				item_pointer: itemPointer,
				domain: feedbackDomainLocator({ kind: "review", review_id: review.id, author: review.author }),
			},
		};
	});
}

function threadManifestItems(reviewThreads: readonly ReviewThread[]): unknown[] {
	return reviewThreads.map((thread, threadIndex) => {
		const itemPointer = `/data/review_threads/${threadIndex}`;
		return {
			thread_id: thread.id,
			path: thread.path,
			line: thread.line,
			start_line: thread.start_line,
			is_resolved: thread.is_resolved,
			is_outdated: thread.is_outdated,
			comment_count: thread.comments.length,
			item_pointer: itemPointer,
			comments: threadCommentManifestItems(thread, threadIndex),
		};
	});
}

function threadCommentManifestItems(thread: ReviewThread, threadIndex: number): unknown[] {
	return thread.comments.map((comment, commentIndex) => {
		const itemPointer = `/data/review_threads/${threadIndex}/comments/${commentIndex}`;
		return {
			id: comment.id,
			author: comment.author,
			path: comment.path,
			line: comment.line,
			start_line: comment.start_line,
			created_at: comment.created_at,
			body_locator: threadCommentBodyLocator({ comment, thread, commentIndex, itemPointer }),
		};
	});
}

function threadCommentBodyLocator(options: { comment: ReviewComment; thread: ReviewThread; commentIndex: number; itemPointer: string }): unknown {
	return {
		body_chars: options.comment.body.length,
		json_pointer: `${options.itemPointer}/body`,
		item_pointer: options.itemPointer,
		domain: feedbackDomainLocator({
			kind: "review_thread_comment",
			thread_id: options.thread.id,
			comment_id: options.comment.id,
			comment_index: options.commentIndex,
			path: options.comment.path,
			line: options.comment.line,
			start_line: options.comment.start_line,
			is_resolved: options.thread.is_resolved,
			is_outdated: options.thread.is_outdated,
			author: options.comment.author,
		}),
	};
}

function discussionManifestItems(discussionComments: readonly DiscussionComment[]): Array<{ comment_id: number; author: string; url: string; body_locator: unknown }> {
	return discussionComments.map((comment, commentIndex) => {
		const itemPointer = `/data/discussion_comments/${commentIndex}`;
		return {
			comment_id: comment.id,
			author: comment.author,
			url: comment.url,
			body_locator: {
				body_chars: comment.body.length,
				json_pointer: `${itemPointer}/body`,
				item_pointer: itemPointer,
				domain: feedbackDomainLocator({ kind: "discussion_comment", discussion_comment_id: comment.id, author: comment.author }),
			},
		};
	});
}

function feedbackDomainLocator(fields: Partial<Record<string, unknown>> & { kind: string }): Record<string, unknown> {
	return {
		kind: fields.kind,
		review_id: fields.review_id ?? null,
		thread_id: fields.thread_id ?? null,
		comment_id: fields.comment_id ?? null,
		discussion_comment_id: fields.discussion_comment_id ?? null,
		comment_index: fields.comment_index ?? null,
		path: fields.path ?? null,
		line: fields.line ?? null,
		start_line: fields.start_line ?? null,
		is_resolved: fields.is_resolved ?? null,
		is_outdated: fields.is_outdated ?? null,
		author: fields.author ?? null,
	};
}

function unescapePointerToken(token: string, pointer: string): PayloadResult<string> {
	const result: string[] = [];
	let index = 0;
	while (index < token.length) {
		const character = token[index] as string;
		if (character !== "~") {
			result.push(character);
			index += 1;
			continue;
		}
		const escapeCharacter = token[index + 1];
		if (escapeCharacter === undefined) {
			return payloadError("payload_lookup_failed", `Invalid JSON Pointer escape in ${pythonRepr(pointer)}: trailing '~'`);
		}
		if (escapeCharacter === "0") result.push("~");
		else if (escapeCharacter === "1") result.push("/");
		else return payloadError("payload_lookup_failed", `Invalid JSON Pointer escape '~${escapeCharacter}' in ${pythonRepr(pointer)}`);
		index += 2;
	}
	return { type: "ok", value: result.join("") };
}

function arrayIndexForToken(token: string, pointer: string): PayloadResult<number> {
	if (token === "-") {
		return payloadError("payload_lookup_failed", `JSON Pointer '-' token is not a valid array index: ${pythonRepr(pointer)}`);
	}
	if (token === "0") return { type: "ok", value: 0 };
	if (token.startsWith("0")) {
		return payloadError("payload_lookup_failed", `JSON Pointer array index must not contain leading zeroes: ${pythonRepr(pointer)}`);
	}
	if (!/^[0-9]+$/.test(token)) {
		return payloadError("payload_lookup_failed", `JSON Pointer array token is not a non-negative integer: ${pythonRepr(pointer)}`);
	}
	return { type: "ok", value: Number(token) };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defaultClock(): Date {
	return new Date();
}

export function payloadTimestamps(value: Date): { createdAtUtc: string; filenameTimestamp: string } {
	const year = String(value.getUTCFullYear()).padStart(4, "0");
	const month = String(value.getUTCMonth() + 1).padStart(2, "0");
	const day = String(value.getUTCDate()).padStart(2, "0");
	const hours = String(value.getUTCHours()).padStart(2, "0");
	const minutes = String(value.getUTCMinutes()).padStart(2, "0");
	const seconds = String(value.getUTCSeconds()).padStart(2, "0");
	return {
		createdAtUtc: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`,
		filenameTimestamp: `${year}${month}${day}t${hours}${minutes}${seconds}z`,
	};
}

export function payloadFilename(options: { filenameTimestamp: string; sequence: number; descriptor: string; role: PayloadRole; extension: PayloadExtension }): string {
	const sequenceText = String(options.sequence).padStart(4, "0");
	return `${options.filenameTimestamp}-${sequenceText}-${options.descriptor}.${options.role}.${options.extension}`;
}

export function parsePayloadFilename(filename: string): ParsedPayloadFilename | null {
	const match = PAYLOAD_FILENAME_PATTERN.exec(filename);
	const groups = match?.groups;
	if (groups?.sequence === undefined || groups.descriptor === undefined || groups.role === undefined || groups.extension === undefined) return null;
	return {
		sequence: Number(groups.sequence),
		descriptor: groups.descriptor,
		role: groups.role as PayloadRole,
		extension: groups.extension as PayloadExtension,
		createdAtUtc: createdAtUtcFromFilenameTimestamp(filename.slice(0, 16)),
	};
}

function createdAtUtcFromFilenameTimestamp(value: string): string {
	return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
}

export function buildPayloadReference(options: {
	payloadPath: string;
	sessionId: string;
	descriptor: string;
	role: PayloadRole;
	createdAtUtc: string;
	sequence: number;
	payloadBytes: number;
	contentType: string;
	extension: PayloadExtension;
}): PayloadReference {
	return {
		payload_path: options.payloadPath,
		session_id: options.sessionId,
		descriptor: options.descriptor,
		role: options.role,
		created_at_utc: options.createdAtUtc,
		sequence: options.sequence,
		payload_bytes: options.payloadBytes,
		content_type: options.contentType,
		extension: options.extension,
	};
}

export function missingLatestJsonArtifactError(options: { sessionId: string; descriptor: string; role: JsonPayloadRole }): PayloadResult<never> {
	return payloadError(
		"payload_lookup_failed",
		`No JSON payload artifact found in session ${options.sessionId} for descriptor ${options.descriptor}, role ${options.role}, extension json.`,
	);
}

/**
 * Serialize JSON content byte-for-byte like Python `json.dumps(payload, indent=2) + "\n"`,
 * including `ensure_ascii` escaping of non-ASCII characters.
 */
export function serializeJsonPayload(payload: unknown): { type: "ok"; text: string } | { type: "error"; message: string } {
	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(payload, null, 2);
	} catch (error) {
		return { type: "error", message: formatErrorMessage(error) };
	}
	if (serialized === undefined) return { type: "error", message: "Payload is not JSON serializable" };
	const asciiSerialized = serialized.replace(/[\u007f-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
	return { type: "ok", text: `${asciiSerialized}\n` };
}

async function ensurePrivateDirectory(
	path: string,
	options: { notDirectoryErrorType: PayloadErrorType; createErrorType: PayloadErrorType },
): Promise<PayloadResult<null>> {
	const status = await directoryStatus(path);
	if (status === "symlink") return payloadError("payload_directory_unsafe", `Managed payload path must not be a symlink: ${path}`);
	if (status === "not-directory") return payloadError(options.notDirectoryErrorType, `Managed payload path must be a directory: ${path}`);
	if (status === "directory") return await validatePrivateDirectory(path);

	try {
		await mkdir(path, { mode: 0o700 });
	} catch (error) {
		if (isErrnoCode(error, "EEXIST")) {
			const raceStatus = await directoryStatus(path);
			if (raceStatus !== "directory") return payloadError(options.notDirectoryErrorType, `Managed payload path must be a directory: ${path}`);
			return await validatePrivateDirectory(path);
		}
		return payloadError(options.createErrorType, `Failed to create managed payload directory ${path}: ${formatErrorMessage(error)}`);
	}

	try {
		await chmod(path, 0o700);
	} catch (error) {
		return payloadError("payload_directory_unsafe", `Failed to set private permissions on managed payload directory ${path}: ${formatErrorMessage(error)}`);
	}
	return await validatePrivateDirectory(path);
}

async function validatePrivateDirectory(path: string): Promise<PayloadResult<null>> {
	if (process.platform === "win32") return { type: "ok", value: null };
	let mode: number;
	try {
		mode = (await stat(path)).mode & 0o777;
	} catch (error) {
		return payloadError("payload_directory_unsafe", `Failed to inspect managed payload directory ${path}: ${formatErrorMessage(error)}`);
	}
	if ((mode & 0o077) !== 0) {
		return payloadError("payload_directory_unsafe", `Managed payload directory must not be group/world accessible: ${path}`);
	}
	return { type: "ok", value: null };
}

async function directoryStatus(path: string): Promise<"missing" | "symlink" | "directory" | "not-directory"> {
	let entryStat;
	try {
		entryStat = await lstat(path);
	} catch (error) {
		if (isErrnoCode(error, "ENOENT")) return "missing";
		return "not-directory";
	}
	if (entryStat.isSymbolicLink()) return "symlink";
	if (entryStat.isDirectory()) return "directory";
	return "not-directory";
}

async function artifactPathStatus(path: string): Promise<"missing" | "symlink" | "file" | "not-file"> {
	let entryStat;
	try {
		entryStat = await lstat(path);
	} catch (error) {
		if (isErrnoCode(error, "ENOENT")) return "missing";
		return "not-file";
	}
	if (entryStat.isSymbolicLink()) return "symlink";
	if (entryStat.isFile()) return "file";
	return "not-file";
}

async function writeBytesExclusive(path: string, payload: Buffer): Promise<{ type: "written" } | { type: "exists" } | { type: "error"; message: string }> {
	let fileHandle;
	try {
		fileHandle = await open(path, "wx", 0o600);
	} catch (error) {
		if (isErrnoCode(error, "EEXIST")) return { type: "exists" };
		return { type: "error", message: formatErrorMessage(error) };
	}
	try {
		if (process.platform !== "win32") await fileHandle.chmod(0o600);
		await fileHandle.write(payload);
		await fileHandle.close();
		return { type: "written" };
	} catch (error) {
		await closeAfterWriteFailure(fileHandle);
		await removePartialPayloadFile(path);
		return { type: "error", message: formatErrorMessage(error) };
	}
}

async function closeAfterWriteFailure(fileHandle: { close(): Promise<void> }): Promise<void> {
	try {
		await fileHandle.close();
	} catch {
		// Best-effort cleanup close: preserve the original write/open failure.
	}
}

async function removePartialPayloadFile(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch {
		// Best-effort cleanup of a partially written artifact.
	}
}

function isErrnoCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}


export function pythonRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

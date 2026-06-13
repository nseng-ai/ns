import { chmod, lstat, mkdir, open, readdir, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

import { formatErrorMessage } from "@asdl/core";

import { pythonRepr } from "./string-values.ts";

export const ASDL_PAYLOAD_ROOT_ENV = "ASDL_PAYLOAD_ROOT";
export const ASDL_PAYLOAD_SESSION_ID_ENV = "ASDL_PAYLOAD_SESSION_ID";

export const SAFE_SEGMENT_PATTERN_TEXT = "^[a-z0-9][a-z0-9._-]{0,127}$";
const SAFE_SEGMENT_PATTERN = new RegExp(SAFE_SEGMENT_PATTERN_TEXT);

export const PAYLOAD_FILENAME_PATTERN = /^\d{8}t\d{6}z-(?<sequence>\d+)-(?<descriptor>[a-z0-9][a-z0-9._-]{0,127})\.(?<role>raw|summary|log)\.(?<extension>json|txt)$/;

export type PayloadErrorType =
	| "payload_session_required"
	| "payload_session_invalid"
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

export function resolvePayloadSessionId(explicitSessionId: string | null | undefined, options: { env?: NodeJS.ProcessEnv | undefined } = {}): PayloadResult<string> {
	const sourceEnv = options.env ?? process.env;
	let sessionId: string;
	if (explicitSessionId !== undefined && explicitSessionId !== null && explicitSessionId !== "") {
		sessionId = explicitSessionId;
	} else {
		const envSessionId = sourceEnv[ASDL_PAYLOAD_SESSION_ID_ENV];
		if (envSessionId === undefined || envSessionId === "") {
			return payloadError(
				"payload_session_required",
				`Payload artifact mode requires a session id from an explicit option or ${ASDL_PAYLOAD_SESSION_ID_ENV}.`,
			);
		}
		sessionId = envSessionId;
	}
	if (isSafeSegment(sessionId)) return { type: "ok", value: sessionId };
	return payloadError("payload_session_invalid", `Payload session id must be a safe segment: ${pythonRepr(sessionId)}`);
}

export interface OpenPayloadStoreOptions {
	root: string;
	sessionId: string;
	clock?: PayloadClock | undefined;
}

export interface PayloadStoreFromEnvironmentOptions {
	explicitSessionId?: string | null | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	tempDir?: string | undefined;
	clock?: PayloadClock | undefined;
}

/** Store for one validated payload root and session id. Filesystem layout: `{root}/sessions/{session-id}/payloads/`. */
export class PayloadStore {
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
			return payloadError("payload_session_invalid", `Payload session id must be a safe segment: ${pythonRepr(options.sessionId)}`);
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
			value: new PayloadStore({ root: options.root, sessionId: options.sessionId, payloadDir, clock: options.clock ?? defaultClock }),
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

	/** Open a store using environment-backed root and session-id resolution. */
	static async fromEnvironment(options: PayloadStoreFromEnvironmentOptions = {}): Promise<PayloadResult<PayloadStore>> {
		const root = resolvePayloadRoot({ env: options.env, tempDir: options.tempDir });
		if (root.type === "error") return root;
		const sessionId = resolvePayloadSessionId(options.explicitSessionId, { env: options.env });
		if (sessionId.type === "error") return sessionId;
		return await PayloadStore.open({ root: root.value, sessionId: sessionId.value, clock: options.clock });
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
				value: {
					payload_path: payloadPath,
					session_id: this.sessionId,
					descriptor: options.descriptor,
					role: options.role,
					created_at_utc: createdAtUtc,
					sequence,
					payload_bytes: options.payloadBytes.byteLength,
					content_type: options.contentType,
					extension: options.extension,
				},
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
		let maxSequence = 0;
		for (const payloadEntry of payloadEntries) {
			const match = PAYLOAD_FILENAME_PATTERN.exec(payloadEntry);
			if (match?.groups?.sequence !== undefined) maxSequence = Math.max(maxSequence, Number(match.groups.sequence));
		}
		return { type: "ok", value: maxSequence + 1 };
	}
}

export interface ValidatedPayloadArtifactName {
	sequence: number;
	descriptor: string;
	role: PayloadRole;
	extension: PayloadExtension;
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
	const match = PAYLOAD_FILENAME_PATTERN.exec(basename(payloadPath));
	const groups = match?.groups;
	if (groups?.sequence === undefined || groups.descriptor === undefined || groups.role === undefined || groups.extension === undefined) {
		return payloadError("payload_lookup_failed", `Payload artifact filename does not match payload contract: ${basename(payloadPath)}`);
	}
	return {
		type: "ok",
		value: {
			sequence: Number(groups.sequence),
			descriptor: groups.descriptor,
			// The filename pattern's alternations guarantee these literal values at runtime.
			role: groups.role as PayloadRole,
			extension: groups.extension as PayloadExtension,
		},
	};
}


export function payloadError(errorType: PayloadErrorType, message: string): { type: "error"; errorType: PayloadErrorType; message: string } {
	return { type: "error", errorType, message };
}

function defaultClock(): Date {
	return new Date();
}

function payloadTimestamps(value: Date): { createdAtUtc: string; filenameTimestamp: string } {
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

function payloadFilename(options: { filenameTimestamp: string; sequence: number; descriptor: string; role: PayloadRole; extension: PayloadExtension }): string {
	const sequenceText = String(options.sequence).padStart(4, "0");
	return `${options.filenameTimestamp}-${sequenceText}-${options.descriptor}.${options.role}.${options.extension}`;
}

/**
 * Serialize JSON content byte-for-byte like Python `json.dumps(payload, indent=2) + "\n"`,
 * including `ensure_ascii` escaping of non-ASCII characters.
 */
function serializeJsonPayload(payload: unknown): { type: "ok"; text: string } | { type: "error"; message: string } {
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

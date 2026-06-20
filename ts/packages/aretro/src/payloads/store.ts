/**
 * Payload artifact store.
 */

import {
	chmodSync,
	closeSync,
	fchmodSync,
	constants,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeSync,
	type Stats,
} from "node:fs";
import { isAbsolute, join } from "node:path";

import { PayloadError } from "./errors.ts";
import { PAYLOAD_FILENAME_PATTERN } from "./filename.ts";
import type { PayloadExtension, PayloadReference, PayloadRole } from "./models.ts";
import { resolvePayloadRoot, resolvePayloadSessionId } from "./root.ts";
import { isSafeSegment, requireSafeSegment } from "./segments.ts";

export type JsonPayloadRole = "raw" | "summary";
export type LogPayloadRole = "log";

export interface PayloadStoreOptions {
	root: string;
	sessionId: string;
	clock?: () => Date;
}

export class PayloadStore {
	readonly root: string;
	readonly sessionId: string;
	readonly payloadDir: string;
	private readonly _clock: () => Date;

	constructor(options: PayloadStoreOptions) {
		this.root = options.root;
		this.sessionId = options.sessionId;
		this._clock = options.clock ?? defaultClock;

		if (!isAbsolute(this.root)) {
			throw new PayloadError(
				"payload_root_invalid",
				`Payload root must be an absolute path: ${this.root}`,
			);
		}
		if (!isSafeSegment(this.sessionId)) {
			throw new PayloadError(
				"payload_session_invalid",
				`Payload session id must be a safe segment: ${JSON.stringify(this.sessionId)}`,
			);
		}

		const sessionsDir = join(this.root, "sessions");
		const sessionDir = join(sessionsDir, this.sessionId);
		this.payloadDir = join(sessionDir, "payloads");

		ensurePrivateDirectory(this.root, {
			notDirectoryErrorType: "payload_root_invalid",
			createErrorType: "payload_root_invalid",
		});
		ensurePrivateDirectory(sessionsDir, {
			notDirectoryErrorType: "payload_directory_unsafe",
			createErrorType: "payload_directory_unsafe",
		});
		ensurePrivateDirectory(sessionDir, {
			notDirectoryErrorType: "payload_directory_unsafe",
			createErrorType: "payload_directory_unsafe",
		});
		ensurePrivateDirectory(this.payloadDir, {
			notDirectoryErrorType: "payload_directory_unsafe",
			createErrorType: "payload_directory_unsafe",
		});
	}

	static open(options: { root: string; sessionId: string; clock?: () => Date }): PayloadStore {
		return new PayloadStore(options);
	}

	static fromEnvironment(options?: {
		explicitSessionId?: string;
		env?: Record<string, string | undefined>;
		tempDir?: string;
		clock?: () => Date;
	}): PayloadStore {
		const rootOpts: { env?: Record<string, string | undefined>; tempDir?: string } = {};
		if (options?.env !== undefined) rootOpts.env = options.env;
		if (options?.tempDir !== undefined) rootOpts.tempDir = options.tempDir;
		const sessionIdOpts: { env?: Record<string, string | undefined> } = {};
		if (options?.env !== undefined) sessionIdOpts.env = options.env;
		return new PayloadStore({
			root: resolvePayloadRoot(rootOpts),
			sessionId: resolvePayloadSessionId(options?.explicitSessionId, sessionIdOpts),
			...(options?.clock !== undefined && { clock: options.clock }),
		});
	}

	writeJsonArtifact(options: {
		descriptor: string;
		role: JsonPayloadRole;
		payload: unknown;
	}): PayloadReference {
		if (options.role !== "raw" && options.role !== "summary") {
			throw new Error(
				`JSON artifact role must be 'raw' or 'summary': ${JSON.stringify(options.role)}`,
			);
		}
		let payloadBytes: Buffer;
		try {
			payloadBytes = Buffer.from(JSON.stringify(options.payload, null, 2) + "\n", "utf-8");
		} catch (error) {
			throw new PayloadError(
				"payload_write_failed",
				`Failed to serialize JSON payload for descriptor ${JSON.stringify(options.descriptor)}: ${String(error)}`,
				error,
			);
		}

		return this._writeArtifact({
			descriptor: options.descriptor,
			role: options.role,
			extension: "json",
			contentType: "application/json",
			payloadBytes,
		});
	}

	writeTextArtifact(options: {
		descriptor: string;
		role: LogPayloadRole;
		text: string;
	}): PayloadReference {
		if (options.role !== "log") {
			throw new Error(`Text artifact role must be 'log': ${JSON.stringify(options.role)}`);
		}
		return this._writeArtifact({
			descriptor: options.descriptor,
			role: options.role,
			extension: "txt",
			contentType: "text/plain",
			payloadBytes: Buffer.from(options.text, "utf-8"),
		});
	}

	private _writeArtifact(options: {
		descriptor: string;
		role: PayloadRole;
		extension: PayloadExtension;
		contentType: string;
		payloadBytes: Buffer;
	}): PayloadReference {
		requireSafeSegment(options.descriptor, "descriptor");
		const { createdAtUtc, filenameTimestamp } = payloadTimestamps(this._clock());

		while (true) {
			const sequence = this._nextSequence();
			const payloadPath = join(
				this.payloadDir,
				payloadFilename({
					filenameTimestamp,
					sequence,
					descriptor: options.descriptor,
					role: options.role,
					extension: options.extension,
				}),
			);
			try {
				writeBytesExclusive(payloadPath, options.payloadBytes);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "EEXIST") {
					continue;
				}
				throw new PayloadError(
					"payload_write_failed",
					`Failed to write payload artifact ${payloadPath}: ${String(error)}`,
					error,
				);
			}

			return {
				payload_path: payloadPath,
				session_id: this.sessionId,
				descriptor: options.descriptor,
				role: options.role,
				created_at_utc: createdAtUtc,
				sequence,
				payload_bytes: options.payloadBytes.length,
				content_type: options.contentType,
				extension: options.extension,
			};
		}
	}

	private _nextSequence(): number {
		let maxSequence = 0;
		let payloadEntries: string[];
		try {
			payloadEntries = readdirSync(this.payloadDir);
		} catch (error) {
			throw new PayloadError(
				"payload_write_failed",
				`Failed to scan payload directory ${this.payloadDir}: ${String(error)}`,
				error,
			);
		}

		for (const entry of payloadEntries) {
			const match = PAYLOAD_FILENAME_PATTERN.exec(entry);
			if (match !== null && match.groups !== undefined) {
				const sequenceStr = match.groups.sequence;
				if (sequenceStr !== undefined) {
					maxSequence = Math.max(maxSequence, Number.parseInt(sequenceStr, 10));
				}
			}
		}
		return maxSequence + 1;
	}
}

function defaultClock(): Date {
	return new Date();
}

function payloadTimestamps(value: Date): { createdAtUtc: string; filenameTimestamp: string } {
	const utcValue = new Date(value.getTime());
	utcValue.setUTCMilliseconds(0);
	const createdAtUtc = utcValue.toISOString().replace(/\.\d{3}Z$/, "Z");
	const year = utcValue.getUTCFullYear().toString().padStart(4, "0");
	const month = (utcValue.getUTCMonth() + 1).toString().padStart(2, "0");
	const day = utcValue.getUTCDate().toString().padStart(2, "0");
	const hour = utcValue.getUTCHours().toString().padStart(2, "0");
	const minute = utcValue.getUTCMinutes().toString().padStart(2, "0");
	const second = utcValue.getUTCSeconds().toString().padStart(2, "0");
	const filenameTimestamp = `${year}${month}${day}t${hour}${minute}${second}z`;
	return { createdAtUtc, filenameTimestamp };
}

function payloadFilename(options: {
	filenameTimestamp: string;
	sequence: number;
	descriptor: string;
	role: PayloadRole;
	extension: PayloadExtension;
}): string {
	return `${options.filenameTimestamp}-${options.sequence.toString().padStart(4, "0")}-${options.descriptor}.${options.role}.${options.extension}`;
}

function ensurePrivateDirectory(
	dirPath: string,
	options: {
		notDirectoryErrorType: "payload_root_invalid" | "payload_directory_unsafe";
		createErrorType: "payload_root_invalid" | "payload_directory_unsafe";
	},
): void {
	let stats: Stats | undefined;
	try {
		stats = lstatSync(dirPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw new PayloadError(
				options.createErrorType,
				`Failed to inspect managed payload directory ${dirPath}: ${String(error)}`,
				error,
			);
		}
	}

	if (stats !== undefined) {
		if (stats.isSymbolicLink()) {
			throw new PayloadError(
				"payload_directory_unsafe",
				`Managed payload path must not be a symlink: ${dirPath}`,
			);
		}
		if (!stats.isDirectory()) {
			throw new PayloadError(
				options.notDirectoryErrorType,
				`Managed payload path must be a directory: ${dirPath}`,
			);
		}
		validatePrivateDirectory(dirPath);
		return;
	}

	try {
		mkdirSync(dirPath, { mode: 0o700 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			try {
				const retryStats = lstatSync(dirPath);
				if (retryStats.isSymbolicLink() || !retryStats.isDirectory()) {
					throw new PayloadError(
						options.notDirectoryErrorType,
						`Managed payload path must be a directory: ${dirPath}`,
					);
				}
				validatePrivateDirectory(dirPath);
				return;
			} catch (retryError) {
				throw new PayloadError(
					options.createErrorType,
					`Failed to inspect payload directory after EEXIST: ${dirPath}`,
					retryError,
				);
			}
		}
		throw new PayloadError(
			options.createErrorType,
			`Failed to create managed payload directory ${dirPath}: ${String(error)}`,
			error,
		);
	}

	try {
		chmodSync(dirPath, 0o700);
	} catch (error) {
		throw new PayloadError(
			"payload_directory_unsafe",
			`Failed to set private permissions on managed payload directory ${dirPath}: ${String(error)}`,
			error,
		);
	}
	validatePrivateDirectory(dirPath);
}

function validatePrivateDirectory(dirPath: string): void {
	if (process.platform !== "linux" && process.platform !== "darwin") {
		return;
	}
	let stats: Stats;
	try {
		stats = statSync(dirPath);
	} catch (error) {
		throw new PayloadError(
			"payload_directory_unsafe",
			`Failed to inspect managed payload directory ${dirPath}: ${String(error)}`,
			error,
		);
	}
	const pathMode = stats.mode & 0o777;
	if ((pathMode & 0o077) !== 0) {
		throw new PayloadError(
			"payload_directory_unsafe",
			`Managed payload directory must not be group/world accessible: ${dirPath}`,
		);
	}
}

function writeBytesExclusive(filePath: string, payload: Buffer): void {
	let fd: number | undefined;
	let hasCreatedPath = false;
	try {
		fd = openSync(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
		hasCreatedPath = true;
		setPrivateFileMode(fd);
		writeBytesToFd(fd, payload);
		closeSync(fd);
		fd = undefined;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw error;
		}
		if (fd !== undefined) {
			closeFdAfterWriteFailure(fd);
		}
		if (hasCreatedPath) {
			removePartialPayloadFile(filePath);
		}
		throw error;
	}
}

function setPrivateFileMode(fd: number): void {
	if (process.platform === "linux" || process.platform === "darwin") {
		fchmodSync(fd, 0o600);
	}
}

function writeBytesToFd(fd: number, payload: Buffer): void {
	let bytesWrittenTotal = 0;
	while (bytesWrittenTotal < payload.length) {
		const bytesWritten = writeSync(fd, payload, bytesWrittenTotal);
		if (bytesWritten === 0) {
			throw new Error("write returned 0 bytes");
		}
		bytesWrittenTotal += bytesWritten;
	}
}

function closeFdAfterWriteFailure(fd: number): void {
	try {
		closeSync(fd);
	} catch {
		// Best-effort cleanup close: preserve the original write/open failure.
	}
}

function removePartialPayloadFile(filePath: string): void {
	try {
		const stats = statSync(filePath);
		if (stats.isFile()) {
			unlinkSync(filePath);
		}
	} catch {
		// Best-effort cleanup: preserve the original write failure.
	}
}

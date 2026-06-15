import { basename, dirname, isAbsolute, join } from "node:path";

import { formatErrorMessage } from "@asdl/core";

import {
	DEFAULT_JSON_PAYLOAD_ROLES,
	buildPayloadReference,
	defaultClock,
	isSafeSegment,
	missingLatestJsonArtifactError,
	nextPayloadSequence,
	parsePayloadFilename,
	payloadError,
	payloadFilename,
	payloadTimestamps,
	pythonRepr,
	requireSafeSegment,
	resolveHarnessSessionId,
	resolveJsonPointer,
	resolvePayloadRoot,
	selectLatestJsonPayloadCandidate,
	serializeJsonPayload,
	type JsonPayloadRole,
	type LogPayloadRole,
	type OpenPayloadStoreOptions,
	type ParsedPayloadCandidate,
	type ParsedPayloadFilename,
	type PayloadArtifactStore,
	type PayloadClock,
	type PayloadExtension,
	type PayloadReference,
	type PayloadResult,
	type PayloadRole,
	type PayloadStoreFactory,
	type PayloadStoreFromEnvironmentOptions,
	type ResolvedJsonPayloadArtifact,
	type ValidatedPayloadArtifactName,
} from "./payload-store.ts";

export interface InMemoryPayloadStoreFactoryOptions {
	env?: NodeJS.ProcessEnv | undefined;
	tempDir?: string | undefined;
	clock?: PayloadClock | undefined;
	artifacts?: ReadonlyMap<string, string> | Record<string, string> | undefined;
}

export class InMemoryPayloadStoreFactory implements PayloadStoreFactory {
	private readonly artifacts: Map<string, string>;
	private readonly env: NodeJS.ProcessEnv | undefined;
	private readonly tempDir: string | undefined;
	private readonly clock: PayloadClock | undefined;

	constructor(options: InMemoryPayloadStoreFactoryOptions = {}) {
		this.artifacts = new Map(options.artifacts instanceof Map ? options.artifacts : Object.entries(options.artifacts ?? {}));
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


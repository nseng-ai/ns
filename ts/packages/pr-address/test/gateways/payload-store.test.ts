import { mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, test } from "vitest";

import { useTempDirs } from "../support/temp.ts";

import {
	defaultPayloadRoot,
	derivePayloadSessionIdFromHarnessSessionId,
	PayloadStore,
	readJsonPayloadArtifact,
	readJsonPayloadArtifactValue,
	resolveHarnessSessionId,
	resolveJsonPointer,
	resolvePayloadRoot,
	resolvePayloadSession,
	type PayloadClock,
	type PayloadResult,
} from "../../src/payload-store.ts";

interface WriteParityFixture {
	session_id: string;
	clock_iso_timestamps: readonly string[];
	writes: ReadonlyArray<
		| { kind: "json"; descriptor: string; role: "raw" | "summary"; payload: unknown }
		| { kind: "text"; descriptor: string; role: "log"; text: string }
	>;
	expected_directories: readonly string[];
	expected_references: ReadonlyArray<Record<string, unknown>>;
	expected_files: Record<string, string>;
}

interface ErrorParityFixture {
	document: unknown;
	cases: ReadonlyArray<{ name: string; error_type: string; message: string }>;
}

interface ObservedError {
	errorType: string;
	message: string;
}

const FIXTURE_DIR = new URL("../fixtures/payload-store/", import.meta.url);
const writeParityFixture = (await readJsonFixture("write-parity.json")) as WriteParityFixture;
const errorParityFixture = (await readJsonFixture("error-parity.json")) as ErrorParityFixture;
const isPosix = process.platform !== "win32";
const makeScopedTempDir = useTempDirs();

async function readJsonFixture(name: string): Promise<unknown> {
	return JSON.parse(await readFile(new URL(name, FIXTURE_DIR), "utf8"));
}

async function makeTempDir(): Promise<string> {
	return makeScopedTempDir("pr-address-payload-store-");
}

function sequenceClock(isoTimestamps: readonly string[]): PayloadClock {
	const remaining = isoTimestamps.map((value) => {
		const parsed = new Date(value);
		expect(Number.isNaN(parsed.getTime()), `fixture clock value must parse: ${value}`).toBe(false);
		return parsed;
	});
	return () => {
		const next = remaining.shift();
		if (next === undefined) throw new Error("fixed clock exhausted");
		return next;
	};
}

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

function expectError<T>(result: PayloadResult<T>): ObservedError {
	if (result.type !== "error") throw new Error("expected error result, got ok");
	return { errorType: result.errorType, message: result.message };
}

async function expectThrownMessage(action: () => Promise<unknown>): Promise<ObservedError> {
	try {
		await action();
	} catch (error) {
		return { errorType: "value_error", message: error instanceof Error ? error.message : String(error) };
	}
	throw new Error("expected action to throw");
}

async function listRelativeEntries(root: string): Promise<{ directories: string[]; files: string[] }> {
	const directories: string[] = [];
	const files: string[] = [];
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	for (const entry of entries) {
		const relativePath = relative(root, join(entry.parentPath, entry.name));
		if (entry.isDirectory()) directories.push(relativePath);
		else files.push(relativePath);
	}
	directories.sort();
	files.sort();
	return { directories, files };
}

async function fileMode(path: string): Promise<number> {
	return (await stat(path)).mode & 0o777;
}

describe("payload store write parity with Python asdl_core.payloads", () => {
	test("replaying fixture writes produces a byte-identical session tree and references", async () => {
		const tempDir = await makeTempDir();
		const root = join(tempDir, "payload-root");
		const store = expectOk(
			await PayloadStore.open({ root, sessionId: writeParityFixture.session_id, clock: sequenceClock(writeParityFixture.clock_iso_timestamps) }),
		);

		const references: Array<Record<string, unknown>> = [];
		for (const write of writeParityFixture.writes) {
			const reference =
				write.kind === "json"
					? expectOk(await store.writeJsonArtifact({ descriptor: write.descriptor, role: write.role, payload: write.payload }))
					: expectOk(await store.writeTextArtifact({ descriptor: write.descriptor, role: write.role, text: write.text }));
			references.push({ ...reference, payload_path: relative(root, reference.payload_path) });
		}

		expect(references).toEqual(writeParityFixture.expected_references);

		const observed = await listRelativeEntries(root);
		expect(observed.directories).toEqual([...writeParityFixture.expected_directories]);
		expect(observed.files).toEqual(Object.keys(writeParityFixture.expected_files).sort());
		for (const [relativePath, expectedContent] of Object.entries(writeParityFixture.expected_files)) {
			expect(await readFile(join(root, relativePath), "utf8"), relativePath).toBe(expectedContent);
		}

		if (isPosix) {
			expect(await fileMode(root)).toBe(0o700);
			for (const directory of writeParityFixture.expected_directories) expect(await fileMode(join(root, directory))).toBe(0o700);
			for (const relativePath of Object.keys(writeParityFixture.expected_files)) expect(await fileMode(join(root, relativePath))).toBe(0o600);
		}
	});

	test("written artifacts round-trip through lookup helpers", async () => {
		const tempDir = await makeTempDir();
		const store = expectOk(
			await PayloadStore.open({ root: join(tempDir, "payload-root"), sessionId: "sess-1", clock: sequenceClock(writeParityFixture.clock_iso_timestamps) }),
		);
		const reference = expectOk(await store.writeJsonArtifact({ descriptor: "feedback", role: "raw", payload: { exit_code: 0, data: { text: "café" } } }));

		expect(expectOk(await readJsonPayloadArtifact(reference.payload_path))).toEqual({ exit_code: 0, data: { text: "café" } });
		expect(expectOk(await readJsonPayloadArtifactValue(reference.payload_path, "/data/text"))).toBe("café");

		const containing = expectOk(await PayloadStore.openContainingArtifact(reference.payload_path));
		expect(containing.root).toBe(store.root);
		expect(containing.sessionId).toBe("sess-1");
		expect(containing.payloadDir).toBe(store.payloadDir);
	});
});

describe("payload store error parity with Python asdl_core.payloads", () => {
	test("error types and messages match the Python fixture", async () => {
		const root = await makeTempDir();
		const actualByName = await collectErrorCases(root);

		for (const expectedCase of errorParityFixture.cases) {
			const actual = actualByName.get(expectedCase.name);
			expect(actual, expectedCase.name).toBeDefined();
			if (actual === undefined) continue;
			expect(
				{ name: expectedCase.name, error_type: actual.errorType, message: actual.message.replaceAll(root, "{ROOT}") },
				expectedCase.name,
			).toEqual(expectedCase);
		}
		expect([...actualByName.keys()].sort()).toEqual(errorParityFixture.cases.map((errorCase) => errorCase.name).sort());
	});
});

async function collectErrorCases(root: string): Promise<Map<string, ObservedError>> {
	const actualByName = new Map<string, ObservedError>();
	const storeRoot = join(root, "payload-root");

	actualByName.set("resolve_root_relative", expectError(resolvePayloadRoot({ env: { ASDL_PAYLOAD_ROOT: "relative/root" } })));
	actualByName.set("session_required", expectError(resolveHarnessSessionId(null, { env: {} })));
	actualByName.set("open_relative_root", expectError(await PayloadStore.open({ root: "relative-root", sessionId: "session1" })));
	actualByName.set("open_invalid_session", expectError(await PayloadStore.open({ root: storeRoot, sessionId: "Session!" })));

	const clock = sequenceClock(Array.from({ length: 8 }, () => "2026-06-03T12:34:56Z"));
	const store = expectOk(await PayloadStore.open({ root: storeRoot, sessionId: "sess-1", clock }));
	actualByName.set(
		"descriptor_value_error",
		await expectThrownMessage(() => store.writeJsonArtifact({ descriptor: "Bad Descriptor", role: "raw", payload: {} })),
	);

	actualByName.set("artifact_relative", expectError(await PayloadStore.openContainingArtifact("relative/20260603t123456z-0001-x.raw.json")));
	actualByName.set("artifact_missing", expectError(await PayloadStore.openContainingArtifact(join(root, "missing", "20260603t123456z-0001-x.raw.json"))));

	const validName = "20260603t123456z-0001-probe.raw.json";
	const notPayloadsDir = join(storeRoot, "sessions", "sess-1", "other");
	await mkdir(notPayloadsDir, { recursive: true });
	await writeFile(join(notPayloadsDir, validName), "{}", "utf8");
	actualByName.set("artifact_not_payloads_dir", expectError(await PayloadStore.openContainingArtifact(join(notPayloadsDir, validName))));

	const badSessionDir = join(root, "store", "sessions", "BadSession", "payloads");
	await mkdir(badSessionDir, { recursive: true });
	await writeFile(join(badSessionDir, validName), "{}", "utf8");
	actualByName.set("artifact_bad_session", expectError(await PayloadStore.openContainingArtifact(join(badSessionDir, validName))));

	const noSessionsDir = join(root, "store", "nosessions", "sess-1", "payloads");
	await mkdir(noSessionsDir, { recursive: true });
	await writeFile(join(noSessionsDir, validName), "{}", "utf8");
	actualByName.set("artifact_not_under_sessions", expectError(await PayloadStore.openContainingArtifact(join(noSessionsDir, validName))));

	const payloadsDir = join(storeRoot, "sessions", "sess-1", "payloads");
	await writeFile(join(payloadsDir, "notmatching.json"), "{}", "utf8");
	actualByName.set("artifact_bad_filename", expectError(await PayloadStore.openContainingArtifact(join(payloadsDir, "notmatching.json"))));

	const logReference = expectOk(await store.writeTextArtifact({ descriptor: "run-log", role: "log", text: "x\n" }));
	actualByName.set("lookup_role_not_allowed", expectError(await readJsonPayloadArtifact(logReference.payload_path)));

	const rawTxtPath = join(payloadsDir, "20260603t123456z-0042-probe.raw.txt");
	await writeFile(rawTxtPath, "{}", "utf8");
	actualByName.set("lookup_extension_not_json", expectError(await readJsonPayloadArtifact(rawTxtPath)));

	const pointerCases: ReadonlyArray<{ name: string; pointer: string }> = [
		{ name: "pointer_no_slash", pointer: "foo" },
		{ name: "pointer_missing_token", pointer: "/b" },
		{ name: "pointer_index_out_of_range", pointer: "/a/1" },
		{ name: "pointer_dash_token", pointer: "/a/-" },
		{ name: "pointer_leading_zero", pointer: "/a/01" },
		{ name: "pointer_not_integer", pointer: "/a/x" },
		{ name: "pointer_scalar_traverse", pointer: "/scalar/b" },
		{ name: "pointer_bad_escape", pointer: "/~2" },
		{ name: "pointer_trailing_tilde", pointer: "/~" },
	];
	for (const pointerCase of pointerCases) {
		actualByName.set(pointerCase.name, expectError(resolveJsonPointer(errorParityFixture.document, pointerCase.pointer)));
	}

	return actualByName;
}

describe("payload store environment and safety behavior", () => {
	test("fromEnvironment resolves ASDL_PAYLOAD_ROOT and HARNESS_SESSION_ID", async () => {
		const tempDir = await makeTempDir();
		const root = join(tempDir, "env-root");
		const derived = derivePayloadSessionIdFromHarnessSessionId("env-session");

		const store = expectOk(await PayloadStore.fromEnvironment({ env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "env-session" } }));

		expect(store.root).toBe(root);
		expect(store.sessionId).toBe(derived.payloadSessionId);
		expect(store.harnessSessionIdDigest).toBe(derived.harnessSessionIdDigest);
		expect(store.payloadDir).toBe(join(root, "sessions", derived.payloadSessionId, "payloads"));
	});

	test("fromEnvironment prefers an explicit harness session id over the environment", async () => {
		const tempDir = await makeTempDir();
		const root = join(tempDir, "env-root");
		const derived = derivePayloadSessionIdFromHarnessSessionId("explicit-session");

		const store = expectOk(
			await PayloadStore.fromEnvironment({ explicitHarnessSessionId: "explicit-session", env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "env-session" } }),
		);

		expect(store.sessionId).toBe(derived.payloadSessionId);
		expect(store.harnessSessionIdDigest).toBe(derived.harnessSessionIdDigest);
	});

	test("resolvePayloadSession derives a safe payload id without exposing the raw harness id", () => {
		const rawHarnessSessionId = "pi-session-file:/Users/example/.pi/session.jsonl";
		const resolved = expectOk(resolvePayloadSession({ explicitHarnessSessionId: rawHarnessSessionId, env: {} }));

		expect(resolved.harnessSessionIdDigest).toMatch(/^[a-f0-9]{32}$/);
		expect(resolved.payloadSessionId).toBe(`pr-address-${resolved.harnessSessionIdDigest}`);
		expect(resolved.payloadSessionId).not.toContain("Users");
	});

	test("defaultPayloadRoot nests an asdl directory under the temp directory", async () => {
		expect(defaultPayloadRoot({ tempDir: "/custom/tmp" })).toBe(join("/custom/tmp", "asdl"));
		expect(expectOk(resolvePayloadRoot({ env: {}, tempDir: "/custom/tmp" }))).toBe(join("/custom/tmp", "asdl"));
	});

	test("open reuses an existing session tree and continues the sequence", async () => {
		const tempDir = await makeTempDir();
		const root = join(tempDir, "payload-root");
		const clocks = ["2026-06-03T12:34:56Z", "2026-06-03T12:34:57Z"];
		const first = expectOk(await PayloadStore.open({ root, sessionId: "sess-1", clock: sequenceClock(clocks) }));
		expectOk(await first.writeJsonArtifact({ descriptor: "feedback", role: "raw", payload: { ok: true } }));

		const second = expectOk(await PayloadStore.open({ root, sessionId: "sess-1", clock: sequenceClock(clocks) }));
		const reference = expectOk(await second.writeJsonArtifact({ descriptor: "feedback", role: "raw", payload: { ok: false } }));

		expect(reference.sequence).toBe(2);
	});

	test("open rejects a root path that is an existing file", async () => {
		const tempDir = await makeTempDir();
		const root = join(tempDir, "payload-root");
		await writeFile(root, "not a directory", "utf8");

		const result = await PayloadStore.open({ root, sessionId: "sess-1" });

		expect(expectError(result).errorType).toBe("payload_root_invalid");
	});

	test("open rejects a symlinked managed directory", async () => {
		const tempDir = await makeTempDir();
		const realRoot = join(tempDir, "real-root");
		await mkdir(realRoot);
		const root = join(tempDir, "payload-root");
		await symlink(realRoot, root);

		const result = await PayloadStore.open({ root, sessionId: "sess-1" });

		expect(expectError(result).errorType).toBe("payload_directory_unsafe");
	});

	test.runIf(isPosix)("open rejects a group-accessible managed directory", async () => {
		const tempDir = await makeTempDir();
		const root = join(tempDir, "payload-root");
		await mkdir(root, { mode: 0o750 });

		const result = await PayloadStore.open({ root, sessionId: "sess-1" });

		const error = expectError(result);
		expect(error.errorType).toBe("payload_directory_unsafe");
		expect(error.message).toBe(`Managed payload directory must not be group/world accessible: ${root}`);
	});

	test("writeJsonArtifact reports unserializable payloads as payload_write_failed", async () => {
		const tempDir = await makeTempDir();
		const store = expectOk(await PayloadStore.open({ root: join(tempDir, "payload-root"), sessionId: "sess-1" }));
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		const result = await store.writeJsonArtifact({ descriptor: "feedback", role: "raw", payload: circular });

		const error = expectError(result);
		expect(error.errorType).toBe("payload_write_failed");
		expect(error.message).toContain("Failed to serialize JSON payload for descriptor 'feedback':");
	});
});

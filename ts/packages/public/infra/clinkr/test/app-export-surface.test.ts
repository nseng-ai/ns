import { expect, test } from "vitest";

// Package-surface evidence for the quarantined runtime's temporary subpaths:
// implementation details stay private, while specialized runtime values remain
// available only from named subpaths. Dynamic imports keep the surface checks
// free of first-party namespace aliases.
async function exportsOf(
	specifier:
		| "@nseng-ai/clinkr"
		| "@nseng-ai/clinkr/app"
		| "@nseng-ai/clinkr/completion"
		| "@nseng-ai/clinkr/legacy"
		| "@nseng-ai/clinkr/raw"
		| "@nseng-ai/clinkr/stream"
		| "@nseng-ai/clinkr/testing",
) {
	const module: unknown = await import(specifier);
	if (typeof module !== "object" || module === null) {
		throw new Error(`Malformed module namespace for ${specifier}`);
	}
	return module as Record<string, unknown>;
}

test("topology and selected-command internals are not exported from /app", async () => {
	const appExports = await exportsOf("@nseng-ai/clinkr/app");
	for (const name of [
		"ClinkrTopology",
		"createFilesystemSource",
		"getOrCreateTransactional",
		"importSelectedCommand",
		"invalidate",
		"publish",
	]) {
		expect(name in appExports, `${name} must stay package-internal`).toBe(false);
	}
});

test("raw, completion, stream, and testing values remain named-subpath-only", async () => {
	const appExports = await exportsOf("@nseng-ai/clinkr/app");
	for (const specifier of [
		"@nseng-ai/clinkr/raw",
		"@nseng-ai/clinkr/completion",
		"@nseng-ai/clinkr/stream",
		"@nseng-ai/clinkr/testing",
	] as const) {
		const namedExports = await exportsOf(specifier);
		expect(
			Object.keys(namedExports).length,
			`${specifier} must expose runtime values`,
		).toBeGreaterThan(0);
		for (const name of Object.keys(namedExports)) {
			expect(name in appExports, `${name} from ${specifier} must not leak through /app`).toBe(
				false,
			);
		}
	}
});

test("legacy APIs have one aggregate entrypoint and are absent from root and /app", async () => {
	const rootExports = await exportsOf("@nseng-ai/clinkr");
	const appExports = await exportsOf("@nseng-ai/clinkr/app");
	const legacyExports = await exportsOf("@nseng-ai/clinkr/legacy");
	const legacyNames = [
		"ClinkrFailure",
		"buildJsonSchemaDocument",
		"emitExit",
		"machineEnvelopeSchema",
		"ok",
	];
	for (const name of legacyNames) {
		expect(name in legacyExports, `${name} must be exported from /legacy`).toBe(true);
		expect(name in rootExports, `${name} must not remain at package root`).toBe(false);
	}
	for (const name of [
		"ClinkrFailure",
		"buildJsonSchemaDocument",
		"emitExit",
		"machineEnvelopeSchema",
	]) {
		expect(name in appExports, `${name} must not leak through /app`).toBe(false);
	}
});

test("raw construction is exported from /raw and not re-exported from /app", async () => {
	const rawExports = await exportsOf("@nseng-ai/clinkr/raw");
	const appExports = await exportsOf("@nseng-ai/clinkr/app");
	expect(typeof rawExports.defineRawCommand).toBe("function");
	expect("defineRawCommand" in appExports).toBe(false);
});

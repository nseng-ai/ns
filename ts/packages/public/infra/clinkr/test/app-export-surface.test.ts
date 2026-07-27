import { expect, test } from "vitest";

// Package-surface evidence for the quarantined runtime's temporary subpaths:
// envelope/schema policy stays internal to Clinkr, and raw construction is
// available only from its named subpath. Dynamic imports keep the surface
// checks free of first-party namespace aliases.
async function exportsOf(specifier: "@nseng-ai/clinkr/app" | "@nseng-ai/clinkr/raw") {
	const module: unknown = await import(specifier);
	if (typeof module !== "object" || module === null) {
		throw new Error(`Malformed module namespace for ${specifier}`);
	}
	return module as Record<string, unknown>;
}

test("internal envelope/schema policy helpers are not exported from /app", async () => {
	const appExports = await exportsOf("@nseng-ai/clinkr/app");
	for (const name of [
		"buildCommandJsonSchemaDocument",
		"buildEnvelopeSchema",
		"exitCodeFor",
		"toEnvelope",
	]) {
		expect(name in appExports, `${name} must stay package-internal`).toBe(false);
	}
});

test("raw construction is exported from /raw and not re-exported from /app", async () => {
	const rawExports = await exportsOf("@nseng-ai/clinkr/raw");
	const appExports = await exportsOf("@nseng-ai/clinkr/app");
	expect(typeof rawExports.defineRawCommand).toBe("function");
	expect("defineRawCommand" in appExports).toBe(false);
});

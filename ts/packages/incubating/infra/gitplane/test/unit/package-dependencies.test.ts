import { expect, test } from "vitest";
import packageManifest from "../../package.json" with { type: "json" };

// Gitplane's objective scope pins its dependency surface: Clinkr (plus zod), but not
// Foundation. This allowlist keeps that architectural constraint from regressing silently;
// same-tier deps are legal under the repo tier taxonomy, so no repo-wide guard covers it.
test("gitplane declares only the approved runtime dependencies", () => {
	const manifest: Record<string, unknown> = packageManifest;
	const declared = [
		"dependencies",
		"devDependencies",
		"peerDependencies",
		"optionalDependencies",
	].flatMap((section) => {
		const value = manifest[section];
		return typeof value === "object" && value !== null ? Object.keys(value) : [];
	});
	expect(declared.sort()).toEqual(["@nseng-ai/clinkr", "zod"]);
});

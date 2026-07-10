import { describe, expect, test } from "vitest";

import { npmPackageRoot } from "@nseng-ai/kernel/extensions/acquisition";
import {
	appendDeclaredExtensionSpecToml,
	descriptorExportTarget,
	nsExtensionExportTarget,
	planDeclaredExtensionInstallToml,
	resolveAcquiredDescriptorPackageRoot,
} from "@nseng-ai/kernel/project-config";

describe("ns.toml extension spec edits", () => {
	test("plans an install into an empty document", () => {
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				source: "",
				requestedSpec: "./extensions/tools",
			}),
		).toEqual({
			ok: true,
			text: 'extensions = ["./extensions/tools"]\n',
			isAdded: true,
		});
	});

	test("creates extensions array without reserializing the document", () => {
		expect(appendDeclaredExtensionSpecToml('harnesses = ["pi"]\n', "./extensions/tools")).toEqual({
			ok: true,
			text: 'harnesses = ["pi"]\nextensions = ["./extensions/tools"]\n',
			isAdded: true,
		});
	});

	test("appends idempotently to an existing extensions array", () => {
		const first = appendDeclaredExtensionSpecToml(
			'extensions = ["./extensions/a"]\n[points]\n',
			"./extensions/b",
		);
		expect(first).toEqual({
			ok: true,
			text: 'extensions = ["./extensions/a", "./extensions/b"]\n[points]\n',
			isAdded: true,
		});
		expect(appendDeclaredExtensionSpecToml(first.ok ? first.text : "", "./extensions/b")).toEqual({
			ok: true,
			text: 'extensions = ["./extensions/a", "./extensions/b"]\n[points]\n',
			isAdded: false,
		});
	});

	test("reports invalid ns.toml before editing", () => {
		expect(appendDeclaredExtensionSpecToml("extensions = [\n", "./extensions/a")).toMatchObject({
			ok: false,
			reason: "invalid-toml",
		});
	});

	test("plans exact-spec reruns without changing TOML formatting", () => {
		const source =
			'# project extensions\nextensions = [\n  "npm:@acme/tools", # retained\n]\n[points]\n';
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				source,
				requestedSpec: "npm:@acme/tools",
			}),
		).toEqual({ ok: true, text: source, isAdded: false });
	});

	test("appends to multiline arrays while preserving comments and table order", () => {
		const source =
			'harnesses = ["pi"]\nextensions = [\n  "./extensions/a" # keep this comment\n]\n\n[points]\nfoo = "bar"\n';
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				source,
				requestedSpec: "npm:@acme/tools@1.2.3",
			}),
		).toEqual({
			ok: true,
			text: 'harnesses = ["pi"]\nextensions = [\n  "./extensions/a", # keep this comment\n  "npm:@acme/tools@1.2.3"\n]\n\n[points]\nfoo = "bar"\n',
			isAdded: true,
		});
	});

	test("rejects the same npm identity under a different exact spec", () => {
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				source: 'extensions = ["npm:@acme/tools"]\n',
				requestedSpec: "npm:@acme/tools@1.2.3",
			}),
		).toEqual({
			ok: false,
			reason: "identity-conflict",
			identity: { kind: "npm", value: "@acme/tools" },
			requestedSpec: "npm:@acme/tools@1.2.3",
			existingSpecs: ["npm:@acme/tools"],
			message:
				"Extension npm package @acme/tools is already declared under a different source spec: npm:@acme/tools.",
		});
	});

	test("rejects equivalent normalized local paths under different exact specs", () => {
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo/project",
				source: 'extensions = ["./extensions/tools"]\n',
				requestedSpec: "extensions/../extensions/tools",
			}),
		).toMatchObject({
			ok: false,
			reason: "identity-conflict",
			identity: { kind: "local", value: "/repo/project/extensions/tools" },
			requestedSpec: "extensions/../extensions/tools",
			existingSpecs: ["./extensions/tools"],
		});
	});
});

describe("descriptor package exports", () => {
	test("resolves string and conditional descriptor export targets", () => {
		expect(nsExtensionExportTarget({ "./ns-extension": "./src/ns/extension.ts" })).toBe(
			"./src/ns/extension.ts",
		);
		expect(
			nsExtensionExportTarget({
				"./ns-extension": {
					import: "./src/ns/extension.ts",
					default: "./dist/ns/extension.js",
				},
			}),
		).toBe("./src/ns/extension.ts");
		expect(
			nsExtensionExportTarget({
				"./ns-extension": { default: "./dist/ns/extension.js" },
			}),
		).toBe("./dist/ns/extension.js");
		expect(nsExtensionExportTarget({ "./other": "./src/ns/extension.ts" })).toBeUndefined();
	});

	test("resolves descriptor export targets from package manifests", () => {
		expect(
			descriptorExportTarget({
				exports: { "./ns-extension": { default: "./src/ns/extension.ts" } },
			}),
		).toBe("./src/ns/extension.ts");
	});
});

describe("descriptor package acquisition", () => {
	test("resolves npm specs from managed npm storage", () => {
		expect(
			resolveAcquiredDescriptorPackageRoot({ repoRoot: "/repo", spec: "npm:@acme/tools@1.2.3" }),
		).toEqual({ packageRoot: npmPackageRoot("/repo", "@acme/tools") });
	});

	test("always resolves local specs in place", () => {
		expect(
			resolveAcquiredDescriptorPackageRoot({
				repoRoot: "/repo",
				spec: "./extensions/tools",
			}),
		).toEqual({ packageRoot: "/repo/extensions/tools" });
	});
});

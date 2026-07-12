import { describe, expect, it } from "vitest";

import { classifyExtensionSourceLifecycle } from "../../src/project-config/index.ts";

describe("classifyExtensionSourceLifecycle", () => {
	it.each([
		{
			label: "unscoped npm",
			spec: "npm:left-pad",
			expected: {
				type: "supported-npm",
				source: {
					kind: "npm",
					raw: "npm:left-pad",
					packageName: "left-pad",
					isPinned: false,
				},
			},
		},
		{
			label: "scoped pinned npm",
			spec: "npm:@scope/pkg@1.2.3",
			expected: {
				type: "supported-npm",
				source: {
					kind: "npm",
					raw: "npm:@scope/pkg@1.2.3",
					packageName: "@scope/pkg",
					version: "1.2.3",
					isPinned: true,
				},
			},
		},
		{
			label: "malformed npm",
			spec: "npm:",
			expected: {
				type: "invalid-npm",
				diagnostic: {
					code: "extension_acquisition_invalid_npm_spec",
					message:
						"Invalid npm extension source spec: npm:. Expected npm:pkg, npm:pkg@version, npm:@scope/name, or npm:@scope/name@version.",
					spec: "npm:",
				},
			},
		},
		{
			label: "unprefixed local",
			spec: "./extensions/tools",
			expected: {
				type: "supported-local",
				source: {
					kind: "local",
					raw: "./extensions/tools",
					path: "/repo/extensions/tools",
				},
			},
		},
		{
			label: "git takes precedence over nested URI syntax",
			spec: "git:https://github.com/acme/tools.git",
			expected: {
				type: "unsupported-git",
				source: { kind: "git", raw: "git:https://github.com/acme/tools.git" },
				message:
					"Git extension sources are recognized but unsupported. Source: git:https://github.com/acme/tools.git.",
			},
		},
		{
			label: "https URI",
			spec: "https://example.test/tools.tgz",
			expected: {
				type: "unsupported-other",
				sourceSpec: "https://example.test/tools.tgz",
				message:
					"Extension source must be an npm: spec or an unprefixed local path: https://example.test/tools.tgz.",
			},
		},
		{
			label: "another URI scheme",
			spec: "ssh://example.test/tools.git",
			expected: {
				type: "unsupported-other",
				sourceSpec: "ssh://example.test/tools.git",
				message:
					"Extension source must be an npm: spec or an unprefixed local path: ssh://example.test/tools.git.",
			},
		},
	])("classifies $label", ({ spec, expected }) => {
		expect(classifyExtensionSourceLifecycle("/repo", spec)).toEqual(expected);
	});
});

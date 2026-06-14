import { describe, expect, test } from "vitest";

import { buildHelloWorldModel, formatHelpText, formatVersionText } from "../../src/hello-world.ts";

describe("buildHelloWorldModel", () => {
	test("returns the hello-world display copy", () => {
		expect(buildHelloWorldModel()).toEqual({
			title: "Hello from sdlcc",
			body: "OpenTUI core is ready for future command-and-control workflows.",
			footer: "Press q or Ctrl-C to exit",
		});
	});
});

describe("formatHelpText", () => {
	test("documents usage and the Bun smoke command", () => {
		const help = formatHelpText();

		expect(help).toContain("Usage: sdlcc");
		expect(help).toContain("sdlcc --help");
		expect(help).toContain("bun ts/packages/sdlcc/src/cli.ts");
		expect(help).toContain("q, Ctrl-C");
	});
});

describe("formatVersionText", () => {
	test("returns the package version label", () => {
		expect(formatVersionText()).toBe("sdlcc 0.1.0");
	});
});

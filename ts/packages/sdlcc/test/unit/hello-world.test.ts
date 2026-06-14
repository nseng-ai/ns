import { describe, expect, test } from "vitest";

import { buildHelloWorldModel } from "../../src/hello-world.ts";

describe("buildHelloWorldModel", () => {
	test("returns the hello-world display copy", () => {
		expect(buildHelloWorldModel()).toEqual({
			title: "Hello from sdlcc",
			body: "OpenTUI core is ready for future command-and-control workflows.",
			footer: "Press q or Ctrl-C to exit",
		});
	});
});

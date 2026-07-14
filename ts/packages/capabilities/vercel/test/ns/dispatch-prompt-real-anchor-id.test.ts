import { expect, test } from "vitest";

import { generateRealAnchorId } from "../../src/ns/dispatch-prompt/real-anchor-id.ts";

test("generates eight-hex anchor ids", () => {
	expect(generateRealAnchorId()).toMatch(/^[0-9a-f]{8}$/);
});

import { describe, expect, it } from "vitest";

import { registerCondensedScreenshots } from "../../src/condensed-screenshots.ts";
import { enabledEditorModFeatures } from "../../src/extension.ts";
import { registerMultilineEditor } from "../../src/multiline-editor.ts";

describe("editor mod feature registration", () => {
	it("enables independently exported features through an explicit source-controlled list", () => {
		expect(enabledEditorModFeatures).toEqual([
			registerMultilineEditor,
			registerCondensedScreenshots,
		]);
	});
});

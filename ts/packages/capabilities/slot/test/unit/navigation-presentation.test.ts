import { stripAnsi } from "@sdl/clinkr/testing";
import type { Caps } from "@sdl/clinkr";
import { describe, expect, it } from "vitest";

import {
	renderSlotNavigationSuccess,
	type SlotNavigationPresentationInput,
} from "../../src/navigation-presentation.ts";

const unicodeColorCaps: Caps = {
	isTty: true,
	colorDepth: "truecolor",
	columns: 100,
	canRenderUnicode: true,
};

const asciiMonoCaps: Caps = {
	isTty: false,
	colorDepth: "none",
	columns: 80,
	canRenderUnicode: false,
};

describe("slot navigation presentation", () => {
	it("renders a success headline, bare cd line, and clipboard guidance", () => {
		const rendered = renderSlotNavigationSuccess(copiedInput(), {
			canEmitAnsi: true,
			caps: unicodeColorCaps,
		});
		const strippedLines = stripAnsi(rendered).split("\n");

		expect(strippedLines).toEqual([
			"✓ slot-01 -> feature/a",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
		expect(findRenderedCdLine(rendered)).toBe("cd /slots/repos/repo/worktrees/slot-01");
	});

	it("keeps clipboard failure non-fatal and leaves the cd line copyable", () => {
		const rendered = renderSlotNavigationSuccess(
			{
				...copiedInput(),
				clipboard_copied: false,
				clipboard_failure_reason: "backend_missing",
				clipboard_failure_detail: "missing pbcopy",
			},
			{ canEmitAnsi: true, caps: unicodeColorCaps },
		);

		expect(stripAnsi(rendered).split("\n")).toEqual([
			"✓ slot-01 -> feature/a",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Clipboard unavailable (missing pbcopy)",
		]);
		expect(findRenderedCdLine(rendered)).toBe("cd /slots/repos/repo/worktrees/slot-01");
	});

	it("degrades the success glyph for ascii-only sinks", () => {
		const rendered = renderSlotNavigationSuccess(copiedInput(), {
			canEmitAnsi: true,
			caps: asciiMonoCaps,
		});

		expect(stripAnsi(rendered).split("\n")[0]).toBe("v slot-01 -> feature/a");
	});
});

function copiedInput(): SlotNavigationPresentationInput {
	return {
		headline: "slot-01 -> feature/a",
		worktree_path: "/slots/repos/repo/worktrees/slot-01",
		cd_command: "cd /slots/repos/repo/worktrees/slot-01",
		clipboard_copied: true,
		clipboard_skipped: false,
		clipboard_failure_reason: null,
		clipboard_failure_detail: null,
	};
}

function findRenderedCdLine(rendered: string): string | undefined {
	return rendered.split("\n").find((line) => stripAnsi(line).startsWith("cd "));
}

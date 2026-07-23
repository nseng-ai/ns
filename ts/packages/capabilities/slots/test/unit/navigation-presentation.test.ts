import { stripAnsi } from "@nseng-ai/clinkr/testing";
import type { Caps } from "@nseng-ai/clinkr";
import { describe, expect, it } from "vitest";

import {
	renderSlotNavigationSuccess,
	type SlotNavigationPresentationInput,
} from "../../src/core/navigation-presentation.ts";

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
				clipboardCopied: false,
				clipboardFailureReason: "backend-missing",
				clipboardFailureDetail: "missing pbcopy",
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

	it("warns only when the parent-shell directive write failed", () => {
		const failed = renderSlotNavigationSuccess(
			{
				...copiedInput(),
				cdDirectiveStatus: "failed",
				cdDirectivePath: "/tmp/directive",
				cdDirectiveFailureDetail: "disk full",
			},
			{ canEmitAnsi: true, caps: unicodeColorCaps },
		);
		const written = renderSlotNavigationSuccess(
			{
				...copiedInput(),
				cdDirectiveStatus: "written",
				cdDirectivePath: "/tmp/directive",
			},
			{ canEmitAnsi: true, caps: unicodeColorCaps },
		);

		expect(stripAnsi(failed).split("\n")).toContain(
			"Parent-shell navigation unavailable at /tmp/directive (disk full)",
		);
		expect(stripAnsi(written)).not.toContain("Parent-shell navigation unavailable");
	});

	it("degrades the success glyph for ascii-only sinks", () => {
		const rendered = renderSlotNavigationSuccess(copiedInput(), {
			canEmitAnsi: true,
			caps: asciiMonoCaps,
		});

		expect(stripAnsi(rendered).split("\n")[0]).toBe("v slot-01 -> feature/a");
	});

	it("renders optional navigation details before the bare cd line", () => {
		const rendered = renderSlotNavigationSuccess(
			{
				...copiedInput(),
				details: ["Trunk branch is busy; left caller on a detached HEAD."],
			},
			{ canEmitAnsi: true, caps: unicodeColorCaps },
		);

		expect(stripAnsi(rendered).split("\n")).toEqual([
			"✓ slot-01 -> feature/a",
			"Trunk branch is busy; left caller on a detached HEAD.",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
		expect(findRenderedCdLine(rendered)).toBe("cd /slots/repos/repo/worktrees/slot-01");
	});
});

function copiedInput(): SlotNavigationPresentationInput {
	return {
		headline: "slot-01 -> feature/a",
		worktreePath: "/slots/repos/repo/worktrees/slot-01",
		cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
		clipboardCopied: true,
		clipboardSkipped: false,
		clipboardFailureReason: null,
		clipboardFailureDetail: null,
		cdDirectiveStatus: "inactive",
		cdDirectivePath: null,
		cdDirectiveFailureDetail: null,
	};
}

function findRenderedCdLine(rendered: string): string | undefined {
	return rendered.split("\n").find((line) => stripAnsi(line).startsWith("cd "));
}

import { describe, expect, test } from "vitest";

import {
	compactPreviewText,
	previewJsonEventValue,
	toolResultPreviewFromEvent,
} from "../src/runner-subagent/activity.ts";

describe("runner subagent activity previews", () => {
	test("compacts strings and truncates with a visible suffix", () => {
		expect(compactPreviewText("  hello\n\tworld  ")).toBe("hello world");
		expect(compactPreviewText("abcdef", 4)).toBe("abc…");
		expect(previewJsonEventValue("   ")).toBeUndefined();
	});

	test("previews JSON values and truncates long objects", () => {
		expect(previewJsonEventValue({ path: "README.md", limit: 20 })).toBe('{"path":"README.md","limit":20}');
		const preview = previewJsonEventValue({ message: "x".repeat(50) }, 20);

		expect(preview).toHaveLength(20);
		expect(preview?.endsWith("…")).toBe(true);
	});

	test("prefers text content from tool result objects", () => {
		expect(
			toolResultPreviewFromEvent({
				result: {
					content: [
						{ type: "text", text: "first line\nsecond line" },
						{ type: "image", source: "ignored" },
						{ type: "text", text: "third line" },
					],
					details: { ignored: true },
				},
			}),
		).toBe("first line second line third line");
	});

	test("handles circular values defensively", () => {
		const value: Record<string, unknown> = { name: "root" };
		value.self = value;

		expect(previewJsonEventValue(value)).toContain("[Circular]");
	});
});

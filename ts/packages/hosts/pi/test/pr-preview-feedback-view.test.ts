import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { describe, expect, test } from "vitest";

import {
	PrPreviewFeedbackView,
	threadListRows,
	type PrPreviewFeedbackThread,
	type PrPreviewFeedbackViewModel,
} from "../src/pr/preview-feedback-view.ts";

interface FakeTui extends TUI {
	renderRequests: number;
}

describe("PR feedback preview horizontal layout", () => {
	test("allocates rows for a full-width thread list above selected details", () => {
		expect(threadListRows({ totalRows: 20, threadCount: 12 })).toBe(11);
		expect(threadListRows({ totalRows: 8, threadCount: 12 })).toBe(4);
		expect(threadListRows({ totalRows: 8, threadCount: 1 })).toBe(1);
	});

	test("renders rich mode by default with list above selected thread details", () => {
		const view = new PrPreviewFeedbackView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: previewModel([
				previewThread("one", "First rich issue"),
				previewThread("two", "Second issue"),
			]),
			onClose: () => {},
		});
		const lines = view.render(120);
		const text = lines.join("\n");
		const selectedRowIndex = lines.findIndex((line) =>
			line.includes("L10 · warning · taste · First rich issue"),
		);
		const labelIndex = lines.findIndex((line) =>
			line.includes("Selected review thread 1/2 · rich view"),
		);

		expect(threadListDividerLines(lines, 120)).toHaveLength(1);
		expect(selectedRowIndex).toBeGreaterThan(-1);
		expect(labelIndex).toBeGreaterThan(selectedRowIndex);
		expect(lines[selectedRowIndex]).not.toContain("First rich issue body");
		expect(text).toContain("▣ warning: First rich issue");
		expect(text).toContain("Review: taste · 1 comment · pr-preview-feedback-view.test.ts:10");
		expect(text).toContain("  │ First rich issue body");
	});

	test("toggles between rich and compact view with v", () => {
		const tui = fakeTui();
		const view = new PrPreviewFeedbackView({
			tui,
			theme: identityTheme(),
			model: previewModel([previewThread("one", "Toggle issue")]),
			onClose: () => {},
		});

		expect(renderText(view)).toContain("Selected review thread 1/1 · rich view");
		expect(renderText(view)).toContain("Review: taste · 1 comment");

		view.handleInput("v");

		expect(tui.renderRequests).toBe(1);
		expect(renderText(view)).toContain("Selected review thread 1/1 · compact view");
		expect(renderText(view)).toContain("v view: compact");
		expect(renderText(view)).not.toContain("Review: taste · 1 comment");

		view.handleInput("v");

		expect(tui.renderRequests).toBe(2);
		expect(renderText(view)).toContain("Selected review thread 1/1 · rich view");
	});

	test("selection changes the selected thread detail", () => {
		const view = new PrPreviewFeedbackView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: previewModel([
				previewThread("one", "First issue"),
				previewThread("two", "Second issue"),
			]),
			onClose: () => {},
		});

		expect(selectedDetailsText(view)).toContain("First issue body");
		expect(selectedDetailsText(view)).not.toContain("Second issue body");

		view.handleInput("j");

		expect(selectedDetailsText(view)).toContain("Selected review thread 2/2 · rich view");
		expect(selectedDetailsText(view)).toContain("Second issue body");
		expect(selectedDetailsText(view)).not.toContain("First issue body");
	});
});

function previewModel(threads: readonly PrPreviewFeedbackThread[]): PrPreviewFeedbackViewModel {
	return {
		target: {
			pr_number: 123,
			title: "Preview feedback",
			url: null,
			branch: "feature/feedback",
			head_ref_name: "feature/feedback",
			base_ref_name: "main",
		},
		counts: {
			included_review_threads: threads.length,
			included_reviews: 0,
			included_discussion_comments: 0,
			excluded_resolved_threads: 0,
			excluded_empty_reviews: 0,
			excluded_automation_comments: 0,
		},
		fetchedAt: new Date("2026-06-25T00:00:00Z"),
		threads,
	};
}

function previewThread(id: string, title: string): PrPreviewFeedbackThread {
	return {
		id: `thread-${id}`,
		path: "ts/packages/hosts/pi/test/pr-preview-feedback-view.test.ts",
		line: id === "one" ? 10 : 20,
		start_line: null,
		is_resolved: false,
		is_outdated: false,
		comments: [
			{
				id: id === "one" ? 100 : 200,
				body: `**warning: ${title}**\n_Review: \`taste\`._\n\n${title} body\nEvidence: \`src/${id}.ts\``,
				author: "reviewer",
				path: "ts/packages/hosts/pi/test/pr-preview-feedback-view.test.ts",
				line: id === "one" ? 10 : 20,
				start_line: null,
				created_at: "2026-06-20T00:00:00Z",
			},
		],
	};
}

function fakeTui(): FakeTui {
	return {
		renderRequests: 0,
		terminal: { rows: 20 },
		requestRender() {
			this.renderRequests += 1;
		},
	} as FakeTui;
}

function identityTheme(): Theme {
	return {
		fg(_color: string, text: string): string {
			return text;
		},
		bg(_color: string, text: string): string {
			return text;
		},
	} as Theme;
}

function renderText(view: PrPreviewFeedbackView): string {
	return view.render(120).join("\n");
}

function selectedDetailsText(view: PrPreviewFeedbackView): string {
	const lines = view.render(120);
	const detailsIndex = lines.findIndex((line) => line.includes("Selected review thread"));
	return lines.slice(Math.max(0, detailsIndex)).join("\n");
}

function threadListDividerLines(lines: readonly string[], width: number): string[] {
	return lines.filter((line) => line === `│${"─".repeat(width - 2)}│`);
}

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { describe, expect, test } from "vitest";

import type {
	PrPreviewFeedbackThread,
	PrPreviewFeedbackViewModel,
} from "../src/pr/preview-feedback-model.ts";
import { feedbackListRows, PrPreviewFeedbackView } from "../src/pr/preview-feedback-view.ts";

describe("feedbackListRows layout helper", () => {
	test("rich mode keeps the list compact so detail dominates", () => {
		expect(feedbackListRows({ bodyRows: 20, threadCount: 12, mode: "rich" })).toBe(6);
		expect(feedbackListRows({ bodyRows: 8, threadCount: 12, mode: "rich" })).toBe(3);
		expect(feedbackListRows({ bodyRows: 20, threadCount: 2, mode: "rich" })).toBe(2);
	});

	test("compact mode grows the list for triage scanning", () => {
		expect(feedbackListRows({ bodyRows: 20, threadCount: 12, mode: "compact" })).toBe(12);
		expect(feedbackListRows({ bodyRows: 8, threadCount: 12, mode: "compact" })).toBe(5);
	});

	test("compact allocates more list rows than rich for the same inputs", () => {
		const rich = feedbackListRows({ bodyRows: 24, threadCount: 12, mode: "rich" });
		const compact = feedbackListRows({ bodyRows: 24, threadCount: 12, mode: "compact" });
		expect(compact).toBeGreaterThan(rich);
	});
});

describe("PR feedback preview horizontal layout", () => {
	test("defaults to the rich detail presentation", () => {
		const view = newView(threadFixtures());
		const text = renderText(view);

		expect(text).toContain("▏ ");
		expect(text).toContain("EVIDENCE");
		expect(text).toContain("github-actions");
		expect(text).toContain("v rich/compact (rich)");
	});

	test("stacks the thread list above the detail without a side-by-side column", () => {
		const view = newView(threadFixtures());
		const lines = view.render(120);

		expect(lines.join("\n")).not.toContain(" │ ");
		const labelIndex = lines.findIndex((line) => line.includes("L10 · "));
		const bodyIndex = lines.findIndex((line) => line.includes("▏ "));
		expect(labelIndex).toBeGreaterThanOrEqual(0);
		expect(bodyIndex).toBeGreaterThan(labelIndex);
		expect(lines.some((line) => line.includes("─".repeat(10)))).toBe(true);
	});

	test("v toggles to compact triage and back to rich", () => {
		const view = newView(threadFixtures());

		view.handleInput("v");
		const compact = renderText(view);
		expect(compact).not.toContain("▏ ");
		expect(compact).not.toContain("EVIDENCE");
		expect(compact).toContain("v rich/compact (compact)");
		expect(countThreadRows(compact)).toBeGreaterThan(countThreadRows(renderRich()));

		view.handleInput("v");
		const richAgain = renderText(view);
		expect(richAgain).toContain("▏ ");
		expect(richAgain).toContain("EVIDENCE");
	});

	test("severity icons and level tokens carry severity colors on unselected rows", () => {
		// Index 0 stays selected (full-row accent highlight), so the severity-colored rows
		// under test are the unselected error/warning threads below it.
		const view = newColorView([
			feedbackThread({ id: "thread-plain", line: 5, body: bodyText({ title: "Plain finding" }) }),
			feedbackThread({
				id: "thread-error",
				line: 10,
				body: bodyText({ level: "error", title: "Error finding" }),
			}),
			feedbackThread({
				id: "thread-warning",
				line: 20,
				body: bodyText({ level: "warning", title: "Warning finding" }),
			}),
		]);
		const text = view.render(200).join("\n");

		expect(text).toContain("[error]✕[/]");
		expect(text).toContain("[error]error[/]");
		expect(text).toContain("[warning]⚠[/]");
		expect(text).toContain("[warning]warning[/]");
	});

	test("selection moves and resets detail scroll", () => {
		const view = newView(threadFixtures());
		expect(renderText(view)).toContain("▣ error: Finding one");

		view.handleInput("j");
		const afterDown = renderText(view);
		expect(afterDown).toContain("▣ warning: Finding two");
		expect(afterDown).not.toContain("▣ error: Finding one");

		view.handleInput("k");
		expect(renderText(view)).toContain("▣ error: Finding one");
	});

	test("PgDn/PgUp scroll the detail viewport", () => {
		const view = newView([longThread()]);
		const initial = selectedDetailText(view);

		view.handleInput(" ");
		const scrolled = selectedDetailText(view);
		expect(scrolled).not.toEqual(initial);

		view.handleInput("v");
		view.handleInput("v");
	});
});

function renderRich(): string {
	return renderText(newView(threadFixtures()));
}

function threadFixtures(): PrPreviewFeedbackThread[] {
	return [
		feedbackThread({
			id: "thread-1",
			line: 10,
			body: bodyText({
				level: "error",
				title: "Finding one",
				review: "correctness",
				detail: "The first finding needs attention before merge.",
				evidence: "src/one.ts:10",
			}),
		}),
		feedbackThread({
			id: "thread-2",
			line: 20,
			body: bodyText({
				level: "warning",
				title: "Finding two",
				review: "sdl-typescript-style",
				detail: "The second finding is advisory.",
				evidence: "src/two.ts:20",
			}),
		}),
		feedbackThread({
			id: "thread-3",
			line: 30,
			body: bodyText({
				level: "info",
				title: "Finding three",
				review: "duplicative-abstractions",
				detail: "The third finding is informational.",
				evidence: "src/three.ts:30",
			}),
		}),
		feedbackThread({ id: "thread-4", line: 40, body: bodyText({ title: "Finding four" }) }),
		feedbackThread({ id: "thread-5", line: 50, body: bodyText({ title: "Finding five" }) }),
		feedbackThread({ id: "thread-6", line: 60, body: bodyText({ title: "Finding six" }) }),
		feedbackThread({ id: "thread-7", line: 70, body: bodyText({ title: "Finding seven" }) }),
		feedbackThread({ id: "thread-8", line: 80, body: bodyText({ title: "Finding eight" }) }),
	];
}

function longThread(): PrPreviewFeedbackThread {
	const detail = Array.from(
		{ length: 40 },
		(_unused, index) => `Detail paragraph ${index + 1}.`,
	).join("\n");
	return feedbackThread({
		id: "long-thread",
		line: 12,
		body: bodyText({ level: "error", title: "Long finding", review: "correctness", detail }),
	});
}

function bodyText(options: {
	level?: "info" | "warning" | "error";
	title: string;
	review?: string;
	detail?: string;
	evidence?: string;
}): string {
	const heading =
		options.level === undefined ? options.title : `${options.level}: ${options.title}`;
	return [
		heading,
		options.review === undefined ? null : `Review: ${options.review}`,
		"",
		options.detail ?? "Body text for the finding.",
		options.evidence === undefined ? null : `Evidence: ${options.evidence}`,
	]
		.filter((line): line is string => line !== null)
		.join("\n");
}

function feedbackThread(options: {
	id: string;
	line: number;
	body: string;
}): PrPreviewFeedbackThread {
	return {
		id: options.id,
		path: "src/file.ts",
		line: options.line,
		start_line: null,
		is_resolved: false,
		is_outdated: false,
		comments: [
			{
				id: options.line,
				body: options.body,
				author: "github-actions",
				path: "src/file.ts",
				line: options.line,
				start_line: null,
				created_at: "2026-06-21T00:00:00Z",
			},
		],
	};
}

function feedbackModel(threads: PrPreviewFeedbackThread[]): PrPreviewFeedbackViewModel {
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

function newView(threads: PrPreviewFeedbackThread[]): PrPreviewFeedbackView {
	return new PrPreviewFeedbackView({
		tui: fakeTui(),
		theme: identityTheme(),
		model: feedbackModel(threads),
		onClose: () => {},
	});
}

function newColorView(threads: PrPreviewFeedbackThread[]): PrPreviewFeedbackView {
	return new PrPreviewFeedbackView({
		tui: fakeTui(),
		theme: taggingTheme(),
		model: feedbackModel(threads),
		onClose: () => {},
	});
}

function fakeTui(): TUI {
	return {
		terminal: { rows: 30 },
		requestRender() {},
	} as TUI;
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

function taggingTheme(): Theme {
	return {
		fg(color: string, text: string): string {
			return `[${color}]${text}[/]`;
		},
		bg(_color: string, text: string): string {
			return text;
		},
	} as Theme;
}

function renderText(view: PrPreviewFeedbackView): string {
	return view.render(120).join("\n");
}

function selectedDetailText(view: PrPreviewFeedbackView): string {
	const lines = view.render(120);
	const separatorIndex = lines.findIndex((line) => line.includes("─".repeat(10)));
	return lines.slice(Math.max(0, separatorIndex)).join("\n");
}

function countThreadRows(text: string): number {
	return text.split("\n").filter((line) => /L\d+ /.test(line)).length;
}

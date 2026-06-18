import { describe, expect, test } from "vitest";

import { displayWidth, renderTextTable } from "../src/text-table.ts";

describe("renderTextTable", () => {
	test("aligns columns to their widest cell and trims trailing padding", () => {
		const rendered = renderTextTable({
			columns: [{ header: "OBJECTIVE" }, { header: "STATUS" }, { header: "LATEST UPDATE" }],
			rows: [
				["clinkr-user-interaction", "○ open", "—"],
				["cross-harness-parity", "○ open", "2026-06-13T09:10:00Z"],
			],
		});

		expect(rendered).toBe(
			[
				"OBJECTIVE                STATUS  LATEST UPDATE",
				"clinkr-user-interaction  ○ open  —",
				"cross-harness-parity     ○ open  2026-06-13T09:10:00Z",
			].join("\n"),
		);
	});

	test("lays multi-line cells onto stacked rows with other columns blank", () => {
		const rendered = renderTextTable({
			columns: [{ header: "OBJECTIVE" }, { header: "BRANCHES" }],
			rows: [["slot-typescript-port", ["├ 1/2 alpha", "└ 2/2 beta"].join("\n")]],
		});

		expect(rendered).toBe(
			["OBJECTIVE             BRANCHES", "slot-typescript-port  ├ 1/2 alpha", "                      └ 2/2 beta"].join("\n"),
		);
	});

	test("right-aligns numeric columns including the header", () => {
		const rendered = renderTextTable({
			columns: [{ header: "name" }, { header: "count", align: "right" }],
			rows: [
				["a", "5"],
				["bbb", "1234"],
			],
		});

		expect(rendered).toBe(["name  count", "a         5", "bbb    1234"].join("\n"));
	});

	test("draws a dashed rule under the header when rule is enabled", () => {
		const rendered = renderTextTable({
			columns: [{ header: "NAME" }, { header: "VALUE" }],
			rows: [["alpha", "1"]],
			rule: true,
		});

		expect(rendered.split("\n")).toEqual(["NAME   VALUE", "─────  ─────", "alpha  1"]);
	});

	test("applies ANSI styling only when color is enabled, keeping alignment", () => {
		const esc = String.fromCharCode(0x1b);
		const columns = [{ header: "OBJECTIVE", style: "bold-cyan" as const }, { header: "LATEST", style: "dim" as const }];
		const rows = [["alpha", "2026-06-13"]];

		const plain = renderTextTable({ columns, rows, headerStyle: "bold-cyan", color: false });
		expect(plain).not.toContain(esc);
		expect(plain.split("\n")).toEqual(["OBJECTIVE  LATEST", "alpha      2026-06-13"]);

		const colored = renderTextTable({ columns, rows, headerStyle: "bold-cyan", color: true });
		expect(colored).toContain(`${esc}[1;36mOBJECTIVE${esc}[0m`); // header bold cyan
		expect(colored).toContain(`${esc}[1;36malpha${esc}[0m`); // first column bold cyan
		expect(colored).toContain(`${esc}[2m2026-06-13${esc}[0m`); // dim column
		// Padding is computed from visible width, so the styled first column lines up with the plain one.
		const coloredLine = colored.split("\n")[1] ?? "";
		expect(coloredLine).toContain(`${esc}[1;36malpha${esc}[0m      `); // 6 trailing pad spaces, same as plain
	});

	test("does not wrap empty continuation cells in escape codes", () => {
		const esc = String.fromCharCode(0x1b);
		const rendered = renderTextTable({
			columns: [{ header: "A", style: "bold-cyan" }, { header: "B", style: "dim" }],
			rows: [["x\ny", "one"]],
			color: true,
		});
		const lines = rendered.split("\n");
		// Continuation line: column A has "y"; column B is empty, so it must not emit dim escape codes
		// and the trailing padding is trimmed away.
		expect(lines[2]).toBe(`${esc}[1;36my${esc}[0m`);
	});

	test("throws when a row's cell count does not match the columns", () => {
		expect(() => renderTextTable({ columns: [{ header: "a" }, { header: "b" }], rows: [["only-one"]] })).toThrow(/2 columns/);
	});
});

describe("displayWidth", () => {
	test("counts ASCII and common one-cell symbols as width 1 each", () => {
		expect(displayWidth("abc")).toBe(3);
		expect(displayWidth("○ open")).toBe(6);
		expect(displayWidth("├ 1/3 x")).toBe(7);
	});

	test("counts wide and fullwidth code points as 2", () => {
		expect(displayWidth("中文")).toBe(4); // CJK ideographs
		expect(displayWidth("ＡＢ")).toBe(4); // fullwidth Latin
	});

	test("ignores ANSI color escape sequences so colorized cells stay aligned", () => {
		const esc = String.fromCharCode(0x1b);
		const colored = `${esc}[32m○ open${esc}[0m`;
		expect(displayWidth(colored)).toBe(6);
		expect(displayWidth("○ open")).toBe(6);
	});

	test("ignores combining and zero-width marks", () => {
		expect(displayWidth("é")).toBe(1); // e + combining acute accent
		expect(displayWidth("a‍b")).toBe(2); // zero width joiner between letters
	});
});

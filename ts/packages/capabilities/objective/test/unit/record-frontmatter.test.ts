import { describe, expect, test } from "vitest";

import { splitObjectiveRecordDocument } from "../../src/core/record-frontmatter.ts";

const RECORD_BODY = "# Objective\n\n## Thesis\n\nBody text.\n";

const WELL_FORMED_FRONTMATTER = [
	"---",
	"blocked: First external publish is gated on checkout-free distribution landing.",
	"edges:",
	"  - objective: checkout-free-sdl-distribution",
	"    annotation: Consumed as a hard dependency; must land before this ships externally.",
	"---",
	"",
	"",
].join("\n");

describe("splitObjectiveRecordDocument", () => {
	test("returns full content as body with no frontmatter key when there is no fence", () => {
		expect(splitObjectiveRecordDocument(RECORD_BODY)).toEqual({ body: RECORD_BODY });
	});

	test("does not treat a mid-document thematic break as a frontmatter fence", () => {
		const content = "# Objective\n\n---\n\nMore prose.\n";
		expect(splitObjectiveRecordDocument(content)).toEqual({ body: content });
	});

	test("parses blocked and edges and strips the block from the body", () => {
		const document = splitObjectiveRecordDocument(`${WELL_FORMED_FRONTMATTER}${RECORD_BODY}`);
		expect(document).toEqual({
			frontmatter: {
				type: "frontmatter",
				frontmatter: {
					blocked: "First external publish is gated on checkout-free distribution landing.",
					edges: [
						{
							objective: "checkout-free-sdl-distribution",
							annotation: "Consumed as a hard dependency; must land before this ships externally.",
						},
					],
				},
			},
			body: `\n${RECORD_BODY}`,
		});
	});

	test("normalizes omitted keys: edges-only frontmatter has null blocked", () => {
		const content = `---\nedges: []\n---\n${RECORD_BODY}`;
		expect(splitObjectiveRecordDocument(content)).toEqual({
			frontmatter: { type: "frontmatter", frontmatter: { blocked: null, edges: [] } },
			body: RECORD_BODY,
		});
	});

	test("normalizes omitted keys: blocked-only frontmatter has empty edges", () => {
		const content = `---\nblocked: Waiting on an external gate.\n---\n${RECORD_BODY}`;
		expect(splitObjectiveRecordDocument(content)).toEqual({
			frontmatter: {
				type: "frontmatter",
				frontmatter: { blocked: "Waiting on an external gate.", edges: [] },
			},
			body: RECORD_BODY,
		});
	});

	test("treats an empty frontmatter block as well-formed with no keys", () => {
		const content = `---\n---\n${RECORD_BODY}`;
		expect(splitObjectiveRecordDocument(content)).toEqual({
			frontmatter: { type: "frontmatter", frontmatter: { blocked: null, edges: [] } },
			body: RECORD_BODY,
		});
	});

	test("marks an unclosed opening fence malformed and strips nothing", () => {
		const content = `---\nblocked: Never closed.\n${RECORD_BODY}`;
		const document = splitObjectiveRecordDocument(content);
		expect(document.body).toBe(content);
		expect(document.frontmatter).toEqual({
			type: "malformed",
			message: "frontmatter opening fence has no closing fence",
		});
	});

	test("marks invalid YAML malformed but still strips the fenced block", () => {
		const content = `---\nblocked: [unclosed\n---\n${RECORD_BODY}`;
		const document = splitObjectiveRecordDocument(content);
		expect(document.body).toBe(RECORD_BODY);
		expect(document.frontmatter).toMatchObject({ type: "malformed" });
		if (document.frontmatter?.type !== "malformed") throw new Error("expected malformed");
		expect(document.frontmatter.message).toContain("not valid YAML");
	});

	test("marks keys outside the closed blocked/edges schema malformed", () => {
		const content = `---\nkind: blocking\n---\n${RECORD_BODY}`;
		const document = splitObjectiveRecordDocument(content);
		expect(document.body).toBe(RECORD_BODY);
		expect(document.frontmatter).toMatchObject({ type: "malformed" });
		if (document.frontmatter?.type !== "malformed") throw new Error("expected malformed");
		expect(document.frontmatter.message).toContain("blocked/edges schema");
	});

	test("marks wrongly-typed edge entries malformed", () => {
		const content = `---\nedges:\n  - checkout-free-sdl-distribution\n---\n${RECORD_BODY}`;
		expect(splitObjectiveRecordDocument(content).frontmatter).toMatchObject({
			type: "malformed",
		});
	});

	test("marks non-mapping YAML malformed", () => {
		const content = `---\njust a sentence\n---\n${RECORD_BODY}`;
		expect(splitObjectiveRecordDocument(content).frontmatter).toMatchObject({
			type: "malformed",
		});
	});

	test("handles CRLF fences and bodies", () => {
		const content = "---\r\nblocked: Gated.\r\n---\r\nBody line.\r\n";
		expect(splitObjectiveRecordDocument(content)).toEqual({
			frontmatter: { type: "frontmatter", frontmatter: { blocked: "Gated.", edges: [] } },
			body: "Body line.\r\n",
		});
	});

	test("handles empty content", () => {
		expect(splitObjectiveRecordDocument("")).toEqual({ body: "" });
	});
});

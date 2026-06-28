// Shared finite result-block primitives for house-style side-effect outcomes.
//
// This sits in the opt-in theme layer because the same generic block shape is now proven across Flow
// and CCC. Domain-specific facts (git transcripts, land plans, autoslot state) stay in their owning
// packages; this module owns only the common headline + body/guidance/cwd layout grammar.

import type { Caps } from "../caps.ts";
import { glyph } from "./glyphs.ts";
import { bold, dim, paint, type Intent } from "./palette.ts";

export type ResultBlockKind = "success" | "failure" | "refusal";

export interface ResultBlockInput {
	kind: ResultBlockKind;
	headline: string;
	body?: string | undefined;
	guidance?: string | undefined;
	cwd?: string | undefined;
}

export function resultBlockHeadline(
	caps: Caps,
	input: Pick<ResultBlockInput, "kind" | "headline">,
): string {
	const style = resultBlockHeadlineStyle(input.kind);
	return bold(paint(caps, style.intent, `${glyph(caps, style.glyphName)} ${input.headline}`));
}

export function renderResultBlock(caps: Caps, input: ResultBlockInput): string {
	const lines: string[] = [resultBlockHeadline(caps, input)];
	const body = normalDetail(input.body);
	if (body !== undefined) lines.push(body);
	const guidance = normalDetail(input.guidance);
	if (guidance !== undefined) lines.push(guidance);
	if (input.cwd !== undefined && input.cwd !== "") {
		lines.push(dim(`Cwd: ${input.cwd}`));
	}
	return lines.join("\n");
}

function resultBlockHeadlineStyle(kind: ResultBlockKind): {
	intent: Intent;
	glyphName: "done" | "fail";
} {
	switch (kind) {
		case "success":
			return { intent: "success", glyphName: "done" };
		case "failure":
			return { intent: "error", glyphName: "fail" };
		case "refusal":
			return { intent: "warn", glyphName: "fail" };
	}
}

function normalDetail(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const normalized = value.trimEnd();
	return normalized === "" ? undefined : normalized;
}

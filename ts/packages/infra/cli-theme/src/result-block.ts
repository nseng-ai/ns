// Shared finite result-block primitives for house-style side-effect outcomes.
//
// This sits in the opt-in theme layer because the same generic block shape is now proven across Flow
// and CCC. Domain-specific facts (git transcripts, land plans, autoslot state) stay in their owning
// packages; this module owns only the common headline + body/guidance/cwd layout grammar.

import type { Caps } from "@sdl/clinkr";
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

export interface ResultBlockMessageInput {
	kind: ResultBlockKind;
	/** Domain-authored message whose first line is the headline and remaining lines are the body. */
	message: string;
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

export function renderResultBlockFromMessage(caps: Caps, input: ResultBlockMessageInput): string {
	const split = splitResultBlockMessage(input.message);
	return renderResultBlock(caps, {
		kind: input.kind,
		headline: split.headline,
		...(split.body === undefined ? {} : { body: split.body }),
		...(input.guidance === undefined ? {} : { guidance: input.guidance }),
		...(input.cwd === undefined ? {} : { cwd: input.cwd }),
	});
}

function splitResultBlockMessage(message: string): { headline: string; body?: string } {
	const newlineIndex = message.indexOf("\n");
	if (newlineIndex === -1) return { headline: message };
	const body = message.slice(newlineIndex + 1);
	return {
		headline: message.slice(0, newlineIndex),
		...(body === "" ? {} : { body }),
	};
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

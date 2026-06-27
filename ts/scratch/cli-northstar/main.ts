// THROWAWAY steelthread harness — entry point.
//
// Run directly under Node 24+ (TS type-stripping), e.g.
//   node ts/scratch/cli-northstar/main.ts objective-list --color 16 --ladder b
//   node ts/scratch/cli-northstar/main.ts flow-submit
//   node ts/scratch/cli-northstar/main.ts matrix
//
// This is disposable: it exists only to dial in the CLI UX north star by feel. No part of
// it is wired into @sdl/clinkr; the real foundations are built separately at rebuild.

import type { Caps, ColorDepth, Swatch } from "./caps.ts";
import { defaultCaps, isColorDepth } from "./caps.ts";
import { OBJECTIVE_ROWS, SUBMIT_PHASES } from "./fixtures.ts";
import { findAccent, renderAccents, renderPalette } from "./palette.ts";
import type { MarkerStyle } from "./render.ts";
import {
	DEFAULT_MARKER,
	isMarkerStyle,
	renderFlowSubmit,
	renderMarkerGallery,
	renderMatrix,
	renderObjectiveList,
} from "./render.ts";

const USAGE = `cli-northstar — throwaway UX steelthread harness

Usage:
  node main.ts <command> [options]

Commands:
  objective-list      buffered minimal/gh-chrome list
  flow-submit         streaming submit (in-place live region + log-tail)
  matrix              objective-list across every ladder rung (A and B)
  markers             objective-list under each outstanding-changes marker treatment
  palette             semantic intent swatches + accent ladder degradation
  accents             brand-accent candidates shown in context
  help                show this message

Capability knobs:
  --color <depth>     truecolor | 256 | 16 | mono           (default truecolor)
  --width <n>         force terminal columns                 (default 80)
  --ascii             force the ascii glyph/spinner set      (default unicode)
  --ladder <a|b>      A = full ladder, B = modern-only       (default A)

objective-list only:
  --marker <style>    paren | dot | label | legend           (default legend)

any surface:
  --accent <name>     override brand accent (see: accents)    (default cyan)

flow-submit only:
  --fail              render the failure path
  --static            no animation (render final frame once)
  --speed <ms>        base step dwell (network steps 2.6x)    (default 220)

Tip: keep --width <= your real terminal width; the in-place renderer owns the cursor and
does not account for terminal line-wrapping.`;

interface ParsedArgs {
	command: string;
	color: ColorDepth;
	width: number;
	unicode: boolean;
	ladder: "A" | "B";
	fail: boolean;
	motion: boolean;
	speed: number;
	marker: MarkerStyle;
	accent: Swatch | null;
}

function normalizeColor(value: string): ColorDepth | null {
	const alias: Record<string, ColorDepth> = {
		"256": "ansi256",
		"16": "ansi16",
		mono: "none",
	};
	const resolved = alias[value] ?? value;
	return isColorDepth(resolved) ? resolved : null;
}

function parseArgs(argv: readonly string[]): ParsedArgs | { error: string } {
	const base = defaultCaps();
	const parsed: ParsedArgs = {
		command: argv[0] ?? "help",
		color: base.colorDepth,
		width: base.columns,
		unicode: base.unicode,
		ladder: base.ladder,
		fail: false,
		motion: base.motion,
		speed: 220,
		marker: DEFAULT_MARKER,
		accent: null,
	};

	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index];
		switch (arg) {
			case "--color": {
				const next = argv[(index += 1)];
				const color = next === undefined ? null : normalizeColor(next);
				if (color === null) return { error: `invalid --color: ${next ?? "(missing)"}` };
				parsed.color = color;
				break;
			}
			case "--width": {
				const next = Number(argv[(index += 1)]);
				if (!Number.isInteger(next) || next < 20)
					return { error: "invalid --width (need integer >= 20)" };
				parsed.width = next;
				break;
			}
			case "--ascii":
				parsed.unicode = false;
				break;
			case "--unicode":
				parsed.unicode = true;
				break;
			case "--ladder": {
				const next = (argv[(index += 1)] ?? "").toUpperCase();
				if (next !== "A" && next !== "B") return { error: "invalid --ladder (a|b)" };
				parsed.ladder = next;
				break;
			}
			case "--marker": {
				const next = argv[(index += 1)];
				if (next === undefined || !isMarkerStyle(next)) {
					return { error: `invalid --marker: ${next ?? "(missing)"} (paren|dot|label|legend)` };
				}
				parsed.marker = next;
				break;
			}
			case "--accent": {
				const next = argv[(index += 1)];
				const candidate = next === undefined ? undefined : findAccent(next);
				if (candidate === undefined) {
					return { error: `invalid --accent: ${next ?? "(missing)"} (see the accents command)` };
				}
				parsed.accent = candidate.swatch;
				break;
			}
			case "--fail":
				parsed.fail = true;
				break;
			case "--static":
				parsed.motion = false;
				break;
			case "--speed": {
				const next = Number(argv[(index += 1)]);
				if (!Number.isInteger(next) || next < 0)
					return { error: "invalid --speed (need integer >= 0)" };
				parsed.speed = next;
				break;
			}
			default:
				return { error: `unknown option: ${arg ?? ""}` };
		}
	}
	return parsed;
}

function capsFrom(args: ParsedArgs): Caps {
	return {
		colorDepth: args.color,
		columns: args.width,
		unicode: args.unicode,
		ladder: args.ladder,
		motion: args.motion,
		...(args.accent === null ? {} : { accent: args.accent }),
	};
}

async function main(): Promise<number> {
	const parsed = parseArgs(process.argv.slice(2));
	if ("error" in parsed) {
		process.stderr.write(`${parsed.error}\n\n${USAGE}\n`);
		return 2;
	}

	const caps = capsFrom(parsed);
	switch (parsed.command) {
		case "objective-list":
			process.stdout.write(renderObjectiveList(caps, OBJECTIVE_ROWS, { marker: parsed.marker }));
			return 0;
		case "markers":
			process.stdout.write(renderMarkerGallery(caps));
			return 0;
		case "palette":
			process.stdout.write(renderPalette(caps));
			return 0;
		case "accents":
			process.stdout.write(renderAccents(caps));
			return 0;
		case "flow-submit":
			await renderFlowSubmit(caps, SUBMIT_PHASES, {
				fail: parsed.fail,
				tickMs: parsed.speed,
			});
			return 0;
		case "matrix":
			process.stdout.write(renderMatrix(caps));
			return 0;
		case "help":
		case "--help":
		case "-h":
			process.stdout.write(`${USAGE}\n`);
			return 0;
		default:
			process.stderr.write(`unknown command: ${parsed.command}\n\n${USAGE}\n`);
			return 2;
	}
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		process.stderr.write(`cli-northstar crashed: ${String(error)}\n`);
		process.exitCode = 1;
	},
);

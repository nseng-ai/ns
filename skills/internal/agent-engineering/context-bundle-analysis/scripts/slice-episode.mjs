#!/usr/bin/env node
// slice-episode.mjs — bounded, line-targeted excerpts from a context-profiler
// bundle's messages.jsonl, keyed by episode turnRange or an explicit turn range.
//
// This replaces hand-rolled offset/limit reads of messages.jsonl. Output is
// hard-capped (per turn and in total) so sampling an episode can never pull
// the full transcript into the calling agent's context — the exact failure
// mode the context-bundle-analysis skill diagnoses.
//
// Read-only, deterministic, stdlib-only. Never modifies the bundle.
//
// Usage:
//   node slice-episode.mjs <bundle-path> --list
//   node slice-episode.mjs <bundle-path> --episode <label | N>
//   node slice-episode.mjs <bundle-path> --turns <start>:<end>
//
//   <bundle-path>  bundle directory (contains messages.jsonl) or a direct
//                  path to messages.jsonl (episodes.json read from its dir).
//
// Options:
//   --list                 list episodes (index, kind, turns, flags, label) and exit
//   --episode <label | N>  slice one episode from episodes.json, by exact label
//                          (case-insensitive fallback) or by 1-based list index
//   --turns <start>:<end>  slice an explicit inclusive 1-based turn range
//   --max-turn-chars <n>   per-turn output cap in characters (default 1500)
//   --max-total-chars <n>  total output cap in characters (default 20000)
//   --help                 show this help

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";

const DEFAULT_MAX_TURN_CHARS = 1500;
const DEFAULT_MAX_TOTAL_CHARS = 20000;

function printHelp() {
  const lines = readFileSync(new URL(import.meta.url), "utf8").split("\n");
  const help = [];
  for (const line of lines.slice(1)) {
    if (!line.startsWith("//")) break;
    help.push(line.replace(/^\/\/ ?/, ""));
  }
  process.stdout.write(help.join("\n") + "\n");
}

function fail(message) {
  process.stderr.write(`slice-episode: ${message}\n`);
  process.exit(1);
}

// ── argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { maxTurnChars: DEFAULT_MAX_TURN_CHARS, maxTotalChars: DEFAULT_MAX_TOTAL_CHARS };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a === "--list") {
      args.list = true;
    } else if (a === "--episode" || a === "--turns" || a === "--max-turn-chars" || a === "--max-total-chars") {
      const value = argv[i + 1];
      if (value === undefined) fail(`${a} requires a value`);
      i++;
      if (a === "--episode") args.episode = value;
      else if (a === "--turns") args.turns = value;
      else if (a === "--max-turn-chars") args.maxTurnChars = parsePositiveInt(value, a);
      else args.maxTotalChars = parsePositiveInt(value, a);
    } else if (a.startsWith("--")) {
      fail(`unknown option ${a} (see --help)`);
    } else {
      positional.push(a);
    }
  }
  if (positional.length !== 1) fail("exactly one <bundle-path> argument is required (see --help)");
  args.bundlePath = positional[0];
  const modes = [args.list, args.episode !== undefined, args.turns !== undefined].filter(Boolean);
  if (modes.length !== 1) fail("pick exactly one of --list, --episode, --turns (see --help)");
  return args;
}

function parsePositiveInt(value, flag) {
  if (!/^\d+$/.test(value)) fail(`${flag} expects a positive integer, got ${JSON.stringify(value)}`);
  const n = Number(value);
  if (n < 1) fail(`${flag} must be at least 1`);
  return n;
}

// ── bundle resolution ───────────────────────────────────────────────────────

function resolveBundle(bundlePath) {
  if (!existsSync(bundlePath)) fail(`no such path: ${bundlePath}`);
  const stats = statSync(bundlePath);
  const dir = stats.isDirectory() ? bundlePath : dirname(bundlePath);
  const messagesPath = stats.isDirectory() ? join(bundlePath, "messages.jsonl") : bundlePath;
  if (basename(messagesPath) !== "messages.jsonl") {
    fail(`expected a bundle directory or a messages.jsonl path, got ${bundlePath}`);
  }
  if (!existsSync(messagesPath)) fail(`no messages.jsonl in ${dir}`);
  return { messagesPath, episodesPath: join(dir, "episodes.json") };
}

function loadEpisodes(episodesPath) {
  if (!existsSync(episodesPath)) {
    fail(`no episodes.json beside messages.jsonl (${episodesPath}); use --turns for a raw range`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(episodesPath, "utf8"));
  } catch (error) {
    fail(`episodes.json is not valid JSON: ${error.message}`);
  }
  const episodes = Array.isArray(parsed) ? parsed : parsed.episodes;
  if (!Array.isArray(episodes)) fail("episodes.json has no episodes array");
  return episodes;
}

function episodeFlags(episode) {
  return [episode.efficiency, episode.relevance].filter((flag) => typeof flag === "string");
}

function listEpisodes(episodes) {
  const rows = episodes.map((episode, index) => {
    const range = episode.turnRange ?? {};
    const flags = episodeFlags(episode);
    return [
      String(index + 1).padStart(3),
      String(episode.kind ?? "?").padEnd(4),
      `${range.start ?? "?"}-${range.end ?? "?"}`.padStart(9),
      (flags.length > 0 ? flags.join(",") : "-").padEnd(22),
      episode.label ?? "(unlabeled)",
    ].join("  ");
  });
  process.stdout.write("  #  kind      turns  flags                   label\n");
  process.stdout.write(rows.join("\n") + "\n");
}

function selectEpisode(episodes, selector) {
  if (/^\d+$/.test(selector)) {
    const index = Number(selector) - 1;
    if (index < 0 || index >= episodes.length) {
      fail(`episode index ${selector} out of range (1-${episodes.length}; see --list)`);
    }
    return episodes[index];
  }
  const exact = episodes.find((episode) => episode.label === selector);
  if (exact !== undefined) return exact;
  const caseInsensitive = episodes.filter(
    (episode) => typeof episode.label === "string" && episode.label.toLowerCase() === selector.toLowerCase(),
  );
  if (caseInsensitive.length === 1) return caseInsensitive[0];
  const labels = episodes.map((episode, index) => `  ${index + 1}. ${episode.label ?? "(unlabeled)"}`);
  fail(`no episode labeled ${JSON.stringify(selector)}; available:\n${labels.join("\n")}`);
}

function parseTurnRange(spec) {
  const match = /^(\d+):(\d+)$/.exec(spec);
  if (match === null) fail(`--turns expects <start>:<end> (1-based, inclusive), got ${JSON.stringify(spec)}`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start < 1 || end < start) fail(`invalid turn range ${spec}: need 1 <= start <= end`);
  return { start, end };
}

// ── message rendering ───────────────────────────────────────────────────────

function previewJson(value, cap) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (typeof text !== "string") text = String(text);
  return text.length > cap ? `${text.slice(0, cap)}…` : text;
}

function blockToText(block) {
  if (typeof block === "string") return block;
  if (block === null || typeof block !== "object") return `[unrenderable block]`;
  switch (block.type) {
    case "text":
      return typeof block.text === "string" ? block.text : "[text block]";
    case "thinking":
      return typeof block.thinking === "string" ? `[thinking] ${block.thinking}` : "[thinking block]";
    case "redacted_thinking":
      return "[redacted thinking]";
    case "tool_use":
      return `[tool_use ${block.name ?? "?"}] ${previewJson(block.input ?? {}, 400)}`;
    case "tool_result": {
      const inner = renderContent(block.content);
      const marker = block.is_error === true ? "[tool_result (error)]" : "[tool_result]";
      return inner.length > 0 ? `${marker} ${inner}` : marker;
    }
    case "image":
      return "[image]";
    case "document":
      return "[document]";
    default:
      return `[${block.type ?? "unknown"} block]`;
  }
}

function renderContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(blockToText).join("\n");
  if (content === null || content === undefined) return "";
  return previewJson(content, 400);
}

function renderTurn(line, turnNumber, maxTurnChars) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return { header: `[turn ${turnNumber} · unparseable]`, body: line.slice(0, maxTurnChars), truncated: line.length > maxTurnChars, fullLength: line.length };
  }
  const role = typeof message.role === "string" ? message.role : "?";
  const body = renderContent(message.content).trimEnd();
  const truncated = body.length > maxTurnChars;
  return {
    header: `[turn ${turnNumber} · ${role}]`,
    body: truncated ? body.slice(0, maxTurnChars) : body,
    truncated,
    fullLength: body.length,
  };
}

// ── slicing ─────────────────────────────────────────────────────────────────

async function sliceTurns(messagesPath, range, { maxTurnChars, maxTotalChars }) {
  const reader = createInterface({
    input: createReadStream(messagesPath, "utf8"),
    crlfDelay: Infinity,
  });
  let turnNumber = 0;
  let emittedChars = 0;
  let shownTurns = 0;
  let anyTurnTruncated = false;
  let capReachedAtTurn = 0;
  const out = [];
  for await (const line of reader) {
    turnNumber++;
    if (turnNumber < range.start) continue;
    if (turnNumber > range.end) break;
    if (capReachedAtTurn !== 0) continue; // keep counting turns for the omission report
    if (line.trim().length === 0) continue;
    const turn = renderTurn(line, turnNumber, maxTurnChars);
    const chunk = turn.truncated
      ? `${turn.header}\n${turn.body}\n…[turn truncated: showed ${maxTurnChars} of ${turn.fullLength} chars]`
      : `${turn.header}\n${turn.body}`;
    if (emittedChars + chunk.length > maxTotalChars && shownTurns > 0) {
      capReachedAtTurn = turnNumber;
      continue;
    }
    out.push(chunk);
    emittedChars += chunk.length;
    shownTurns++;
    anyTurnTruncated = anyTurnTruncated || turn.truncated;
  }
  reader.close();
  if (turnNumber < range.start) {
    fail(`turn range starts at ${range.start} but messages.jsonl has only ${turnNumber} turns`);
  }
  const lastTurnSeen = Math.min(turnNumber, range.end);
  if (capReachedAtTurn !== 0) {
    out.push(
      `[output cap reached: turns ${capReachedAtTurn}-${lastTurnSeen} omitted — re-run with --turns ${capReachedAtTurn}:${lastTurnSeen} to continue]`,
    );
  }
  const truncationNote = anyTurnTruncated || capReachedAtTurn !== 0 ? "output was truncated to stay bounded" : "no truncation";
  out.push(`— slice: turns ${range.start}-${lastTurnSeen} · ${shownTurns} turn(s) shown · ${truncationNote}`);
  process.stdout.write(out.join("\n\n") + "\n");
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { messagesPath, episodesPath } = resolveBundle(args.bundlePath);

  if (args.list) {
    listEpisodes(loadEpisodes(episodesPath));
    return;
  }

  let range;
  if (args.episode !== undefined) {
    const episode = selectEpisode(loadEpisodes(episodesPath), args.episode);
    const turnRange = episode.turnRange;
    if (turnRange === null || typeof turnRange !== "object" || typeof turnRange.start !== "number" || typeof turnRange.end !== "number") {
      fail(`episode ${JSON.stringify(episode.label ?? args.episode)} has no usable turnRange`);
    }
    range = { start: turnRange.start, end: turnRange.end };
    const flags = episodeFlags(episode);
    process.stdout.write(
      `episode: ${episode.label ?? "(unlabeled)"} · kind ${episode.kind ?? "?"} · turns ${range.start}-${range.end}${flags.length > 0 ? ` · ${flags.join(", ")}` : ""}\n\n`,
    );
  } else {
    range = parseTurnRange(args.turns);
  }

  await sliceTurns(messagesPath, range, {
    maxTurnChars: args.maxTurnChars,
    maxTotalChars: args.maxTotalChars,
  });
}

await main();

#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), ".ns", "objectives");

function hasBlockedSentence(content) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return false;

  const lines = content.split(/\r?\n/u);
  const closingFence = lines.indexOf("---", 1);
  if (closingFence === -1) return false;

  for (const line of lines.slice(1, closingFence)) {
    const match = /^blocked:\s*(.*?)\s*$/u.exec(line);
    if (match === null) continue;

    const value = match[1];
    return value !== "" && value !== "null" && value !== "~" && !value.startsWith("#");
  }

  return false;
}

let entries;
try {
  entries = await readdir(root, { withFileTypes: true });
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log("No Objective records exist.");
    process.exit(0);
  }
  throw error;
}

const records = [];
for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const recordRoot = join(root, entry.name);
  let objective;
  try {
    objective = await readFile(join(recordRoot, "objective.md"), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }

  try {
    await readFile(join(recordRoot, "closed.md"), "utf8");
    continue;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  records.push({ slug: entry.name, status: hasBlockedSentence(objective) ? "blocked" : "open" });
}

records.sort((left, right) => left.slug.localeCompare(right.slug));
if (records.length === 0) {
  console.log("No open Objectives exist.");
} else {
  for (const record of records) console.log(`${record.slug} — ${record.status}`);
}

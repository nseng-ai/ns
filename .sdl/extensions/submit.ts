// ../../../../../../../../../../private/tmp/sdl-submit-extension-build/submit-entry.ts
import { chmod, mkdir, mkdtemp as mkdtemp3, writeFile as writeFile3 } from "node:fs/promises";
import { join as join4 } from "node:path";
import process2 from "node:process";
import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import { prepareCheckpointMessage } from "./shared/checkpoint-message.ts";
import { preparePrDescription } from "./shared/text-helpers.ts";

// ts/packages/sdl-core/src/exec.ts
import { spawn } from "node:child_process";

// ts/packages/sdl-core/src/primitives.ts
import { createHash } from "node:crypto";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function sha256Digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ts/packages/sdl-core/src/terminal-escapes.ts
var TERMINAL_ESCAPE_PATTERN = /\x1B(?:\](?:[^\x07\x1B]|\x1B(?!\\))*?(?:\x07|\x1B\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
function stripTerminalEscapes(value) {
  return value.replace(TERMINAL_ESCAPE_PATTERN, "");
}

// ts/packages/sdl-core/src/timers.ts
var systemTimerScheduler = {
  setTimeout(callback, delayMs) {
    const timeout = setTimeout(callback, delayMs);
    return {
      cancel: () => clearTimeout(timeout)
    };
  }
};

// ts/packages/sdl-core/src/exec.ts
var DEFAULT_TIMEOUT_KILL_GRACE_MS = 5000;
var TIMEOUT_EXIT_CODE = 124;
var STARTUP_FAILURE_EXIT_CODE = 127;
async function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const timers = options.timers ?? systemTimerScheduler;
    let stdout = "";
    let stderr = "";
    let hasSettled = false;
    let hasTimedOut = false;
    let startupError;
    let timeoutTimer;
    let killTimer;
    const spawnOptions = {
      shell: false,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    };
    if (options.cwd !== undefined) {
      spawnOptions.cwd = options.cwd;
    }
    if (options.env !== undefined) {
      spawnOptions.env = options.env;
    }
    if (options.signal !== undefined) {
      spawnOptions.signal = options.signal;
    }
    const clearTimers = () => {
      timeoutTimer?.cancel();
      killTimer?.cancel();
    };
    const finish = (exitCode, killed) => {
      if (hasSettled)
        return;
      hasSettled = true;
      clearTimers();
      resolve({
        stdout,
        stderr,
        code: hasTimedOut ? TIMEOUT_EXIT_CODE : exitCode,
        killed: hasTimedOut || killed,
        ...startupError === undefined ? {} : { startupError }
      });
    };
    const child = spawn(command, [...args], spawnOptions);
    if (options.timeout !== undefined && options.timeout > 0) {
      timeoutTimer = timers.setTimeout(() => {
        hasTimedOut = true;
        child.kill("SIGTERM");
        const graceMs = options.timeoutKillGraceMs ?? DEFAULT_TIMEOUT_KILL_GRACE_MS;
        if (graceMs <= 0) {
          child.kill("SIGKILL");
          return;
        }
        killTimer = timers.setTimeout(() => {
          if (!hasSettled)
            child.kill("SIGKILL");
        }, graceMs);
      }, options.timeout);
    }
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      options.onStdout?.(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      options.onStderr?.(chunk);
    });
    if (options.stdin !== undefined) {
      child.stdin?.on("error", (error) => {
        if (error.code === "EPIPE")
          return;
        if (stderr.length === 0)
          stderr = error.message;
      });
      try {
        child.stdin?.end(options.stdin);
      } catch (error) {
        const stdinError = error;
        if (stdinError.code !== "EPIPE" && stderr.length === 0) {
          stderr = formatErrorMessage(stdinError);
        }
      }
    }
    child.on("error", (error) => {
      startupError = formatErrorMessage(error);
      if (stderr.length === 0)
        stderr = startupError;
      finish(STARTUP_FAILURE_EXIT_CODE, false);
    });
    child.on("close", (code, signal) => {
      finish(code ?? 1, signal !== null);
    });
  });
}
function formatCommand(command, args) {
  return [command, ...args].map(formatShellArg).join(" ");
}
function formatShellArg(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return shellQuote(value);
}
function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
function tailText(text, options) {
  const maxChars = Math.max(0, Math.trunc(options.maxChars));
  const lineLimited = applyLineLimit(text, options.maxLines);
  let tail = lineLimited.text;
  if (tail.length > maxChars) {
    tail = maxChars === 0 ? "…" : `…${tail.slice(-maxChars)}`;
  }
  if (lineLimited.omittedLines > 0) {
    return `… ${lineLimited.omittedLines} earlier line(s) omitted
${tail}`;
  }
  return tail;
}
function applyLineLimit(text, maxLines) {
  if (maxLines === undefined) {
    return { text, omittedLines: 0 };
  }
  const normalizedMaxLines = Math.max(0, Math.trunc(maxLines));
  const lines = text.split(`
`);
  if (lines.length <= normalizedMaxLines) {
    return { text, omittedLines: 0 };
  }
  if (normalizedMaxLines === 0) {
    return { text: "", omittedLines: lines.length };
  }
  return {
    text: lines.slice(-normalizedMaxLines).join(`
`),
    omittedLines: lines.length - normalizedMaxLines
  };
}

// ts/packages/sdl-core/src/submit/gt-output.ts
function extractPrLinks(output) {
  const strippedOutput = stripTerminalEscapes(output);
  const links = [];
  const seenUrls = new Set;
  for (const match of strippedOutput.matchAll(/https?:\/\/[^\s<>"'\u0060]+/g)) {
    const rawUrl = match[0];
    const url = trimTerminalPunctuation(rawUrl);
    if (seenUrls.has(url))
      continue;
    const link = toPrLink(url);
    if (link === undefined)
      continue;
    seenUrls.add(url);
    links.push(link);
  }
  return links;
}
function prNumberFromUrl(url) {
  const graphiteMatch = url.match(/^https:\/\/app\.graphite\.com\/github\/pr\/[^/\s?#]+\/[^/\s?#]+\/(\d+)(?:[/?#].*)?$/);
  if (graphiteMatch?.[1] !== undefined)
    return graphiteMatch[1];
  const githubMatch = url.match(/^https:\/\/github\.com\/[^/\s?#]+\/[^/\s?#]+\/pull\/(\d+)(?:[/?#].*)?$/);
  return githubMatch?.[1];
}
function toPrLink(url) {
  const prNumber = prNumberFromUrl(url);
  if (prNumber !== undefined)
    return { label: `#${prNumber}`, url };
  if (isPotentialPrUrl(url))
    return { label: url, url };
  return;
}
function isPotentialPrUrl(url) {
  return url.startsWith("https://app.graphite.com/github/pr/") || /^https:\/\/github\.com\/[^/\s?#]+\/[^/\s?#]+\/pull\//.test(url);
}
function trimTerminalPunctuation(url) {
  let trimmed = url;
  while (/[),.;:!?}\]]$/.test(trimmed)) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

// ts/packages/sdl-core/src/submit/submit-pr-link.ts
function formatPrLinkText(link) {
  if (link.label === link.url)
    return link.url;
  return `${link.label} ${link.url}`;
}
function formatPrLinkTextRow(link) {
  return `• ${formatPrLinkText(link)}`;
}
function prNumberFromLink(link) {
  const value = prNumberFromUrl(link.url) ?? link.label.match(/^#(\d+)$/)?.[1];
  if (value === undefined)
    return;
  const number = Number.parseInt(value, 10);
  return Number.isSafeInteger(number) ? number : undefined;
}

// ts/packages/sdl-core/src/submit/submit-format.ts
var CURRENT_PR_TIMEOUT_MS = 60000;
var RESTACK_TIMEOUT_MS = 600000;
var SUCCESS_OUTPUT_TAIL_MAX_LINES = 20;
var SUCCESS_OUTPUT_TAIL_MAX_CHARS = 2000;
function formatSubmitSuccessText(prLinks, descriptions) {
  const lines = [`Submitted ${prLinks.length} ${prLinks.length === 1 ? "PR" : "PRs"}:`];
  for (const link of prLinks) {
    lines.push(`✓ ${formatPrLinkText(link)}`);
    for (const status of formatSubmitSuccessStatuses(link, descriptions)) {
      lines.push(`  - ${status}`);
    }
  }
  if (descriptions.skipped.length > 0) {
    lines.push("", "Skipped unchanged PR descriptions:", ...descriptions.skipped.map(formatPrLinkTextRow));
  }
  return lines.join(`
`);
}
function formatSubmitSuccessFallbackText(stdout, stderr) {
  const lines = [
    "Submit succeeded, but no PR URLs were detected in output.",
    "PR descriptions were not generated. Checkout a branch and run `sdl regenerate-pr` if needed."
  ];
  const outputTail = formatSubmitOutputTail(stdout, stderr);
  if (outputTail) {
    lines.push("", "Recent output:", outputTail);
  }
  return lines.join(`
`);
}
function formatSubmitSuccessStatuses(link, descriptions) {
  const statuses = [];
  if (hasMatchingLink(descriptions.prewritten, link)) {
    statuses.push("initial metadata prepared");
  }
  if (hasMatchingLink(descriptions.generated, link) || hasMatchingLink(descriptions.prewriteFallbacks, link)) {
    statuses.push("description updated");
  }
  return statuses;
}
function hasMatchingLink(links, target) {
  return links.some((link) => link.url === target.url);
}
function formatSubmitOutputTail(stdout, stderr) {
  const output = stripTerminalEscapes(`${stdout}
${stderr}`).replace(/\r/g, `
`).trimEnd();
  if (!output)
    return "";
  const lines = output.split(`
`);
  const tailLines = lines.slice(-SUCCESS_OUTPUT_TAIL_MAX_LINES);
  let tail = tailLines.join(`
`);
  if (tail.length > SUCCESS_OUTPUT_TAIL_MAX_CHARS) {
    tail = `…${tail.slice(-SUCCESS_OUTPUT_TAIL_MAX_CHARS)}`;
  }
  if (lines.length > tailLines.length) {
    return `… ${lines.length - tailLines.length} earlier line(s) omitted
${tail}`;
  }
  return tail;
}
function formatPreflightFailureOutput(output) {
  const reason = output.startupError ? `gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run could not start: ${output.startupError}. Submission was not attempted.` : output.killed ? `gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s. Submission was not attempted.` : `gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run failed with exit code ${output.exitCode}. Submission was not attempted.`;
  return [
    reason,
    "",
    "$ gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run",
    "",
    formatOutputSection("stdout", output.stdout),
    formatOutputSection("stderr", output.stderr)
  ].filter(Boolean).join(`
`);
}
function formatTrunkOutOfDatePreflightOutput(_output) {
  return [
    "Graphite could not update the trunk branch before submit.",
    "Submission was not attempted.",
    "",
    "What to do next:",
    "- Update or repair your local Graphite trunk checkout, then rerun `sdl submit`.",
    "- If Graphite reports a specific trunk-update problem, resolve that first.",
    "- To inspect the raw Graphite dry-run output, rerun with `sdl submit --verbose` or run `gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run` manually."
  ].join(`
`);
}
function formatRestackRequiredOutput(output) {
  return [
    "Graphite requires a restack before submission.",
    "Plain `sdl submit` normally runs `gt restack --downstack --no-interactive` automatically when required; this output means automatic restack was disabled or unavailable.",
    "Run `gt restack --downstack`, resolve any conflicts, then run `sdl submit` again.",
    "Submission was not attempted.",
    "",
    "$ gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run",
    "",
    formatOutputSection("stdout", output.stdout),
    formatOutputSection("stderr", output.stderr)
  ].filter(Boolean).join(`
`);
}
function formatRestackConfirmationPrompt(output) {
  return {
    title: "Run gt restack before submit?",
    message: [
      "Graphite dry-run says restack is required before submission.",
      "Run `gt restack --downstack --no-interactive` now, then continue with submit?",
      "",
      "If confirmed, sdl submit will run:",
      "$ gt restack --downstack --no-interactive",
      "$ gt submit --no-edit --publish --no-stack --no-ai --no-interactive",
      "",
      "If restack hits conflicts or fails, submission will stop before `gt submit`.",
      "",
      "$ gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run",
      "",
      formatOutputSection("stdout", output.stdout),
      formatOutputSection("stderr", output.stderr)
    ].filter(Boolean).join(`
`)
  };
}
function formatRestackDeclinedOutput(output) {
  return [
    "Restack was not run. Submission was not attempted.",
    "Run `gt restack --downstack`, resolve any conflicts, then run `sdl submit` again.",
    "",
    "$ gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run",
    "",
    formatOutputSection("stdout", output.stdout),
    formatOutputSection("stderr", output.stderr)
  ].filter(Boolean).join(`
`);
}
function formatRestackConflictOutput(output, conflictedFiles) {
  const fileLines = conflictedFiles.length > 0 ? ["Conflicted files:", ...conflictedFiles.map((file) => `- ${file}`), ""] : [];
  return [
    "`gt restack --downstack` hit merge conflicts. Submission was not attempted.",
    "",
    ...fileLines,
    "Resolve the conflicts, continue or abort the rebase as appropriate, then run `sdl submit` again.",
    "",
    "$ gt restack --downstack --no-interactive",
    "",
    formatOutputSection("stdout", output.stdout),
    formatOutputSection("stderr", output.stderr)
  ].filter(Boolean).join(`
`);
}
function formatReadinessRecheckFailureOutput(output) {
  return [
    [
      "Graphite still requires restack after `sdl submit` already ran `gt restack --downstack --no-interactive`.",
      "Submission was not attempted. PR metadata was not prepared."
    ].join(`
`),
    formatIndentedOutputBlock("Graphite dry-run error:", output.stderr),
    [
      "Next steps:",
      "- Run `gt restack --downstack` manually and resolve any conflicts, skipped branches, or stale branch state Graphite reports.",
      "- Verify readiness: `gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run`",
      "- Then rerun: `sdl submit`"
    ].join(`
`),
    formatIndentedOutputBlock("Additional dry-run stdout:", output.stdout)
  ].filter((section) => section !== undefined && section !== "").join(`

`);
}
function formatRestackFailureOutput(output) {
  const reason = output.startupError ? `gt restack --downstack could not start: ${output.startupError}. Submission was not attempted.` : output.killed ? `gt restack --downstack timed out after ${RESTACK_TIMEOUT_MS / 1000}s. Submission was not attempted.` : `gt restack --downstack --no-interactive failed with exit code ${output.exitCode}. Submission was not attempted.`;
  return [
    reason,
    "",
    "$ gt restack --downstack --no-interactive",
    "",
    formatOutputSection("stdout", output.stdout),
    formatOutputSection("stderr", output.stderr)
  ].filter(Boolean).join(`
`);
}
function formatPrewriteFailureOutput(error, amendedBranches) {
  return [
    error,
    ...amendedBranches.length === 0 ? [] : [
      "",
      "Local PR metadata commit messages were amended before the failure:",
      ...amendedBranches.map((branch) => `- ${branch}`)
    ]
  ].filter(Boolean).join(`
`);
}
function formatSubmitFailureOutput(output, prewrittenMetadata) {
  const reason = output.startupError ? `gt submit --no-edit --publish --no-stack --no-ai --no-interactive could not start: ${output.startupError}.` : output.killed ? "gt submit --no-edit --publish --no-stack --no-ai --no-interactive timed out and was killed." : `gt submit --no-edit --publish --no-stack --no-ai --no-interactive failed with exit code ${output.exitCode}.`;
  return [
    reason,
    ...prewrittenMetadata.length === 0 ? [] : [
      "Local PR metadata commit messages were prepared before submit; rerun sdl submit after resolving the Graphite failure."
    ],
    "",
    "$ gt submit --no-edit --publish --no-stack --no-ai --no-interactive",
    "",
    formatOutputSection("stdout", output.stdout),
    formatOutputSection("stderr", output.stderr)
  ].filter(Boolean).join(`
`);
}
function formatPostSubmitFailureOutput({
  submitted,
  currentPr
}) {
  return [
    formatPostSubmitFailureReason(submitted.semanticFailureCause, currentPr),
    "",
    "$ gt submit --no-edit --publish --no-stack --no-ai --no-interactive",
    "",
    formatOutputSection("stdout", submitted.output.stdout),
    formatOutputSection("stderr", submitted.output.stderr),
    formatBufferedCommandSection("$ gt branch info --no-interactive", currentPr.output, CURRENT_PR_TIMEOUT_MS),
    ...currentPr.kind === "no_current_pr" ? ["", ...formatNoCurrentPrRecoveryGuidance()] : []
  ].filter(Boolean).join(`
`);
}
function formatPostSubmitFailureReason(semanticFailureCause, currentPr) {
  return [
    semanticFailureCause === undefined ? undefined : formatSubmitSemanticFailureCause(semanticFailureCause),
    formatCurrentPrVerificationFailureReason(currentPr)
  ].filter((line) => Boolean(line)).join(`
`);
}
function formatSubmitSemanticFailureCause(cause) {
  switch (cause.kind) {
    case "empty_branch_skipped":
      return cause.branchName === undefined ? "gt submit exited 0, but Graphite skipped submitting part of the submit scope because a branch is empty." : `gt submit exited 0, but Graphite skipped submitting part of the submit scope because branch ${cause.branchName} is empty.`;
  }
  return assertNever(cause.kind);
}
function formatCurrentPrVerificationFailureReason(currentPr) {
  if (currentPr.kind === "present")
    return;
  if (currentPr.kind === "no_current_pr") {
    return "gt submit exited 0, but the current branch still has no PR.";
  }
  const cause = currentPr.cause;
  switch (cause) {
    case "startup_error":
      return `gt submit exited 0, but current PR verification could not start: ${currentPr.output.startupError ?? "unknown startup error"}`;
    case "timeout":
      return `gt submit exited 0, but current PR verification timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s.`;
    case "command_failed":
      return `gt submit exited 0, but current PR verification failed with exit code ${currentPr.output.exitCode}.`;
  }
  return assertNever(cause);
}
function assertNever(value) {
  throw new Error(`Unhandled value: ${String(value)}`);
}
function formatNoCurrentPrRecoveryGuidance() {
  return [
    "`sdl submit` checkpoints outstanding worktree changes before submitting.",
    "If the branch still has no PR, inspect the Graphite output above and rerun `sdl submit` after resolving the reported issue."
  ];
}
function formatBufferedCommandSection(commandDisplay, output, timeoutMs) {
  const status = output.startupError ? `startup error: ${output.startupError}` : output.killed ? `timed out after ${timeoutMs / 1000}s` : `exit code ${output.exitCode}`;
  return [
    `${commandDisplay} (${status})`,
    "",
    formatOutputSection("stdout", output.stdout),
    formatOutputSection("stderr", output.stderr)
  ].join(`
`);
}
function formatIndentedOutputBlock(title, output) {
  const lines = normalizedOutputLines(output);
  if (lines.length === 0)
    return;
  return [title, ...lines.map((line) => `  ${line}`)].join(`
`);
}
function normalizedOutputLines(output) {
  return stripTerminalEscapes(output).replace(/\r/g, `
`).split(`
`).map((line) => line.trimEnd()).filter((line) => line.trim() !== "");
}
function formatOutputSection(name, output) {
  const body = output.length > 0 ? output.replace(/\r/g, `
`) : `(empty)
`;
  return `----- ${name} -----
${body}${body.endsWith(`
`) ? "" : `
`}`;
}

// ts/packages/sdl-core/src/submit/command-failure.ts
var STDERR_DETAIL_LIMIT_CHARS = 1200;
function commandFailure(options) {
  const { command, args, result, code, message } = options;
  if (result.code === 0 && !result.killed) {
    return;
  }
  const details = {
    command,
    args: [...args],
    exit_code: result.code
  };
  if (result.startupError !== undefined) {
    details.startup_error = result.startupError;
  }
  const stderr = tailText(result.stderr.trim(), { maxChars: STDERR_DETAIL_LIMIT_CHARS });
  if (stderr !== "") {
    details.stderr = stderr;
  }
  return { code, message, details };
}

// ts/packages/sdl-core/src/submit/format.ts
function formatItemCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// ts/packages/sdl-core/src/submit/pr-description.ts
import { access, readFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import process from "node:process";

// ts/packages/sdl-core/src/managed-region.ts
function parseManagedRegion(input) {
  const beginCount = countOccurrences(input.text, input.markers.beginPrefix);
  const endCount = countOccurrences(input.text, input.markers.end);
  if (beginCount === 0 && endCount === 0)
    return { type: "missing" };
  if (beginCount === 0)
    return { type: "malformed", reason: "managed region begin marker is missing" };
  if (endCount === 0)
    return { type: "malformed", reason: "managed region end marker is missing" };
  if (beginCount > 1)
    return { type: "malformed", reason: "managed region begin marker is duplicated" };
  if (endCount > 1)
    return { type: "malformed", reason: "managed region end marker is duplicated" };
  const beginIndex = input.text.indexOf(input.markers.beginPrefix);
  const endIndex = input.text.indexOf(input.markers.end);
  if (endIndex < beginIndex)
    return { type: "malformed", reason: "managed region end marker appears before begin marker" };
  const beginEndIndex = input.text.indexOf("-->", beginIndex);
  if (beginEndIndex === -1)
    return { type: "malformed", reason: "managed region begin marker is unterminated" };
  if (endIndex < beginEndIndex + 3)
    return { type: "malformed", reason: "managed region end marker appears inside begin comment" };
  const beginComment = input.text.slice(beginIndex, beginEndIndex + 3);
  const metadata = input.parseMetadata === undefined ? undefined : input.parseMetadata(beginComment);
  if (metadata === undefined && input.parseMetadata !== undefined)
    return { type: "malformed", reason: "managed region metadata is invalid" };
  const rawBody = input.text.slice(beginEndIndex + 3, endIndex);
  return {
    type: "found",
    metadata,
    body: input.extractBody?.(rawBody) ?? rawBody,
    start: beginIndex,
    end: endIndex + input.markers.end.length,
    beginComment,
    rawBody
  };
}
function replaceManagedRegion(input) {
  return `${input.text.slice(0, input.start).trimEnd()}

${input.replacement}

${input.text.slice(input.end).trimStart()}`.trim();
}
function replaceMalformedManagedRegionFromBegin(input) {
  const beginIndex = input.text.indexOf(input.beginPrefix);
  if (beginIndex === -1)
    return input.text.trim() === "" ? input.replacement : `${input.replacement}

${input.text.trimStart()}`;
  return `${input.text.slice(0, beginIndex).trimEnd()}

${input.replacement}`.trim();
}
function countOccurrences(content, needle) {
  let count = 0;
  let start = 0;
  while (true) {
    const index = content.indexOf(needle, start);
    if (index === -1)
      return count;
    count += 1;
    start = index + needle.length;
  }
}

// ts/packages/sdl-core/src/text-truncation.ts
function truncateTextHeadTail(input) {
  if (input.value.length <= input.maxChars)
    return input.value;
  const marker = input.buildMarker(input.markerOmittedChars ?? input.value.length - input.maxChars);
  const remainingChars = Math.max(0, input.maxChars - marker.length);
  const headChars = splitHeadChars(remainingChars, input.headRatio, input.headRounding ?? "floor");
  const tailChars = remainingChars - headChars;
  const head = maybeTrimEnd(input.value.slice(0, headChars), input.shouldTrimHead === true);
  const tail = maybeTrimStart(tailChars === 0 ? "" : input.value.slice(input.value.length - tailChars), input.shouldTrimTail === true);
  return `${head}${marker}${tail}`;
}
function truncateTextHead(input) {
  const value = input.shouldTrimInput === true ? input.value.trim() : input.value;
  if (value.length <= input.maxChars)
    return value;
  let marker = input.buildMarker(0);
  let preservedChars = Math.max(0, input.maxChars - marker.length);
  marker = input.buildMarker(value.length - preservedChars);
  preservedChars = Math.max(0, input.maxChars - marker.length);
  marker = input.buildMarker(value.length - preservedChars);
  const head = maybeTrimEnd(value.slice(0, preservedChars), input.shouldTrimHead !== false);
  return `${head}${marker}`;
}
function splitHeadChars(remainingChars, headRatio, headRounding) {
  const rawHeadChars = remainingChars * headRatio;
  const roundedHeadChars = headRounding === "ceil" ? Math.ceil(rawHeadChars) : Math.floor(rawHeadChars);
  return Math.max(0, Math.min(remainingChars, roundedHeadChars));
}
function maybeTrimEnd(value, shouldTrim) {
  return shouldTrim ? value.trimEnd() : value;
}
function maybeTrimStart(value, shouldTrim) {
  return shouldTrim ? value.trimStart() : value;
}

// ts/packages/sdl-core/src/text-repair.ts
var MAX_ATTEMPTS = 2;
var DEFAULT_ATTEMPT_PROGRESS_HEARTBEAT_MS = 5000;
async function prepareRepairedText(options) {
  let prompt = options.initialPrompt;
  let firstFeedback;
  let latestFeedback = "";
  for (let attempt = 1;attempt <= MAX_ATTEMPTS; attempt += 1) {
    options.onProgress?.({ type: "attempt_started", attempt, maxAttempts: MAX_ATTEMPTS });
    const stopHeartbeat = startAttemptProgressHeartbeat(options, attempt, MAX_ATTEMPTS);
    let generated;
    try {
      generated = await options.generate(prompt);
    } finally {
      stopHeartbeat?.();
    }
    if (!generated.ok)
      return { ok: false, error: generated.error };
    const validation = options.validate(generated.text);
    if (validation.ok) {
      return {
        ok: true,
        value: validation.value,
        source: attempt === 1 ? "model" : "repaired_model",
        ...firstFeedback === undefined ? {} : { feedback: firstFeedback }
      };
    }
    latestFeedback = validation.feedback;
    firstFeedback ??= validation.feedback;
    if (attempt < MAX_ATTEMPTS) {
      options.onProgress?.({
        type: "attempt_invalid",
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        feedback: validation.feedback
      });
      prompt = options.buildRepairPrompt({
        initialPrompt: options.initialPrompt,
        previousDraft: generated.text,
        feedback: validation.feedback
      });
    }
  }
  return {
    ok: false,
    error: `Model produced an invalid ${options.noun} after ${MAX_ATTEMPTS} attempts.
${latestFeedback}`
  };
}
function startAttemptProgressHeartbeat(options, attempt, maxAttempts) {
  if (options.onProgress === undefined)
    return;
  const heartbeatMs = options.progressHeartbeatMs ?? DEFAULT_ATTEMPT_PROGRESS_HEARTBEAT_MS;
  if (heartbeatMs <= 0)
    return;
  let elapsedMs = 0;
  const timer = setInterval(() => {
    elapsedMs += heartbeatMs;
    options.onProgress?.({ type: "attempt_waiting", attempt, maxAttempts, elapsedMs });
  }, heartbeatMs);
  return () => clearInterval(timer);
}

// ts/packages/sdl-core/src/time-format.ts
function formatElapsedMs(elapsedMs) {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 60)
    return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// ts/packages/sdl-core/src/submit/text-generation.ts
var DEFAULT_PR_DESCRIPTION_MODEL_REF = "openai-codex/gpt-5.4-mini";
var PR_DESCRIPTION_MODEL_ENV = "SDL_DEV_PR_DESCRIPTION_MODEL";
function selectPrDescriptionModelRef(env) {
  const modelRef = env[PR_DESCRIPTION_MODEL_ENV]?.trim();
  if (modelRef !== undefined && modelRef !== "") {
    return modelRef;
  }
  return DEFAULT_PR_DESCRIPTION_MODEL_REF;
}

// ts/packages/sdl-core/src/submit/pr-description.ts
var PR_DESCRIPTION_PROMPT_ENV = "SDL_DEV_PR_DESCRIPTION_PROMPT";
var REPO_PR_DESCRIPTION_PROMPT_PATH = ".sdl/prompts/pr-description.md";
var GENERATED_BODY_MARKER = "<!-- generated-by: sdl-dev pr-description v1 -->";
var MANAGED_BODY_BEGIN_MARKER = "<!-- sdl-pr-description:begin";
var MANAGED_BODY_END_MARKER = "<!-- sdl-pr-description:end -->";
var PR_DESCRIPTION_GENERATOR_VERSION = "sdl-pr-description-v2";
var MAX_DIFF_CHARS = 120000;
var LOCKFILE_BASENAMES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "uv.lock",
  "poetry.lock",
  "Cargo.lock"
]);
var DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT = `You are a pull request metadata generator. Analyze the provided git diff and return ONLY a freshly generated PR title and body.

## Analysis Principles

Analyze the diff following these principles:

- **Be concise and strategic** - focus on significant changes
- **Use component-level descriptions** - reference modules/components, not individual functions
- **Highlight breaking changes prominently**
- **Note test coverage patterns**
- **Use relative paths from repository root**

## Level of Detail

- Focus on architectural and component-level impact
- Keep "Key Changes" to 3-5 major items
- Group related changes together
- Skip minor refactoring, formatting, or trivial updates

## Output Format

[Clear one-line PR title describing the change]

[2-3 sentence summary explaining what changed and why. State what the branch does (feature/fix/refactor) and highlight key changes briefly.]

## Key Changes

- [3-5 high-level component/architectural changes]
- Strategic change description focusing on purpose and impact
- Focus on what capabilities changed, not implementation details

<details>
<summary>Files Changed</summary>

### Added (N files)
- \`path/to/file.ts\` - Brief purpose (one line)

### Modified (N files)
- \`path/to/file.ts\` - What area changed (component level)

### Deleted (N files)
- \`path/to/file.ts\` - Why removed (strategic reason)

</details>

## User Experience
[Only include this section if changes affect user-facing behavior: CLI commands, prompts, output, workflows]

**Before:** [old user experience]
**After:** [new user experience]
[Optional 1-2 sentence explanation of the improvement]

## Critical Notes
[Only if there are breaking changes, security concerns, or important warnings - 1-2 bullets max]

## Rules

- **IMPORTANT**: Output the PR title and body directly. Do NOT wrap your response in code fences or markdown blocks.
- Output ONLY the PR title and body (no preamble, no explanation, no commentary)
- NO Claude attribution or footer (NEVER add "Generated with Claude Code" or similar)
- NO metadata headers (NEVER add \`**Author:**\`, \`**Plan:**\`, \`Closes #N\`, or similar)
- Use relative paths from repository root
- Be concise (15-40 lines total, shorter if no User Experience section)
- First line = freshly generated PR title, rest = PR body
- Regenerate the title from the diff and commit messages; do not preserve an existing PR title unless the changes independently justify that exact title
- Avoid function-level details unless critical
- Maximum 5 key changes
- Only include Critical Notes if necessary`;
function hashPrDescriptionPrompt(promptText) {
  return `sha256:${sha256Digest(promptText)}`;
}
function formatManagedGeneratedRegion(body, metadata) {
  const begin = `${MANAGED_BODY_BEGIN_MARKER} version=${metadata.version} patch-id=${metadata.patchId} prompt=${metadata.promptHash} generator=${metadata.generator} -->`;
  return [
    begin,
    "<details open>",
    "<summary>Generated PR description</summary>",
    "",
    body.trim(),
    "",
    "</details>",
    MANAGED_BODY_END_MARKER
  ].join(`
`);
}
function parseManagedGeneratedRegion(body) {
  const parsed = parseManagedRegion({
    text: body,
    markers: { beginPrefix: MANAGED_BODY_BEGIN_MARKER, end: MANAGED_BODY_END_MARKER },
    parseMetadata: parseManagedRegionMetadata,
    extractBody: extractManagedRegionBody
  });
  if (parsed.type !== "found")
    return parsed;
  return {
    type: "found",
    metadata: parsed.metadata,
    body: parsed.body,
    start: parsed.start,
    end: parsed.end
  };
}
function replaceOrInsertGeneratedRegion(existingBody, generatedBody, metadata) {
  const region = formatManagedGeneratedRegion(generatedBody, metadata);
  const parsed = parseManagedGeneratedRegion(existingBody);
  if (parsed.type === "found") {
    return replaceManagedRegion({
      text: existingBody,
      replacement: region,
      start: parsed.start,
      end: parsed.end
    });
  }
  if (parsed.type === "malformed") {
    return replaceMalformedManagedRegionFromBegin({
      text: existingBody,
      beginPrefix: MANAGED_BODY_BEGIN_MARKER,
      replacement: region
    });
  }
  if (existingBody.includes(GENERATED_BODY_MARKER)) {
    return region;
  }
  const trimmedExisting = existingBody.trim();
  return trimmedExisting === "" ? region : `${region}

${trimmedExisting}`;
}
function appendGeneratedMarker(body) {
  const withoutExistingMarker = body.replace(GENERATED_BODY_MARKER, "").trimEnd();
  return `${withoutExistingMarker}

${GENERATED_BODY_MARKER}`;
}
async function resolvePrDescriptionGeneration(input) {
  const repoRoot = await input.git.repoRoot({ cwd: input.cwd });
  const prompt = await resolvePrDescriptionPrompt({
    env: input.env,
    cwd: input.cwd,
    ...repoRoot.ok ? { repoRoot: repoRoot.value } : {}
  });
  if (!prompt.ok) {
    return { ok: false, error: prompt.error, exitCode: 2 };
  }
  return {
    ok: true,
    modelRef: selectPrDescriptionModelRef(input.env),
    promptText: prompt.text,
    promptSource: prompt.source
  };
}
async function resolvePrDescriptionPrompt(input) {
  const envPath = input.env[PR_DESCRIPTION_PROMPT_ENV]?.trim();
  if (envPath) {
    const path = resolvePromptPath(envPath, input.repoRoot, input.cwd);
    try {
      return { ok: true, text: await readFile(path, "utf8"), source: { type: "env", path } };
    } catch (error) {
      return {
        ok: false,
        error: `Could not read ${PR_DESCRIPTION_PROMPT_ENV} prompt file at ${path}: ${formatErrorMessage(error)}`,
        source: { type: "env", path }
      };
    }
  }
  if (input.repoRoot !== undefined) {
    const repoPath = join(input.repoRoot, REPO_PR_DESCRIPTION_PROMPT_PATH);
    if (await isReadableFile(repoPath)) {
      return {
        ok: true,
        text: await readFile(repoPath, "utf8"),
        source: { type: "repo", path: repoPath }
      };
    }
  }
  return { ok: true, text: DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT, source: { type: "builtin" } };
}
function buildPrDescriptionUserPrompt(input) {
  const context = [
    "## Context",
    "",
    ...formatPrContextLines(input),
    `- Head branch: ${input.headRefName}`,
    `- Base branch: ${input.baseRefName}`
  ].join(`
`);
  const commitMessages = formatCommitMessages(input.commitMessages ?? []);
  const diff = truncateDiff(filterLockfileSections(input.diff));
  const sections = [context];
  if (commitMessages !== "") {
    sections.push(`## Commit Messages

${commitMessages}`);
  }
  sections.push(`## Diff

\`\`\`diff
${diff.trimEnd()}
\`\`\``, "Generate a fresh PR title and body for this diff. Do not preserve an existing PR title unless the diff independently supports it:");
  return `${sections.join(`

`)}
`;
}
function parsePrDescriptionOutput(text) {
  const normalized = stripOuterCodeFence(trimOuterBlankLines(text.replace(/\r/g, "")));
  const lines = normalized.split(`
`);
  const titleIndex = lines.findIndex((line) => line.trim() !== "");
  const title = titleIndex === -1 ? "" : lines[titleIndex]?.trim() ?? "";
  const body = titleIndex === -1 ? "" : trimOuterBlankLines(lines.slice(titleIndex + 1).join(`
`));
  return validatePrDescription({ title, body });
}
function validatePrDescription(description) {
  const issues = [];
  if (description.title.trim() === "") {
    issues.push({ type: "empty_title" });
  }
  if (description.title.length > 120) {
    issues.push({ type: "title_too_long", length: description.title.length, maxLength: 120 });
  }
  if (description.body.trim() === "") {
    issues.push({ type: "empty_body" });
  }
  for (const line of description.body.split(`
`)) {
    if (/Generated with|Co-Authored-By/i.test(line)) {
      issues.push({ type: "attribution_footer", text: line.trim() });
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    description: { title: description.title.trim(), body: description.body.trim() }
  };
}
function formatPrDescriptionValidationFeedback(issues) {
  return issues.map(formatPrDescriptionValidationIssue).join(`
`);
}
function filterLockfileSections(diff) {
  const sections = diff.split(/(?=^diff --git )/m);
  return sections.filter((section) => !isLockfileDiffSection(section)).join("");
}
function truncateDiff(diff, maxChars = MAX_DIFF_CHARS) {
  return truncateTextHeadTail({
    value: diff,
    maxChars,
    headRatio: 0.7,
    buildMarker: (omittedChars) => `
[... TRUNCATED ${omittedChars} chars ...]
`
  });
}
function formatPrContextLines(input) {
  switch (input.kind) {
    case "github":
      return [
        `- PR: #${input.number} (${input.url})`,
        `- Current PR title (stale context only; regenerate from the diff): ${input.title}`
      ];
    case "local":
      return [
        "- PR: not yet created; generate initial metadata for Graphite submit",
        `- Title source (commit headline): ${input.title}`
      ];
  }
}
function formatCommitMessages(messages) {
  return messages.map((message) => message.headline.trim()).filter((message) => message !== "").join(`

---

`);
}
function parseManagedRegionMetadata(comment) {
  const fields = new Map;
  for (const match of comment.matchAll(/([a-z-]+)=([^\s>]+)/g)) {
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined)
      continue;
    fields.set(key, value);
  }
  const version = fields.get("version");
  const patchId = fields.get("patch-id");
  const promptHash = fields.get("prompt");
  const generator = fields.get("generator");
  if (version !== "2" || patchId === undefined || promptHash === undefined || generator === undefined)
    return;
  return { version, patchId, promptHash, generator };
}
function extractManagedRegionBody(regionContents) {
  const normalized = regionContents.replace(/\r/g, "");
  const match = normalized.match(/<details open>\n<summary>Generated PR description<\/summary>\n\n([\s\S]*?)\n\n<\/details>/);
  return match?.[1]?.trim() ?? normalized.trim();
}
function isLockfileDiffSection(section) {
  if (!section.startsWith("diff --git "))
    return false;
  const firstLine = section.split(`
`, 1)[0] ?? "";
  const match = firstLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (match?.[1] !== undefined && LOCKFILE_BASENAMES.has(basename(match[1])))
    return true;
  if (match?.[2] !== undefined && LOCKFILE_BASENAMES.has(basename(match[2])))
    return true;
  return false;
}
function trimOuterBlankLines(text) {
  const lines = text.replace(/\r/g, "").split(`
`);
  while (lines.length > 0 && (lines[0]?.trim() ?? "") === "") {
    lines.shift();
  }
  while (lines.length > 0 && (lines[lines.length - 1]?.trim() ?? "") === "") {
    lines.pop();
  }
  return lines.join(`
`);
}
function stripOuterCodeFence(text) {
  const trimmed = trimOuterBlankLines(text);
  const lines = trimmed.split(`
`);
  const first = lines[0]?.trim() ?? "";
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (lines.length >= 2 && /^```[\w-]*$/.test(first) && last === "```") {
    return trimOuterBlankLines(lines.slice(1, -1).join(`
`));
  }
  return trimmed;
}
function resolvePromptPath(path, repoRoot, cwd) {
  if (isAbsolute(path))
    return path;
  return resolve(repoRoot ?? cwd ?? process.cwd(), path);
}
async function isReadableFile(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function formatPrDescriptionValidationIssue(issue) {
  switch (issue.type) {
    case "empty_title":
      return "- Title is empty.";
    case "title_too_long":
      return `- Title is ${issue.length} characters; maximum is ${issue.maxLength}.`;
    case "empty_body":
      return "- Body is empty.";
    case "attribution_footer":
      return `- Body contains an attribution footer: ${issue.text}`;
  }
}

// ts/packages/sdl-core/src/result.ts
function resultOk(value) {
  return { ok: true, value };
}
function resultErr(error) {
  return { ok: false, error };
}
// ts/packages/sdl-core/src/submit/submit-pr-metadata-prewrite.ts
var GT_LOG_STACK_ARGS = ["log", "--stack", "--reverse", "--no-interactive"];
var GT_TRUNK_ARGS = ["trunk", "--no-interactive"];
var GT_BRANCH_INFO_BASE_ARGS = ["branch", "info", "--no-interactive", "--branch"];
var GT_MODIFY_BASE_ARGS = ["modify", "--no-interactive"];
var GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"];
var COMMAND_TIMEOUT_MS = 60000;
var MODIFY_TIMEOUT_MS = 600000;

class RealSubmitMetadataGateway {
  runner;
  constructor(runner = runCommand) {
    this.runner = runner;
  }
  async inspectSubmitStack(params) {
    const log = await this.runGt([...GT_LOG_STACK_ARGS], params.cwd, COMMAND_TIMEOUT_MS);
    const logError = commandError("gt", GT_LOG_STACK_ARGS, log, "submit_stack_inspection_failed", "Could not inspect the Graphite submit scope.");
    if (logError !== undefined)
      return resultErr(logError);
    const parsedLog = parseGtLogStack(log.stdout);
    if (parsedLog.branches.length === 0) {
      return resultErr({
        code: "submit_stack_empty",
        message: "Graphite submit-scope inspection did not return any branches."
      });
    }
    if (parsedLog.currentBranch === undefined) {
      return resultErr({
        code: "submit_stack_current_unknown",
        message: "Graphite submit-scope inspection did not identify the current branch."
      });
    }
    const trunk = await this.readGraphiteTrunk(params.cwd);
    if (!trunk.ok)
      return trunk;
    const submitBranchInfos = await this.readSubmitBranchInfos(params.cwd, parsedLog.currentBranch, trunk.value);
    if (!submitBranchInfos.ok)
      return submitBranchInfos;
    params.onProgress?.(formatStackBranchMetadataProgress(submitBranchInfos.value.length));
    const branches = [];
    for (const [index, info] of submitBranchInfos.value.entries()) {
      params.onProgress?.(`inspecting PR metadata for ${info.branch} (${index + 1}/${submitBranchInfos.value.length})`);
      const existingPr = parseExistingPrFromBranchInfo(info.output, info.branch);
      if (!existingPr.ok)
        return existingPr;
      if (existingPr.value !== undefined) {
        branches.push({ kind: "existing", branch: info.branch, parentBranch: info.parentBranch, pr: existingPr.value });
        continue;
      }
      params.onProgress?.(`reading local commits and diff for ${info.branch}`);
      const commitMessages = await this.readBranchCommitMessages(params.cwd, info.parentBranch, info.branch);
      if (!commitMessages.ok)
        return commitMessages;
      const diff = await this.readBranchDiff(params.cwd, info.parentBranch, info.branch);
      if (!diff.ok)
        return diff;
      branches.push({
        kind: "new",
        branch: info.branch,
        parentBranch: info.parentBranch,
        commitMessages: commitMessages.value,
        diff: diff.value
      });
    }
    return resultOk({ currentBranch: parsedLog.currentBranch, branches });
  }
  async ensureCleanWorktree(params) {
    const result = await this.runGit([...GIT_STATUS_PORCELAIN_ARGS], params.cwd, COMMAND_TIMEOUT_MS);
    const resultError = commandError("git", GIT_STATUS_PORCELAIN_ARGS, result, "submit_metadata_clean_check_failed", "Could not verify that the worktree is clean before amending PR metadata.");
    if (resultError !== undefined)
      return resultErr(resultError);
    if (result.stdout.trim() !== "") {
      return resultErr({
        code: "submit_metadata_dirty_worktree",
        message: "Worktree became dirty before PR metadata amendment. Submission was not attempted."
      });
    }
    return resultOk(undefined);
  }
  async amendBranchMetadataCommit(params) {
    const args = params.currentBranch === params.branch ? [...GT_MODIFY_BASE_ARGS, "-m", params.title, "-m", params.body] : [...GT_MODIFY_BASE_ARGS, "--into", params.branch, "-m", params.title, "-m", params.body];
    const result = await this.runGt(args, params.cwd, MODIFY_TIMEOUT_MS);
    const resultError = commandError("gt", args, result, "submit_metadata_amend_failed", `Could not amend local PR metadata commit for ${params.branch}.`);
    if (resultError !== undefined)
      return resultErr(resultError);
    return resultOk(undefined);
  }
  async readSubmitBranchInfos(cwd, currentBranch, trunk) {
    const branchInfos = [];
    const visited = /* @__PURE__ */ new Set();
    let branch = currentBranch;
    while (branch !== undefined && branch !== trunk) {
      if (visited.has(branch)) {
        return resultErr({
          code: "submit_branch_parent_cycle",
          message: `Graphite branch parent traversal looped at ${branch}.`
        });
      }
      visited.add(branch);
      const info = await this.runGt([...GT_BRANCH_INFO_BASE_ARGS, branch], cwd, COMMAND_TIMEOUT_MS);
      const infoError = commandError("gt", [...GT_BRANCH_INFO_BASE_ARGS, branch], info, "submit_branch_info_failed", `Could not inspect Graphite branch ${branch}.`);
      if (infoError !== undefined)
        return resultErr(infoError);
      const parentBranch = parseParentBranch(info.stdout);
      if (parentBranch === undefined)
        break;
      branchInfos.push({
        branch,
        parentBranch,
        output: `${info.stdout}\n${info.stderr}`
      });
      branch = parentBranch;
    }
    return resultOk(branchInfos.reverse());
  }
  async readGraphiteTrunk(cwd) {
    const result = await this.runGt([...GT_TRUNK_ARGS], cwd, COMMAND_TIMEOUT_MS);
    const resultError = commandError("gt", GT_TRUNK_ARGS, result, "submit_trunk_inspection_failed", "Could not inspect the Graphite trunk branch.");
    if (resultError !== undefined)
      return resultErr(resultError);
    const branch = result.stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0);
    if (branch === undefined) {
      return resultErr({
        code: "submit_trunk_empty",
        message: "Graphite trunk inspection did not return a branch."
      });
    }
    return resultOk(branch);
  }
  async readBranchCommitMessages(cwd, parentBranch, branch) {
    const args = ["log", "--format=%B%x00", `${parentBranch}..${branch}`];
    const result = await this.runGit(args, cwd, COMMAND_TIMEOUT_MS);
    const resultError = commandError("git", args, result, "submit_branch_commits_failed", `Could not read commits for ${branch}.`);
    if (resultError !== undefined)
      return resultErr(resultError);
    return resultOk(parseCommitMessages(result.stdout));
  }
  async readBranchDiff(cwd, parentBranch, branch) {
    const args = ["diff", `${parentBranch}..${branch}`];
    const result = await this.runGit(args, cwd, COMMAND_TIMEOUT_MS);
    const resultError = commandError("git", args, result, "submit_branch_diff_failed", `Could not read diff for ${branch}.`);
    if (resultError !== undefined)
      return resultErr(resultError);
    return resultOk(result.stdout);
  }
  async runGt(args, cwd, timeoutMs) {
    return this.runner("gt", args, { cwd, timeout: timeoutMs });
  }
  async runGit(args, cwd, timeoutMs) {
    return this.runner("git", args, { cwd, timeout: timeoutMs });
  }
}
async function prepareSubmitPrMetadata(input) {
  input.onProgress?.("inspecting Graphite submit scope before metadata preparation");
  const inspected = await input.gateway.inspectSubmitStack({
    cwd: input.cwd,
    ...input.onProgress === undefined ? {} : { onProgress: input.onProgress }
  });
  if (!inspected.ok) {
    return { kind: "failed", error: inspected.error.message, amendedBranches: [] };
  }
  const amendableBranches = findAmendableBranchNames(inspected.value);
  const newBranches = inspected.value.branches.filter((branch) => branch.kind === "new" && branch.commitMessages.length === 1 && amendableBranches.has(branch.branch));
  input.onProgress?.(formatMetadataPreparationDiscoveryProgress(inspected.value.branches.length, newBranches.length));
  if (newBranches.length === 0) {
    input.onProgress?.("no pre-submit PR metadata changes needed");
    return { kind: "prepared", prepared: [] };
  }
  const generated = await generateMetadataForBranches({
    cwd: input.cwd,
    env: input.env,
    git: input.git,
    textGenerator: input.textGenerator,
    branches: newBranches,
    ...input.onProgress === undefined ? {} : { onProgress: input.onProgress }
  });
  if (generated.kind === "failed") {
    return { ...generated, amendedBranches: [] };
  }
  if (generated.prepared.length === 0) {
    return { kind: "prepared", prepared: [] };
  }
  input.onProgress?.("checking clean worktree before metadata amendment");
  const clean = await input.gateway.ensureCleanWorktree({ cwd: input.cwd });
  if (!clean.ok) {
    return { kind: "failed", error: clean.error.message, amendedBranches: [] };
  }
  const amendedBranches = [];
  for (const [index, metadata] of generated.prepared.entries()) {
    input.onProgress?.(`amending local PR metadata commit for ${metadata.branch} (${index + 1}/${generated.prepared.length})`);
    const amended = await input.gateway.amendBranchMetadataCommit({
      cwd: input.cwd,
      currentBranch: inspected.value.currentBranch,
      branch: metadata.branch,
      title: metadata.title,
      body: metadata.body
    });
    if (!amended.ok) {
      return {
        kind: "failed",
        error: `Could not amend local PR metadata for ${metadata.branch}: ${amended.error.message}. Submission was not attempted.${amendedBranches.length === 0 ? "" : " Earlier branches may already have amended commit messages."}`,
        amendedBranches
      };
    }
    amendedBranches.push(metadata.branch);
  }
  input.onProgress?.(formatPreparedMetadataProgress(generated.prepared.length));
  return { kind: "prepared", prepared: generated.prepared };
}
async function generateMetadataForBranches(input) {
  const generation = await resolvePrDescriptionGeneration({
    env: input.env,
    cwd: input.cwd,
    git: input.git
  });
  if (!generation.ok) {
    return {
      kind: "failed",
      error: generation.error,
      ...generation.exitCode === undefined ? {} : { exitCode: generation.exitCode }
    };
  }
  const prepared = [];
  for (const [index, branch] of input.branches.entries()) {
    input.onProgress?.(`generating initial PR metadata for ${branch.branch} (${index + 1}/${input.branches.length})`);
    const currentTitle = branch.commitMessages[0]?.headline ?? branch.branch;
    const generated = await preparePrDescription({
      textGenerator: input.textGenerator,
      modelRef: generation.modelRef,
      promptText: generation.promptText,
      context: {
        kind: "local",
        title: currentTitle,
        headRefName: branch.branch,
        baseRefName: branch.parentBranch,
        commitMessages: branch.commitMessages,
        diff: branch.diff
      },
      ...input.onProgress === undefined ? {} : { onProgress: input.onProgress }
    });
    if (!generated.ok) {
      return {
        kind: "failed",
        error: `Could not generate initial PR metadata for ${branch.branch}: ${generated.error}`
      };
    }
    prepared.push({
      branch: branch.branch,
      parentBranch: branch.parentBranch,
      title: generated.title,
      body: generated.body,
      commitRange: `${branch.parentBranch}..${branch.branch}`,
      promptSource: generation.promptSource
    });
  }
  return { kind: "prepared", prepared };
}
function findAmendableBranchNames(inspection) {
  const byBranch = new Map(inspection.branches.map((branch) => [branch.branch, branch]));
  const amendable = new Set;
  let branchName = inspection.currentBranch;
  while (branchName !== undefined && !amendable.has(branchName)) {
    amendable.add(branchName);
    branchName = byBranch.get(branchName)?.parentBranch;
  }
  return amendable;
}
function commandError(command, args, result, code, message) {
  return commandFailure({ command, args, result, code, message });
}
function formatStackBranchMetadataProgress(branchCount) {
  return `inspecting Graphite submit branch metadata for ${formatItemCount(branchCount, "branch", "branches")}`;
}
function formatMetadataPreparationDiscoveryProgress(totalBranchCount, newBranchCount) {
  return `found ${formatItemCount(totalBranchCount, "submit branch", "submit branches")}; ${formatItemCount(newBranchCount, "new single-commit branch", "new single-commit branches")} ${newBranchCount === 1 ? "needs" : "need"} initial PR metadata`;
}
function formatPreparedMetadataProgress(branchCount) {
  return `prepared pre-submit PR metadata for ${formatItemCount(branchCount, "branch", "branches")}`;
}
function parseExistingPrFromBranchInfo(output, branch) {
  const link = extractPrLinks(output)[0];
  if (link !== undefined)
    return resultOk(link);
  if (/^\s*PR\s+#\d+\b/im.test(stripTerminalEscapes(output))) {
    return resultErr({
      code: "submit_existing_pr_link_missing",
      message: `Graphite reported an existing PR for ${branch}, but no PR URL was detected.`
    });
  }
  return resultOk(undefined);
}
function parseGtLogStack(output) {
  const branches = [];
  let currentBranch;
  for (const line of stripTerminalEscapes(output).replace(/\r/g, `
`).split(`
`)) {
    const match = line.match(/^[│\s]*[◉◯]\s+([^\s(]+)(?:\s+\(current\))?/);
    const branch = match?.[1];
    if (branch === undefined)
      continue;
    branches.push(branch);
    if (/\(current\)/.test(line)) {
      currentBranch = branch;
    }
  }
  return currentBranch === undefined ? { branches } : { branches, currentBranch };
}
function parseParentBranch(output) {
  const match = stripTerminalEscapes(output).replace(/\r/g, `
`).match(/^Parent:\s*(\S+)\s*$/m);
  return match?.[1];
}
function parseCommitMessages(output) {
  return output.split("\x00").map((message) => message.trim()).filter((message) => message !== "").map((message) => {
    const lines = message.split(`
`);
    const headline = lines[0]?.trim() ?? "";
    const body = lines.slice(1).join(`
`).trim();
    return {
      headline,
      ...body === "" ? {} : { body }
    };
  }).filter((message) => message.headline !== "");
}

// ts/packages/sdl-core/src/submit/pr-description-apply.ts
async function decidePrBodyOverwrite(params) {
  const patchId = await params.githubPr.stablePatchIdForPr({
    cwd: params.cwd,
    number: params.pr.number,
    ...params.pr.baseRefName === undefined ? {} : { baseRefName: params.pr.baseRefName },
    ...params.pr.headRefName === undefined ? {} : { headRefName: params.pr.headRefName }
  });
  if (!patchId.ok) {
    return { kind: "failed", error: patchId.error.message };
  }
  const metadata = {
    version: "2",
    patchId: patchId.value.patchId,
    promptHash: hashPrDescriptionPrompt(params.generation.promptText),
    generator: PR_DESCRIPTION_GENERATOR_VERSION
  };
  const parsedRegion = parseManagedGeneratedRegion(params.pr.body);
  if (params.shouldForce !== true && parsedRegion.type === "found" && fingerprintsMatch(parsedRegion.metadata, metadata)) {
    return { kind: "skip", patchId: patchId.value.patchId };
  }
  const commits = await params.githubPr.getPrCommitMessages({
    cwd: params.cwd,
    number: params.pr.number
  });
  if (!commits.ok) {
    return { kind: "failed", error: commits.error.message };
  }
  return { kind: "generate", commits: commits.value, diff: patchId.value.diff, metadata };
}
async function generatePrDescriptionForPr(pr, commits, options) {
  const generation = options.generation ?? await resolvePrDescriptionGeneration(options);
  if (!generation.ok) {
    return generation;
  }
  const diff = options.diff ?? await readPrDiff({ pr, options });
  if (typeof diff !== "string")
    return diff;
  const prepared = await preparePrDescription({
    textGenerator: options.textGenerator,
    modelRef: generation.modelRef,
    promptText: generation.promptText,
    context: {
      kind: "github",
      number: pr.number,
      url: pr.url,
      title: pr.title,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      commitMessages: commits,
      diff
    },
    ...options.onProgress === undefined ? {} : { onProgress: options.onProgress }
  });
  if (!prepared.ok) {
    return { ok: false, error: prepared.error };
  }
  return {
    ok: true,
    title: prepared.title,
    body: prepared.body,
    promptSource: generation.promptSource
  };
}
async function applyGeneratedDescription(params) {
  const prepared = await generatePrDescriptionForPr(params.pr, params.commits, {
    ...params.options,
    ...params.diff === undefined ? {} : { diff: params.diff }
  });
  if (!prepared.ok)
    return prepared;
  params.options.onProgress?.(`updating PR #${params.pr.number} description`);
  const edited = await params.options.githubPr.editPr({
    cwd: params.options.cwd,
    number: params.pr.number,
    title: prepared.title,
    body: replaceOrInsertGeneratedRegion(params.pr.body, prepared.body, params.metadata)
  });
  if (!edited.ok) {
    return {
      ok: false,
      error: `Generated a PR description, but failed to update PR #${params.pr.number}.
${edited.error.message}`
    };
  }
  return { ok: true, title: prepared.title, promptSource: prepared.promptSource };
}
async function readPrDiff(params) {
  params.options.onProgress?.(`reading PR #${params.pr.number} diff`);
  const diff = await params.options.githubPr.getPrDiff({
    cwd: params.options.cwd,
    number: params.pr.number,
    ...params.pr.baseRefName === undefined ? {} : { baseRefName: params.pr.baseRefName },
    ...params.pr.headRefName === undefined ? {} : { headRefName: params.pr.headRefName }
  });
  if (!diff.ok) {
    return { ok: false, error: diff.error.message };
  }
  return diff.value;
}
function fingerprintsMatch(left, right) {
  return left.version === right.version && left.patchId === right.patchId && left.promptHash === right.promptHash && left.generator === right.generator;
}

// ts/packages/sdl-core/src/submit/submit-pr-descriptions.ts
async function generateSubmitPrDescriptions(input) {
  const generated = [];
  const skipped = [];
  const prewritten = [];
  const prewriteFallbacks = [];
  const failures = [];
  const prewrittenByBranch = new Map((input.prewrittenMetadata ?? []).map((metadata) => [metadata.branch, metadata]));
  let generation;
  if (input.prLinks.length === 0) {
    input.onProgress?.("no PR links available for description generation");
  } else {
    input.onProgress?.(`preparing descriptions for ${formatItemCount(input.prLinks.length, "PR", "PRs")}`);
  }
  for (const [index, link] of input.prLinks.entries()) {
    const number = prNumberFromLink(link);
    if (number === undefined)
      continue;
    input.onProgress?.(`loading PR #${number} metadata (${index + 1}/${input.prLinks.length})`);
    const viewed = await input.prDescription.githubPr.viewPr({ cwd: input.cwd, number });
    if (!viewed.ok) {
      failures.push({ link, number, reason: viewed.error.message });
      continue;
    }
    const prewrittenMetadata = prewrittenByBranch.get(viewed.value.headRefName);
    if (prewrittenMetadata !== undefined) {
      input.onProgress?.(`validating prewritten metadata for PR #${number}`);
      const reconciled = await reconcilePrewrittenPr({
        cwd: input.cwd,
        githubPr: input.prDescription.githubPr,
        link,
        number,
        title: viewed.value.title,
        body: viewed.value.body,
        prewrittenMetadata,
        ...input.onProgress === undefined ? {} : { onProgress: input.onProgress }
      });
      if (reconciled.kind === "matched") {
        prewritten.push(link);
      } else if (reconciled.kind === "updated") {
        prewriteFallbacks.push(link);
      } else {
        failures.push(reconciled.failure);
      }
      continue;
    }
    if (generation === undefined) {
      input.onProgress?.("resolving PR description prompt and model");
    }
    const resolvedGeneration = generation ?? await resolvePrDescriptionGeneration({
      cwd: input.cwd,
      env: input.prDescription.env,
      git: input.prDescription.git
    });
    if (!resolvedGeneration.ok) {
      failures.push({ link, number, reason: resolvedGeneration.error });
      continue;
    }
    generation = resolvedGeneration;
    input.onProgress?.(`checking PR #${number} description fingerprint`);
    const decision = await decidePrBodyOverwrite({
      pr: viewed.value,
      cwd: input.cwd,
      githubPr: input.prDescription.githubPr,
      generation
    });
    if (decision.kind === "failed") {
      failures.push({ link, number, reason: decision.error });
      continue;
    }
    if (decision.kind === "skip") {
      input.onProgress?.(`skipping PR #${number} description; generated fingerprint is unchanged`);
      skipped.push(link);
      continue;
    }
    const applied = await applyGeneratedDescription({
      pr: viewed.value,
      commits: decision.commits,
      diff: decision.diff,
      metadata: decision.metadata,
      options: {
        cwd: input.cwd,
        env: input.prDescription.env,
        githubPr: input.prDescription.githubPr,
        textGenerator: input.prDescription.textGenerator,
        git: input.prDescription.git,
        generation,
        ...input.onProgress === undefined ? {} : { onProgress: input.onProgress }
      }
    });
    if (applied.ok) {
      input.onProgress?.(`finished PR #${number} description`);
      generated.push(link);
    } else {
      failures.push({ link, number, reason: applied.error });
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, generated, skipped, prewritten, prewriteFallbacks };
}
function formatPrDescriptionFailureText(prLinks, failures) {
  const lines = [
    "PRs were submitted; description generation failed.",
    "",
    "Submitted PRs:",
    ...prLinks.length > 0 ? prLinks.map(formatPrLinkTextRow) : ["• (no PR URLs detected in submit output)"],
    "",
    "Description failures:",
    ...failures.map(formatPrDescriptionFailureRow),
    "",
    "Checkout the branch and run `sdl regenerate-pr` to regenerate its PR description."
  ];
  return lines.join(`
`);
}
async function reconcilePrewrittenPr(input) {
  if (prMetadataMatches(input.title, input.body, input.prewrittenMetadata)) {
    return { kind: "matched" };
  }
  input.onProgress?.(`updating PR #${input.number} with prewritten metadata`);
  const edited = await input.githubPr.editPr({
    cwd: input.cwd,
    number: input.number,
    title: input.prewrittenMetadata.title,
    body: appendGeneratedMarker(input.prewrittenMetadata.body)
  });
  if (edited.ok)
    return { kind: "updated" };
  return {
    kind: "failed",
    failure: {
      link: input.link,
      number: input.number,
      reason: `Generated initial metadata, but failed to update PR #${input.number} after Graphite created mismatched metadata.
${edited.error.message}`
    }
  };
}
function prMetadataMatches(title, body, metadata) {
  return title.trim() === metadata.title.trim() && body.trim() === metadata.body.trim();
}
function formatPrDescriptionFailureRow(failure) {
  return `${formatPrLinkTextRow(failure.link)}: ${failure.reason}`;
}

// ts/packages/sdl-core/src/submit/submit.ts
var SUBMIT_ARGS = [
  "submit",
  "--no-edit",
  "--publish",
  "--no-stack",
  "--no-ai",
  "--no-interactive",
  "--no-view",
  "--no-web"
];
var SUBMIT_DRY_RUN_ARGS = [
  "submit",
  "--no-edit",
  "--publish",
  "--no-stack",
  "--no-ai",
  "--no-interactive",
  "--no-view",
  "--no-web",
  "--dry-run"
];
var RESTACK_ARGS = ["restack", "--downstack", "--no-interactive"];
var CURRENT_PR_ARGS = ["branch", "info", "--no-interactive"];
var SUBMIT_COMMAND_DISPLAY = "gt submit --no-edit --publish --no-stack --no-ai --no-interactive";
var SUBMIT_DRY_RUN_COMMAND_DISPLAY = "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --dry-run";
var RESTACK_COMMAND_DISPLAY = "gt restack --downstack --no-interactive";
var CURRENT_PR_COMMAND_DISPLAY = "gt branch info --no-interactive";
var GIT_UNMERGED_ARGS = ["diff", "--name-only", "--diff-filter=U"];
var GIT_STATUS_PORCELAIN_ARGS2 = ["status", "--porcelain"];
var SUBMIT_TIMEOUT_MS = 600000;
var RESTACK_TIMEOUT_MS2 = 600000;
var CURRENT_PR_TIMEOUT_MS2 = 60000;
var GIT_CHECK_TIMEOUT_MS = 30000;

class RealSubmitGateway {
  runner;
  constructor(runner = runCommand) {
    this.runner = runner;
  }
  async checkSubmitReadiness(params) {
    const output = await this.runGt({
      args: SUBMIT_DRY_RUN_ARGS,
      cwd: params.cwd,
      timeoutMs: CURRENT_PR_TIMEOUT_MS2,
      ...params.onOutput === undefined ? {} : { onOutput: params.onOutput }
    });
    if (isSuccessfulOutput(output)) {
      return { kind: "ready", output };
    }
    if (!output.startupError && !output.killed && detectRestackNeeded(joinOutput(output))) {
      return { kind: "restack_required", output };
    }
    if (!output.startupError && !output.killed && detectTrunkOutOfDate(joinOutput(output))) {
      return { kind: "failed", output, cause: "trunk_out_of_date" };
    }
    return { kind: "failed", output };
  }
  async restackCurrentStack(params) {
    const output = await this.runGt({
      args: RESTACK_ARGS,
      cwd: params.cwd,
      timeoutMs: RESTACK_TIMEOUT_MS2,
      ...params.onOutput === undefined ? {} : { onOutput: params.onOutput }
    });
    if (isSuccessfulOutput(output)) {
      return { kind: "success", output };
    }
    const conflictedFiles = await this.getConflictedFiles(params.cwd);
    if (detectRestackMergeConflict(joinOutput(output), conflictedFiles)) {
      return { kind: "conflict", output, conflictedFiles };
    }
    return { kind: "failed", output };
  }
  async submitCurrentStack(params) {
    const output = await this.runGt({
      args: SUBMIT_ARGS,
      cwd: params.cwd,
      timeoutMs: SUBMIT_TIMEOUT_MS,
      ...params.onOutput === undefined ? {} : { onOutput: params.onOutput }
    });
    if (!isSuccessfulOutput(output)) {
      return { kind: "failed", output };
    }
    const semanticFailureCause = detectSubmitSemanticFailureCause(joinOutput(output));
    const result = {
      kind: "success",
      output,
      prLinks: extractPrLinks(joinOutput(output))
    };
    if (semanticFailureCause !== undefined) {
      result.semanticFailureCause = semanticFailureCause;
    }
    return result;
  }
  async verifyCurrentPr(params) {
    const output = await this.runGt({
      args: CURRENT_PR_ARGS,
      cwd: params.cwd,
      timeoutMs: CURRENT_PR_TIMEOUT_MS2,
      ...params.onOutput === undefined ? {} : { onOutput: params.onOutput }
    });
    if (output.startupError !== undefined) {
      return { kind: "failed", output, cause: "startup_error" };
    }
    if (output.killed === true) {
      return { kind: "failed", output, cause: "timeout" };
    }
    if (output.exitCode !== 0) {
      if (/No PR found/i.test(stripTerminalEscapes(joinOutput(output)))) {
        return { kind: "no_current_pr", output, cause: "no_current_pr" };
      }
      return { kind: "failed", output, cause: "command_failed" };
    }
    const prLinks = extractPrLinks(joinOutput(output));
    if (prLinks.length === 0) {
      return { kind: "no_current_pr", output, cause: "no_current_pr" };
    }
    return { kind: "present", output, prLinks };
  }
  async getConflictedFiles(cwd) {
    const unmerged = await this.runGit([...GIT_UNMERGED_ARGS], cwd, GIT_CHECK_TIMEOUT_MS);
    const status = await this.runGit([...GIT_STATUS_PORCELAIN_ARGS2], cwd, GIT_CHECK_TIMEOUT_MS);
    return uniqueNonEmpty([
      ...parseConflictedFiles(unmerged.stdout),
      ...parsePorcelainConflictedFiles(status.stdout)
    ]);
  }
  async runGt(options) {
    const { args, cwd, timeoutMs, onOutput } = options;
    return toSubmitCommandOutput(await this.runner("gt", args, {
      cwd,
      timeout: timeoutMs,
      ...onOutput === undefined ? {} : {
        onStdout: (text) => onOutput("stdout", text),
        onStderr: (text) => onOutput("stderr", text)
      }
    }));
  }
  async runGit(args, cwd, timeoutMs) {
    return toSubmitCommandOutput(await this.runner("git", args, { cwd, timeout: timeoutMs }));
  }
}
async function runSubmitCommand(options) {
  const commandParams = submitCommandParams(options);
  emitSubmitProgress(options, "checking Graphite submit readiness");
  const readiness = await options.gateway.checkSubmitReadiness(commandParams);
  if (readiness.kind === "failed") {
    if (readiness.cause === "trunk_out_of_date") {
      const stderr = formatTrunkOutOfDatePreflightOutput(readiness.output);
      return failure(normalizedFailureExitCode(readiness.output), stderr, {
        failurePresentation: "deterministic",
        rawFailureTranscript: commandFailureTranscript("preflight", SUBMIT_DRY_RUN_COMMAND_DISPLAY, readiness.output, stderr)
      });
    }
    return failure(normalizedFailureExitCode(readiness.output), formatPreflightFailureOutput(readiness.output), {
      failurePresentation: "unknown",
      rawFailureTranscript: commandFailureTranscript("preflight", SUBMIT_DRY_RUN_COMMAND_DISPLAY, readiness.output)
    });
  }
  if (readiness.kind === "restack_required") {
    emitSubmitProgress(options, "Graphite requires a restack before submit");
    const restackDecision = await shouldRunRestack(options, readiness.output);
    if (restackDecision === "unavailable") {
      return failure(1, formatRestackRequiredOutput(readiness.output), {
        failurePresentation: "deterministic"
      });
    }
    if (restackDecision === "declined") {
      return failure(1, formatRestackDeclinedOutput(readiness.output), {
        failurePresentation: "deterministic"
      });
    }
    const restackFailure = await runRestackBeforeSubmit(options, commandParams);
    if (restackFailure !== undefined) {
      return restackFailure;
    }
    const rechecked = await options.gateway.checkSubmitReadiness(commandParams);
    if (rechecked.kind !== "ready") {
      const stderr = formatReadinessRecheckFailureOutput(rechecked.output);
      return failure(normalizedFailureExitCode(rechecked.output), stderr, {
        failurePresentation: "deterministic",
        rawFailureTranscript: commandFailureTranscript("readiness recheck", SUBMIT_DRY_RUN_COMMAND_DISPLAY, rechecked.output, stderr)
      });
    }
  }
  emitSubmitProgress(options, "preparing PR metadata before submit");
  const prewrite = await prepareSubmitPrMetadata({
    cwd: options.cwd,
    env: options.prDescription.env,
    gateway: options.metadataGateway,
    git: options.prDescription.git,
    textGenerator: options.prDescription.textGenerator,
    onProgress: (message) => emitSubmitProgress(options, message)
  });
  if (prewrite.kind === "failed") {
    const stderr = formatPrewriteFailureOutput(prewrite.error, prewrite.amendedBranches);
    return failure(prewrite.exitCode ?? 1, stderr, {
      failurePresentation: "unknown",
      rawFailureTranscript: textFailureTranscript("pre-submit metadata", stderr)
    });
  }
  emitSubmitProgress(options, "running gt submit");
  const submitted = await options.gateway.submitCurrentStack(commandParams);
  if (submitted.kind === "failed") {
    return failure(normalizedFailureExitCode(submitted.output), formatSubmitFailureOutput(submitted.output, prewrite.prepared), {
      failurePresentation: "unknown",
      rawFailureTranscript: commandFailureTranscript("submit", SUBMIT_COMMAND_DISPLAY, submitted.output)
    });
  }
  emitSubmitProgress(options, "verifying submitted PRs");
  const currentPr = await options.gateway.verifyCurrentPr(commandParams);
  if (submitted.semanticFailureCause !== undefined || shouldFailPostSubmitVerification(submitted, currentPr)) {
    const stderr = formatPostSubmitFailureOutput({
      submitted,
      currentPr
    });
    return failure(1, stderr, {
      failurePresentation: isDeterministicPostSubmitFailure(submitted, currentPr) ? "deterministic" : "unknown",
      rawFailureTranscript: postSubmitFailureTranscript(stderr, submitted, currentPr)
    });
  }
  const prLinks = currentPr.kind === "present" ? mergePrLinks(submitted.prLinks, currentPr.prLinks) : mergePrLinks(submitted.prLinks, []);
  emitSubmitProgress(options, "generating or validating PR descriptions");
  const descriptionResult = await generateSubmitPrDescriptions({
    cwd: options.cwd,
    prDescription: options.prDescription,
    prLinks,
    prewrittenMetadata: prewrite.prepared,
    onProgress: (message) => emitSubmitProgress(options, message)
  });
  if (!descriptionResult.ok) {
    const stderr = formatPrDescriptionFailureText(prLinks, descriptionResult.failures);
    return failure(1, stderr, {
      failurePresentation: "deterministic",
      rawFailureTranscript: textFailureTranscript("PR description", stderr)
    });
  }
  const successText = prLinks.length > 0 ? formatSubmitSuccessText(prLinks, {
    generated: descriptionResult.generated,
    skipped: descriptionResult.skipped,
    prewritten: descriptionResult.prewritten,
    prewriteFallbacks: descriptionResult.prewriteFallbacks
  }) : formatSubmitSuccessFallbackText(submitted.output.stdout, submitted.output.stderr);
  return success(successText);
}
async function shouldRunRestack(options, output) {
  if (options.restack)
    return "run";
  if (options.confirmRestack === undefined)
    return "unavailable";
  const confirmed = await options.confirmRestack(formatRestackConfirmationPrompt(output));
  return confirmed ? "run" : "declined";
}
async function runRestackBeforeSubmit(options, commandParams) {
  emitSubmitProgress(options, "running gt restack");
  const restack = await options.gateway.restackCurrentStack(commandParams);
  if (restack.kind === "conflict") {
    const stderr = formatRestackConflictOutput(restack.output, restack.conflictedFiles);
    return failure(1, stderr, {
      failurePresentation: "deterministic",
      rawFailureTranscript: commandFailureTranscript("restack", RESTACK_COMMAND_DISPLAY, restack.output, stderr)
    });
  }
  if (restack.kind === "failed") {
    return failure(normalizedFailureExitCode(restack.output), formatRestackFailureOutput(restack.output), {
      failurePresentation: "unknown",
      rawFailureTranscript: commandFailureTranscript("restack", RESTACK_COMMAND_DISPLAY, restack.output)
    });
  }
  return;
}
function submitCommandParams(options) {
  return {
    cwd: options.cwd,
    ...options.shouldForwardCommandOutput === false || options.onOutput === undefined ? {} : { onOutput: options.onOutput }
  };
}
function emitSubmitProgress(options, message) {
  options.onOutput?.("stderr", formatSubmitProgressLine(message));
}
function formatSubmitProgressLine(message) {
  const normalized = message.replace(/\.\.\.$/, "…");
  const line = formatSubmitProgressMessage(normalized);
  return `${line}
`;
}
function formatSubmitProgressMessage(message) {
  switch (message) {
    case "checking Graphite submit readiness":
      return "• Preflight: checking Graphite submit readiness…";
    case "Graphite requires a restack before submit":
      return "• Preflight: Graphite requires a restack before submit";
    case "running gt restack":
      return "• Preflight: running gt restack…";
    case "preparing PR metadata before submit":
      return "• Metadata: preparing PR metadata before submit…";
    case "running gt submit":
      return "• Submit: running gt submit…";
    case "verifying submitted PRs":
      return "• Verification: checking submitted PR…";
    case "generating or validating PR descriptions":
      return "• Descriptions: generating or validating PR descriptions…";
    default:
      return `  … ${message}`;
  }
}
function shouldFailPostSubmitVerification(submitted, currentPr) {
  if (currentPr.kind === "present")
    return false;
  if (currentPr.kind === "no_current_pr" && submitted.prLinks.length > 0)
    return false;
  return true;
}
function isDeterministicPostSubmitFailure(submitted, currentPr) {
  return submitted.semanticFailureCause === undefined && currentPr.kind === "no_current_pr";
}
function toSubmitCommandOutput(result) {
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.code,
    ...result.startupError === undefined ? {} : { startupError: result.startupError },
    ...result.killed ? { killed: true } : {}
  };
}
function isSuccessfulOutput(output) {
  return output.exitCode === 0 && !output.killed && output.startupError === undefined;
}
function normalizedFailureExitCode(output) {
  if (output.startupError !== undefined)
    return 2;
  if (output.killed === true)
    return 124;
  return output.exitCode === 0 ? 1 : output.exitCode;
}
function success(stdout) {
  return {
    exitCode: 0,
    stdout: stdout.endsWith(`
`) ? stdout : `${stdout}
`,
    stderr: ""
  };
}
function failure(exitCode, stderr, options) {
  return {
    exitCode,
    stdout: "",
    stderr: stderr.endsWith(`
`) ? stderr : `${stderr}
`,
    ...options?.failurePresentation === undefined ? {} : { failurePresentation: options.failurePresentation },
    ...options?.rawFailureTranscript === undefined ? {} : { rawFailureTranscript: options.rawFailureTranscript }
  };
}
function commandFailureTranscript(phase, commandDisplay, output, summary) {
  return {
    phase,
    ...summary === undefined || summary.trim() === "" ? {} : { summary: summary.trimEnd() },
    commands: [
      {
        commandDisplay,
        stdout: output.stdout,
        stderr: output.stderr,
        exitCode: normalizedFailureExitCode(output),
        ...output.startupError === undefined ? {} : { startupError: output.startupError },
        ...output.killed === true ? { killed: true } : {}
      }
    ]
  };
}
function textFailureTranscript(phase, summary) {
  return { phase, summary, commands: [] };
}
function postSubmitFailureTranscript(summary, submitted, currentPr) {
  return {
    phase: "post-submit verification",
    summary,
    commands: [
      {
        commandDisplay: SUBMIT_COMMAND_DISPLAY,
        stdout: submitted.output.stdout,
        stderr: submitted.output.stderr,
        exitCode: submitted.output.exitCode,
        ...submitted.output.startupError === undefined ? {} : { startupError: submitted.output.startupError },
        ...submitted.output.killed === true ? { killed: true } : {}
      },
      {
        commandDisplay: CURRENT_PR_COMMAND_DISPLAY,
        stdout: currentPr.output.stdout,
        stderr: currentPr.output.stderr,
        exitCode: currentPr.output.exitCode,
        ...currentPr.output.startupError === undefined ? {} : { startupError: currentPr.output.startupError },
        ...currentPr.output.killed === true ? { killed: true } : {}
      }
    ]
  };
}
function joinOutput(output) {
  return `${output.stdout}
${output.stderr}`;
}
function mergePrLinks(first, second) {
  const links = [];
  const seenKeys = new Set;
  for (const link of [...first, ...second]) {
    const key = prLinkIdentityKey(link);
    if (seenKeys.has(key))
      continue;
    seenKeys.add(key);
    links.push({ ...link });
  }
  return links;
}
function prLinkIdentityKey(link) {
  const number = prNumberFromLink(link);
  return number === undefined ? link.url : `pr:${number}`;
}
function detectRestackNeeded(output) {
  const strippedOutput = stripTerminalEscapes(output).replace(/\r/g, `
`);
  const mentionsRestack = /\brestack(?:ed|ing)?\b/i.test(strippedOutput);
  const requiresRestackBeforeSubmit = /before submit(?:ting|sion)?/i.test(strippedOutput) || /need(?:s|ed)? to be restacked/i.test(strippedOutput) || /must be restacked/i.test(strippedOutput) || /requires? (?:a )?restack/i.test(strippedOutput) || /restack (?:is )?required/i.test(strippedOutput);
  return mentionsRestack && requiresRestackBeforeSubmit;
}
function detectTrunkOutOfDate(output) {
  return /trunk branch is out of date and could not be updated/i.test(stripTerminalEscapes(output));
}
function detectRestackMergeConflict(output, conflictedFiles) {
  const strippedOutput = stripTerminalEscapes(output);
  return conflictedFiles.length > 0 || /CONFLICT \(/i.test(strippedOutput) || /merge conflict/i.test(strippedOutput) || /fix conflicts/i.test(strippedOutput) || /resolve conflicts/i.test(strippedOutput);
}
function parseConflictedFiles(output) {
  return uniqueNonEmpty(stripTerminalEscapes(output).replace(/\r/g, `
`).split(`
`));
}
function parsePorcelainConflictedFiles(output) {
  const conflictStatuses = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
  const files = [];
  for (const line of stripTerminalEscapes(output).replace(/\r/g, `
`).split(`
`)) {
    if (line.length < 4)
      continue;
    const status = line.slice(0, 2);
    if (!conflictStatuses.has(status))
      continue;
    files.push(line.slice(3));
  }
  return uniqueNonEmpty(files);
}
function uniqueNonEmpty(values) {
  const seen = new Set;
  const unique = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed))
      continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}
function detectSubmitSemanticFailureCause(output) {
  const strippedOutput = stripTerminalEscapes(output).replace(/\r/g, `
`);
  const emptyBranchWarning = /This branch does not introduce any changes:/i.test(strippedOutput);
  const skippedSubmissionWarning = /will not be submitted/i.test(strippedOutput) || /GitHub does not allow empty PRs/i.test(strippedOutput);
  if (emptyBranchWarning && skippedSubmissionWarning) {
    return {
      kind: "empty_branch_skipped",
      branchName: parseSubmitValidationBranchName(strippedOutput)
    };
  }
  return;
}
function parseSubmitValidationBranchName(output) {
  const validationBlock = output.match(/Validating that this Graphite stack is ready to submit\.\.\.(?<block>[\s\S]*?)(?:\n\s*📝|\n\s*WARNING:|$)/u)?.groups?.block;
  if (validationBlock === undefined)
    return;
  for (const line of validationBlock.split(`
`)) {
    const match = line.match(/^\s*▸\s*(?<branch>\S+)\s*$/u);
    const branch = match?.groups?.branch;
    if (branch !== undefined)
      return branch;
  }
  return;
}
// ts/packages/sdl-core/src/github-cli.ts
var GITHUB_CLI_TIMEOUT_MS = 30000;
var GITHUB_CLI_STARTUP_ERROR_CODE = 127;
async function runGitHubCli(options) {
  const args = [...options.args];
  const command = ["gh", ...args];
  const displayCommand = formatCommand("gh", args);
  try {
    const result = await options.runner("gh", args, githubCliExecOptions(options));
    return { type: "completed", command, displayCommand, result };
  } catch (caught) {
    return {
      type: "startup_error",
      command,
      displayCommand,
      message: formatErrorMessage(caught)
    };
  }
}
async function runGitHubCliAsExecResult(options) {
  const result = await runGitHubCli(options);
  if (result.type === "completed")
    return result.result;
  return { stdout: "", stderr: result.message, code: GITHUB_CLI_STARTUP_ERROR_CODE, killed: false };
}
function githubCliExecOptions(options) {
  return {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? GITHUB_CLI_TIMEOUT_MS,
    ...options.env === undefined ? {} : { env: options.env },
    ...options.signal === undefined ? {} : { signal: options.signal }
  };
}

// ts/packages/sdl-core/src/temp-files.ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";
async function withTemporaryFile(options, callback) {
  const directory = await mkdtemp(join2(tmpdir(), options.prefix));
  try {
    const path = join2(directory, options.filename);
    await writeFile(path, options.contents, "utf8");
    return await callback(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// ts/packages/sdl-core/src/submit/github-pr-gateway.ts
var PR_VIEW_FIELDS = "number,url,title,body,headRefName,baseRefName";
var VIEW_TIMEOUT_MS = GITHUB_CLI_TIMEOUT_MS;
var DIFF_TIMEOUT_MS = 60000;
var PATCH_ID_TIMEOUT_MS = 60000;
var EDIT_TIMEOUT_MS = 60000;

class RealGithubPrGateway {
  runner;
  constructor(runner = runCommand) {
    this.runner = runner;
  }
  async viewCurrentBranchPr(params) {
    return this.viewPrWithArgs({ cwd: params.cwd, args: ["pr", "view", "--json", PR_VIEW_FIELDS] });
  }
  async viewPr(params) {
    return this.viewPrWithArgs({
      cwd: params.cwd,
      args: ["pr", "view", String(params.number), "--json", PR_VIEW_FIELDS]
    });
  }
  async getPrCommitMessages(params) {
    const args = ["pr", "view", String(params.number), "--json", "commits"];
    const result = await this.runGh(args, params.cwd, VIEW_TIMEOUT_MS);
    const failure2 = commandFailure({
      command: "gh",
      args,
      result,
      code: "github_pr_commits_failed",
      message: `Could not read commit messages for PR #${params.number}.`
    });
    if (failure2 !== undefined)
      return resultErr(failure2);
    const parsed = parseJson(result.stdout);
    if (!isRecord(parsed) || !Array.isArray(parsed.commits)) {
      return resultErr({
        code: "github_pr_commits_parse_failed",
        message: `GitHub commits output for PR #${params.number} had an unexpected shape.`
      });
    }
    const messages = [];
    for (const commit of parsed.commits) {
      if (!isRecord(commit) || typeof commit.messageHeadline !== "string")
        continue;
      const message = { headline: commit.messageHeadline };
      if (typeof commit.messageBody === "string" && commit.messageBody.trim() !== "") {
        message.body = commit.messageBody;
      }
      messages.push(message);
    }
    return resultOk(messages);
  }
  async getPrDiff(params) {
    const args = ["pr", "diff", String(params.number)];
    const result = await this.runGh(args, params.cwd, DIFF_TIMEOUT_MS);
    const failure2 = commandFailure({
      command: "gh",
      args,
      result,
      code: "github_pr_diff_failed",
      message: `Could not read diff for PR #${params.number}.`
    });
    if (failure2 === undefined)
      return resultOk(result.stdout);
    if (params.baseRefName !== undefined && params.headRefName !== undefined && isGithubDiffTooLarge(result)) {
      return await this.getLocalPrDiff({
        cwd: params.cwd,
        number: params.number,
        baseRefName: params.baseRefName,
        headRefName: params.headRefName
      });
    }
    return resultErr(failure2);
  }
  async stablePatchIdForPr(params) {
    const diff = await this.getPrDiff(params);
    if (!diff.ok)
      return diff;
    const args = ["patch-id", "--stable"];
    const result = await this.runGit({
      args,
      cwd: params.cwd,
      timeoutMs: PATCH_ID_TIMEOUT_MS,
      stdin: diff.value
    });
    const failure2 = commandFailure({
      command: "git",
      args,
      result,
      code: "git_patch_id_failed",
      message: `Could not compute stable patch id for PR #${params.number}.`
    });
    if (failure2 !== undefined)
      return resultErr(failure2);
    const patchId = result.stdout.trim().split(/\s+/, 1)[0] ?? "";
    if (patchId === "") {
      return resultErr({
        code: "git_patch_id_parse_failed",
        message: `Stable patch-id output for PR #${params.number} was empty or malformed.`
      });
    }
    return resultOk({ patchId, diff: diff.value });
  }
  async editPr(params) {
    return await withTemporaryFile({ prefix: "sdl-dev-pr-body-", filename: "body.md", contents: `${params.body}
` }, async (bodyPath) => {
      const args = [
        "pr",
        "edit",
        String(params.number),
        "--title",
        params.title,
        "--body-file",
        bodyPath
      ];
      const result = await this.runGh(args, params.cwd, EDIT_TIMEOUT_MS);
      const failure2 = commandFailure({
        command: "gh",
        args,
        result,
        code: "github_pr_edit_failed",
        message: `Could not update PR #${params.number}.`
      });
      if (failure2 !== undefined)
        return resultErr(failure2);
      return resultOk(undefined);
    });
  }
  async viewPrWithArgs(params) {
    const result = await this.runGh(params.args, params.cwd, VIEW_TIMEOUT_MS);
    const failure2 = commandFailure({
      command: "gh",
      args: params.args,
      result,
      code: "github_pr_view_failed",
      message: "Could not read GitHub PR details."
    });
    if (failure2 !== undefined)
      return resultErr(failure2);
    const parsed = parseGithubPrDetails(result.stdout);
    if (!parsed.ok)
      return resultErr(parsed.error);
    return resultOk(parsed.value);
  }
  async getLocalPrDiff(params) {
    const args = ["diff", `${params.baseRefName}...${params.headRefName}`];
    const result = await this.runGit({ args, cwd: params.cwd, timeoutMs: DIFF_TIMEOUT_MS });
    const failure2 = commandFailure({
      command: "git",
      args,
      result,
      code: "github_pr_local_diff_failed",
      message: `GitHub PR #${params.number} diff was too large for GitHub; could not read local diff for ${params.baseRefName}...${params.headRefName}.`
    });
    if (failure2 !== undefined)
      return resultErr(failure2);
    return resultOk(result.stdout);
  }
  async runGh(args, cwd, timeoutMs) {
    return await runGitHubCliAsExecResult({ runner: this.runner, args, cwd, timeoutMs });
  }
  async runGit(options) {
    return await this.runner("git", options.args, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      ...options.stdin === undefined ? {} : { stdin: options.stdin }
    });
  }
}
function isGithubDiffTooLarge(result) {
  const output = `${result.stderr}
${result.stdout}`;
  return result.code === 1 && /diff exceeded the maximum number of lines|PullRequest\.diff too_large|HTTP 406/i.test(output);
}
function parseGithubPrDetails(stdout) {
  const parsed = parseJson(stdout);
  if (!isRecord(parsed)) {
    return resultErr({
      code: "github_pr_view_parse_failed",
      message: "GitHub PR view output was not a JSON object."
    });
  }
  if (typeof parsed.number !== "number" || typeof parsed.url !== "string" || typeof parsed.title !== "string" || typeof parsed.headRefName !== "string" || typeof parsed.baseRefName !== "string") {
    return resultErr({
      code: "github_pr_view_parse_failed",
      message: "GitHub PR view output was missing required fields."
    });
  }
  return resultOk({
    number: parsed.number,
    url: parsed.url,
    title: parsed.title,
    body: typeof parsed.body === "string" ? parsed.body : "",
    headRefName: parsed.headRefName,
    baseRefName: parsed.baseRefName
  });
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return;
  }
}
// ts/packages/sdl/src/checkpoint-flow.ts
import { mkdtemp as mkdtemp2, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join3 } from "node:path";

// ts/packages/sdl/src/checkpoint-flow.ts
async function createCommitWithPreparedMessage(input) {
  const tempDir = await mkdtemp2(join3(tmpdir2(), "pi-cp-commit-"));
  try {
    const messagePath = join3(tempDir, "message.txt");
    await writeFile2(messagePath, `${input.message}
`, "utf8");
    const add = await input.exec("git", ["add", "-A"], input.cwd, 30000);
    if (add.code !== 0) {
      return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
    }
    const commit = await input.exec("git", ["commit", "-F", messagePath], input.cwd, 120000);
    if (commit.code !== 0) {
      return { error: formatCommandError("Checkpoint commit failed.", commit) };
    }
    const log = await input.exec("git", ["log", "-1", "--oneline"], input.cwd, 5000);
    if (log.code !== 0) {
      return {
        error: formatCommandError("Created checkpoint commit, but failed to read it back.", log)
      };
    }
    return { summary: log.stdout.trim() };
  } finally {
    await rm2(tempDir, { force: true, recursive: true });
  }
}
function formatCommandError(summary, result) {
  const details = result.stderr.trim() || result.stdout.trim();
  const killed = result.killed ? " (killed or timed out)" : "";
  return [
    summary,
    details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`
  ].filter(Boolean).join(`
`);
}

// ts/packages/sdl/src/pending-worktree.ts
var GIT_FACT_TIMEOUT_MS = 30000;
async function loadPendingWorktreeSnapshot(input) {
  const root = await input.execGit(["rev-parse", "--show-toplevel"], GIT_FACT_TIMEOUT_MS);
  if (root.code !== 0) {
    return {
      ok: false,
      error: { kind: "not_git_repo", message: "Not inside a git repository.", result: root }
    };
  }
  const branch = await input.execGit(["symbolic-ref", "--short", "HEAD"], GIT_FACT_TIMEOUT_MS);
  if (branch.code !== 0) {
    return {
      ok: false,
      error: { kind: "detached_head", message: "Detached HEAD.", result: branch }
    };
  }
  const status = await input.execGit(["status", "--porcelain=v1"], GIT_FACT_TIMEOUT_MS);
  if (status.code !== 0) {
    return {
      ok: false,
      error: { kind: "status_failed", message: "Could not read git status.", result: status }
    };
  }
  const diff = await input.execGit(["diff", "HEAD", "--no-ext-diff"], GIT_FACT_TIMEOUT_MS);
  if (diff.code !== 0) {
    return {
      ok: false,
      error: { kind: "diff_failed", message: "Could not read git diff.", result: diff }
    };
  }
  return {
    ok: true,
    snapshot: {
      root: root.stdout.trim(),
      branch: branch.stdout.trim(),
      status: status.stdout,
      diff: diff.stdout,
      clean: status.stdout.trim().length === 0
    }
  };
}
function formatPendingWorktreeCommandDetails(result) {
  const details = result.stderr.trim() || result.stdout.trim();
  const killed = result.killed ? " (killed or timed out)" : "";
  return details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`;
}

// ../../../../../../../../../../tmp/sdl-submit-extension-build/plans-shim.ts
var DEFAULT_FAST_MODEL_REF = "openai-codex/gpt-5.4-mini";

// ts/packages/sdl/src/text-generation.ts
var DEFAULT_CHECKPOINT_MODEL_REF = DEFAULT_FAST_MODEL_REF;
var CHECKPOINT_MODEL_ENV = "SDL_CHECKPOINT_MODEL";
var LEGACY_CHECKPOINT_MODEL_ENV = "SDL_DEV_CHECKPOINT_MODEL";
function selectCheckpointModelRef(env) {
  return firstEnvValue(env, CHECKPOINT_MODEL_ENV, LEGACY_CHECKPOINT_MODEL_ENV) ?? DEFAULT_CHECKPOINT_MODEL_REF;
}
function firstEnvValue(env, ...envNames) {
  for (const envName of envNames) {
    const value = env[envName]?.trim();
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return;
}

// ts/packages/sdl/src/checkpoint.ts
class RealCheckpointGateway {
  runner;
  constructor(runner = runCommand) {
    this.runner = runner;
  }
  async loadPendingWorktreeSnapshot(params) {
    return loadPendingWorktreeSnapshot({
      cwd: params.cwd,
      execGit: (args, timeout) => this.exec("git", args, params.cwd, timeout)
    });
  }
  async createCommitWithPreparedMessage(params) {
    return createCommitWithPreparedMessage({
      cwd: params.cwd,
      message: params.message,
      exec: (command, args, cwd, timeout) => this.exec(command, args, cwd, timeout)
    });
  }
  async exec(command, args, cwd, timeout) {
    const result = await this.runner(command, args, { cwd, timeout });
    return toCheckpointCommandResult(result);
  }
}
async function runCheckpointIfPending(options) {
  const loaded = await options.gateway.loadPendingWorktreeSnapshot({ cwd: options.cwd });
  if (!loaded.ok) {
    return { kind: "failed", output: failure2(2, formatCheckpointSnapshotError(loaded.error)) };
  }
  const snapshot = loaded.snapshot;
  if (snapshot.clean) {
    return { kind: "clean" };
  }
  if (snapshot.branch === "main" || snapshot.branch === "master") {
    return {
      kind: "failed",
      output: failure2(1, `Refusing to create checkpoint commit on trunk branch: ${snapshot.branch}`)
    };
  }
  const output = await createCheckpointFromSnapshot(options, snapshot, selectCheckpointModelRef(options.env));
  return output.exitCode === 0 ? { kind: "checkpointed", output } : { kind: "failed", output };
}
async function createCheckpointFromSnapshot(options, snapshot, modelRef) {
  const prepared = await prepareCheckpointMessage({
    status: snapshot.status,
    diff: snapshot.diff,
    textGenerator: options.textGenerator,
    modelRef
  });
  if (!prepared.ok) {
    return failure2(2, prepared.error);
  }
  const committed = await options.gateway.createCommitWithPreparedMessage({
    cwd: options.cwd,
    message: prepared.message
  });
  if ("error" in committed) {
    return failure2(2, committed.error);
  }
  return {
    exitCode: 0,
    stdout: `${committed.summary}
${prepared.message}
`,
    stderr: ""
  };
}
function formatCheckpointSnapshotError(error) {
  const details = formatPendingWorktreeCommandDetails(error.result);
  if (error.kind === "not_git_repo") {
    return `Not inside a git repository.
${details}`;
  }
  if (error.kind === "detached_head") {
    return `Could not determine current branch.
${details}`;
  }
  if (error.kind === "status_failed") {
    return `Could not inspect git status.
${details}`;
  }
  return `Could not capture git diff.
${details}`;
}
function toCheckpointCommandResult(result) {
  const converted = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr
  };
  if (result.killed) {
    converted.killed = true;
  }
  return converted;
}
function failure2(exitCode, error) {
  return {
    exitCode,
    stdout: "",
    stderr: error.endsWith(`
`) ? error : `${error}
`
  };
}

// ts/packages/sdl/src/default-commands/command-runner.ts
function createSdlCommandRunner(ctx) {
  return async (command, args, options) => {
    const cwdError = validateSdlExecCwd(ctx, options);
    if (cwdError !== undefined)
      return cwdError;
    return ctx.exec(command, [...args], convertExecOptions(options));
  };
}
function convertExecOptions(options) {
  if (options === undefined)
    return;
  return {
    ...options.timeout === undefined ? {} : { timeoutMs: options.timeout },
    ...options.stdin === undefined ? {} : { stdin: options.stdin },
    ...options.onStdout === undefined ? {} : { onStdout: options.onStdout },
    ...options.onStderr === undefined ? {} : { onStderr: options.onStderr }
  };
}
function validateSdlExecCwd(ctx, options) {
  if (options?.cwd === undefined || options.cwd === ctx.cwd)
    return;
  return {
    code: 2,
    stdout: "",
    stderr: `SDL command execution is scoped to ${ctx.cwd}; refusing command cwd ${options.cwd}.`,
    killed: false
  };
}

// ../../../../../../../../../../private/tmp/sdl-submit-extension-build/submit-entry.ts
var DEFAULT_FAST_MODEL_REF2 = "openai-codex/gpt-5.4-mini";
var SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS = 12000;
var SUBMIT_FAILURE_MODEL_ENV = "SDL_SUBMIT_FAILURE_MODEL";
var SUBMIT_FAILURE_LOG_DIR_ENV = "SDL_SUBMIT_FAILURE_LOG_DIR";
var submitSchema = z.object({
  restack: z.boolean().default(true).describe("Automatically run gt restack before submitting when Graphite requires it."),
  verbose: z.boolean().default(false).describe("Stream raw Graphite/subprocess output while submitting.")
});
var SUBMIT_COMMAND_DESCRIPTION = `Checkpoint outstanding changes, then submit the current Graphite branch and downstack ancestors with gt submit --no-edit --publish --no-stack --no-ai --no-interactive.

Environment:
  SDL_CHECKPOINT_MODEL           Model reference for generated checkpoint messages. Falls back to SDL_DEV_CHECKPOINT_MODEL.
  SDL_DEV_PR_DESCRIPTION_MODEL   Model reference for generated PR descriptions.
  SDL_DEV_PR_DESCRIPTION_PROMPT  Optional path to a custom PR description prompt.

  SDL_SUBMIT_FAILURE_MODEL       Model reference for summarizing submit failures.
  SDL_SUBMIT_FAILURE_LOG_DIR     Optional directory for raw submit-failure transcripts.

The command owns its output and exit code. It does not support --format.`;
var submit_entry_default = defineExtension({
  commands: [
    {
      name: "submit",
      summary: "Checkpoint pending changes, then submit the Graphite stack with gt submit.",
      description: SUBMIT_COMMAND_DESCRIPTION,
      schema: submitSchema,
      async run(ctx, request) {
        const runner = createSdlCommandRunner(ctx);
        const liveOutput = createSubmitLiveOutput(ctx);
        emitSubmitProgress2(liveOutput, "sdl submit");
        emitSubmitProgress2(liveOutput, "• Checking worktree and checkpointing pending changes if needed…");
        const checkpoint = await runCheckpointIfPending({
          cwd: ctx.cwd,
          env: ctx.env,
          gateway: new RealCheckpointGateway(runner),
          textGenerator: ctx.textGenerator
        });
        if (checkpoint.kind === "failed") {
          const checkpointFailure = await maybeFormatSubmitFailureWithModel({
            stdout: "",
            stderr: formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr),
            exitCode: checkpoint.output.exitCode
          }, ctx);
          ctx.stderr?.(checkpointFailure.stderr);
          return failed("", checkpoint.output.exitCode);
        }
        if (checkpoint.kind === "checkpointed") {
          writeCommandResultOutput(checkpoint.output, ctx);
        }
        emitSubmitProgress2(liveOutput, "✓ Checkpoint phase complete");
        const result = await runSubmitCommand({
          cwd: ctx.cwd,
          gateway: new RealSubmitGateway(runner),
          metadataGateway: new RealSubmitMetadataGateway(runner),
          restack: request.restack,
          shouldForwardCommandOutput: request.verbose,
          prDescription: {
            githubPr: new RealGithubPrGateway(runner),
            textGenerator: ctx.textGenerator,
            git: new LocalGitGateway(new SdlCommandExecApi(ctx)),
            env: ctx.env
          },
          ...liveOutput === undefined ? {} : { onOutput: liveOutput }
        });
        const interpretedResult = await maybeFormatSubmitFailureWithModel(result, ctx);
        writeCommandResultOutput(interpretedResult, ctx);
        return interpretedResult.exitCode === 0 ? ok("") : failed("", interpretedResult.exitCode);
      }
    }
  ]
});

class SdlCommandExecApi {
  runner;
  constructor(ctx) {
    this.runner = createSdlCommandRunner(ctx);
  }
  exec(command, args, options = {}) {
    return this.runner(command, args, options);
  }
}

class LocalGitGateway {
  execApi;
  constructor(execApi) {
    this.execApi = execApi;
  }
  async repoRoot(params) {
    const displayCommand = "git rev-parse --show-toplevel";
    const result = await this.execApi.exec("git", ["rev-parse", "--show-toplevel"], {
      cwd: params.cwd,
      timeout: 1e4
    });
    if (result.code !== 0 || result.killed) {
      return {
        ok: false,
        error: {
          code: "repo_root_failed",
          message: `git rev-parse --show-toplevel failed. Command: ${displayCommand}`,
          displayCommand
        }
      };
    }
    const root = result.stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0);
    if (root === undefined) {
      return {
        ok: false,
        error: {
          code: "repo_root_empty",
          message: `git rev-parse --show-toplevel returned no repo root. Command: ${displayCommand}`,
          displayCommand
        }
      };
    }
    return { ok: true, value: root };
  }
}
function createSubmitLiveOutput(ctx) {
  if (ctx.onOutput !== undefined)
    return ctx.onOutput;
  if (ctx.stdout === undefined && ctx.stderr === undefined)
    return;
  return (stream, text) => {
    if (stream === "stdout") {
      ctx.stdout?.(text);
      return;
    }
    ctx.stderr?.(text);
  };
}
function emitSubmitProgress2(liveOutput, message) {
  liveOutput?.("stderr", `${message}
`);
}
function writeCommandResultOutput(result, ctx) {
  if (result.stdout !== "") {
    ctx.stdout?.(result.stdout);
  }
  if (result.stderr !== "") {
    ctx.stderr?.(result.stderr);
  }
}
function formatCheckpointBeforeSubmitFailure(stderr) {
  const trimmed = stderr.trimEnd();
  const message = trimmed === "" ? "Checkpoint before submit failed. Submission was not attempted." : `Checkpoint before submit failed. Submission was not attempted.

${trimmed}`;
  return `${message}
`;
}
async function maybeFormatSubmitFailureWithModel(result, ctx) {
  if (result.exitCode === 0 || result.stderr.trim() === "")
    return result;
  const rawTranscript = renderRawFailureTranscript(result);
  const rawLog = await writeSubmitFailureRawLog(rawTranscript, ctx.env);
  const interpretation = await generateSubmitFailureInterpretation({
    rawTranscript,
    exitCode: result.exitCode,
    ctx
  });
  if (interpretation.ok && interpretation.text.trim() !== "") {
    return {
      ...result,
      stderr: formatModelPrimaryFailure({ text: interpretation.text, rawLog })
    };
  }
  return {
    ...result,
    stderr: formatOriginalFailureFallback({ stderr: result.stderr, rawLog })
  };
}
async function generateSubmitFailureInterpretation(input) {
  try {
    const interpretation = await input.ctx.textGenerator.generateText({
      modelRef: selectSubmitFailureModelRef(input.ctx.env),
      operation: "submit-failure",
      reasoning: "low",
      maxTokens: 700,
      system: "You write plain terminal-facing failure summaries for engineers. Be concise, specific, and action-oriented. Output only the final user-facing message. Do not invent facts not present in the transcript. Do not paste raw logs or raw-log paths; the wrapper appends the raw-log line separately.",
      prompt: buildSubmitFailureInterpretationPrompt({
        rawTranscript: input.rawTranscript,
        exitCode: input.exitCode
      })
    });
    if (!interpretation.ok)
      return { ok: false };
    return interpretation;
  } catch {
    return { ok: false };
  }
}
function selectSubmitFailureModelRef(env) {
  const value = env[SUBMIT_FAILURE_MODEL_ENV]?.trim();
  return value === undefined || value === "" ? DEFAULT_FAST_MODEL_REF2 : value;
}
function buildSubmitFailureInterpretationPrompt(input) {
  const bounded = boundSubmitFailureTranscript(input.rawTranscript);
  return [
    "Interpret this `sdl submit` failure for the user.",
    "Your output is the primary user-facing error message.",
    "Output only plain terminal text: no Markdown headings, no bold markers, and no fenced code blocks.",
    "The first line must be the diagnosis.",
    "Use short labeled sections where useful: Problem:, Branch:, What succeeded:, Next step:, Alternative:, Details:.",
    "Include only facts supported by the transcript.",
    "Prefer exact commands already present in the transcript.",
    "If the failure is ambiguous, say what to inspect instead of guessing.",
    "Do not paste raw logs.",
    "Do not include the raw-log path; the wrapper appends exactly one raw-log line after your text.",
    "Empty-branch rule: if the transcript says Graphite skipped submission because branch <name> is empty or because the current branch has no changes, make the first line close to: Current branch is empty; Graphite skipped it.",
    "For empty branches, repeat the exact branch name when known, mention non-empty branches may already have been submitted or updated when stdout says PRs were updated, make the primary next step remove/delete/reparent around the empty branch if it has no remaining work, and present adding real changes only as the alternative when the branch should still have its own PR.",
    "Do not present add/delete/reparent as equal choices for empty branches.",
    "",
    `Exit code: ${input.exitCode}`,
    `Transcript limit: ${SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS} characters`,
    bounded.truncated ? `Truncation: transcript was truncated from ${input.rawTranscript.length} to ${bounded.text.length} characters.` : "Truncation: transcript was not truncated.",
    "",
    "Bounded transcript:",
    bounded.text
  ].join(`
`);
}
function boundSubmitFailureTranscript(output) {
  if (output.length <= SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS) {
    return { text: output, truncated: false };
  }
  const omittedChars = output.length - SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS;
  return {
    text: `${output.slice(0, SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS)}
… ${omittedChars} trailing character(s) omitted`,
    truncated: true
  };
}
async function writeSubmitFailureRawLog(rawTranscript, env) {
  try {
    const baseDir = resolveSubmitFailureLogRoot(env);
    await ensurePrivateDirectory(baseDir);
    const dir = await mkdtemp3(join4(baseDir, "sdl-submit-failure-"));
    const path = join4(dir, "raw.log");
    await writeFile3(path, rawTranscript, "utf8");
    return { ok: true, path };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 448 });
  await chmod(path, 448).catch(() => {
    return;
  });
}
function resolveSubmitFailureLogRoot(env) {
  const override = env[SUBMIT_FAILURE_LOG_DIR_ENV]?.trim();
  if (override !== undefined && override !== "")
    return override;
  const stateHome = env.XDG_STATE_HOME?.trim();
  if (stateHome !== undefined && stateHome !== "")
    return join4(stateHome, "sdl", "submit-failure-logs");
  const home = env.HOME?.trim();
  if (home !== undefined && home !== "") {
    return join4(home, ".local", "state", "sdl", "submit-failure-logs");
  }
  return join4(process2.cwd(), ".sdl", "state", "submit-failure-logs");
}
function formatModelPrimaryFailure(input) {
  return appendRawLogLine(input.text.trim(), input.rawLog);
}
function formatOriginalFailureFallback(input) {
  return appendRawLogLine(input.stderr.trimEnd(), input.rawLog);
}
function appendRawLogLine(text, rawLog) {
  const rawLogLine = formatRawLogLine(rawLog);
  if (text.split(`
`).includes(rawLogLine))
    return `${text}
`;
  return `${text}

${rawLogLine}
`;
}
function formatRawLogLine(rawLog) {
  if (rawLog.ok)
    return `Raw log: ${rawLog.path}`;
  return `Raw log: unavailable (${rawLog.message})`;
}
function renderRawFailureTranscript(result) {
  const transcript = result.rawFailureTranscript;
  if (transcript === undefined) {
    return renderLegacyRawFailureTranscript(result);
  }
  const lines = [
    "sdl submit failure raw log",
    `phase: ${transcript.phase}`,
    `exit code: ${result.exitCode}`
  ];
  if (transcript.summary !== undefined && transcript.summary.trim() !== "") {
    lines.push("", "summary:", transcript.summary.trimEnd());
  }
  for (const [index, command] of transcript.commands.entries()) {
    lines.push("", `command ${index + 1}: ${command.commandDisplay ?? "unknown"}`, `exit code: ${command.exitCode}`);
    if (command.startupError !== undefined)
      lines.push(`startup error: ${command.startupError}`);
    if (command.killed === true)
      lines.push("killed: true");
    lines.push("", "----- stdout -----", command.stdout === "" ? "(empty)" : command.stdout.trimEnd(), "----- stderr -----", command.stderr === "" ? "(empty)" : command.stderr.trimEnd());
  }
  return `${lines.join(`
`)}
`;
}
function renderLegacyRawFailureTranscript(result) {
  return [
    "sdl submit failure raw log",
    "phase: unknown",
    `exit code: ${result.exitCode}`,
    "",
    "----- stdout -----",
    result.stdout === "" ? "(empty)" : result.stdout.trimEnd(),
    "----- stderr -----",
    result.stderr === "" ? "(empty)" : result.stderr.trimEnd(),
    ""
  ].join(`
`);
}
export {
  submit_entry_default as default
};

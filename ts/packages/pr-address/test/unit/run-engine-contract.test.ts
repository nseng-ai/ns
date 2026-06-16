import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { identifierTokens, sourceFilesUnder } from "../support/source-files.ts";
import {
	PR_ADDRESS_READ_ONLY_VERBS,
	PR_ADDRESS_TARGET_VERBS,
	type FeedbackDetailHandle,
	type PrAddressError,
	type PrAddressResult,
	type PrAddressRunEngine,
	type RunKernel,
} from "../../src/app/run-engine.ts";

const PACKAGE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const APP_SOURCE_ROOT = resolve(PACKAGE_ROOT, "src/app");

const BANNED_APP_CONTRACT_TERMS = [
	"payload_path",
	"payloadPath",
	"json_pointer",
	"jsonPointer",
	"artifact",
	"artifacts",
	"locator",
	"locators",
	"session",
	"sessions",
	"descriptor",
	"descriptors",
	"latest_artifact",
	"latestArtifact",
	"compact",
	"full_output",
	"fullOutput",
	"role",
] as const;

describe("pr-address run engine app contract", () => {
	test("names all target verbs while exposing the read-only callable subset", () => {
		expect(PR_ADDRESS_TARGET_VERBS).toEqual(["feedback", "details", "plan", "batch", "status", "reply"]);
		expect(PR_ADDRESS_READ_ONLY_VERBS).toEqual(["feedback", "details", "status"]);

		const engine = {
			feedback: async (request) => ({ type: "ok", value: { prNumber: request.prNumber, items: [] } }),
			details: async (request) => ({ type: "ok", value: { handle: request.handle, body: "body" } }),
			status: async (request) => ({ type: "ok", value: { prNumber: request.prNumber, unresolvedThreadIds: [] } }),
		} satisfies PrAddressRunEngine;

		expect(Object.keys(engine).sort()).toEqual(["details", "feedback", "status"]);
	});

	test("uses structured GitHub-domain detail handles", () => {
		const reviewHandle = { type: "review", prNumber: 42, reviewId: "PRR_kwDO" } satisfies FeedbackDetailHandle;
		const threadCommentHandle = { type: "thread_comment", prNumber: 42, threadId: "PRRT_kwDO", commentId: 1001 } satisfies FeedbackDetailHandle;
		const discussionCommentHandle = { type: "discussion_comment", prNumber: 42, commentId: 1002 } satisfies FeedbackDetailHandle;

		expect(reviewHandle).toMatchObject({ type: "review", prNumber: 42, reviewId: "PRR_kwDO" });
		expect(threadCommentHandle).toMatchObject({ type: "thread_comment", prNumber: 42, threadId: "PRRT_kwDO", commentId: 1001 });
		expect(discussionCommentHandle).toMatchObject({ type: "discussion_comment", prNumber: 42, commentId: 1002 });
	});

	test("models expected failures as explicit result values", () => {
		const staleHandleError = { type: "stale_handle", message: "The referenced GitHub item changed." } satisfies PrAddressError;
		const result = { type: "error", error: staleHandleError } satisfies PrAddressResult<never>;

		expect(result).toEqual({ type: "error", error: { type: "stale_handle", message: "The referenced GitHub item changed." } });
	});

	test("keeps the kernel as the injected read-only capability boundary", () => {
		const kernel = {
			fetchFeedback: async (request) => ({ type: "ok", value: { prNumber: request.prNumber, items: [] } }),
			fetchDetails: async (request) => ({ type: "ok", value: { handle: request.handle, body: "body" } }),
			fetchStatus: async (request) => ({ type: "ok", value: { prNumber: request.prNumber, unresolvedThreadIds: ["PRRT_kwDO"] } }),
		} satisfies RunKernel;

		expect(Object.keys(kernel).sort()).toEqual(["fetchDetails", "fetchFeedback", "fetchStatus"]);
	});

	test("keeps old storage vocabulary out of app contract identifiers", async () => {
		const violations: string[] = [];

		for (const sourceFile of await sourceFilesUnder(APP_SOURCE_ROOT)) {
			const source = await readFile(sourceFile, "utf8");
			const identifiers = identifierTokens(source);
			for (const bannedTerm of BANNED_APP_CONTRACT_TERMS) {
				if (identifiers.has(bannedTerm)) violations.push(`${relative(PACKAGE_ROOT, sourceFile)} uses banned app-contract identifier ${bannedTerm}`);
			}
		}

		expect(violations, violations.join("\n")).toHaveLength(0);
	});
});

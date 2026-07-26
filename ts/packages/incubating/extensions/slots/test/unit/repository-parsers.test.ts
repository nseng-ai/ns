import { describe, expect, it } from "vitest";

import {
	parseBranchCommitSummaries,
	parseBranchDiffNumstat,
} from "../../src/core/gateways/repository.ts";

describe("repository branch evidence parsers", () => {
	describe("parseBranchCommitSummaries", () => {
		it("parses empty and multiple NUL-delimited commit records", () => {
			expect(parseBranchCommitSummaries("")).toEqual({ type: "ok", value: [] });
			expect(
				parseBranchCommitSummaries("aaaaaaaa\0subject with\ttabs\0\nbbbbbbbb\0second subject\0\n"),
			).toEqual({
				type: "ok",
				value: [
					{ sha: "aaaaaaaa", subject: "subject with\ttabs" },
					{ sha: "bbbbbbbb", subject: "second subject" },
				],
			});
		});

		it("rejects malformed or incomplete commit field counts", () => {
			expect(parseBranchCommitSummaries("sha\0subject\0extra\0")).toEqual({
				type: "failure",
				failure: { message: "git log returned malformed NUL-delimited commit records" },
			});
			expect(parseBranchCommitSummaries("sha-only")).toEqual({
				type: "failure",
				failure: { message: "git log returned malformed NUL-delimited commit records" },
			});
		});
	});

	describe("parseBranchDiffNumstat", () => {
		it("parses empty, ordinary, binary, and tab-containing path records with totals", () => {
			expect(parseBranchDiffNumstat("")).toEqual({
				type: "ok",
				value: { filesChanged: 0, insertions: 0, deletions: 0, files: [] },
			});
			expect(parseBranchDiffNumstat("2\t3\tsrc/path\twith\ttabs.ts\0-\t-\timage.png\0")).toEqual({
				type: "ok",
				value: {
					filesChanged: 2,
					insertions: 2,
					deletions: 3,
					files: [
						{
							path: "src/path\twith\ttabs.ts",
							additions: 2,
							deletions: 3,
							binary: false,
						},
						{
							path: "image.png",
							additions: null,
							deletions: null,
							binary: true,
						},
					],
				},
			});
		});

		it("rejects a record without the second tab delimiter", () => {
			expect(parseBranchDiffNumstat("1\tpath.ts\0")).toEqual({
				type: "failure",
				failure: { message: "git diff returned malformed NUL-delimited numstat records" },
			});
		});

		it.each(["01\t2\tpath.ts\0", "x\t2\tpath.ts\0", "2\t-1\tpath.ts\0"])(
			"rejects invalid numeric text in %s",
			(stdout) => {
				expect(parseBranchDiffNumstat(stdout)).toEqual({
					type: "failure",
					failure: { message: "git diff returned an invalid numstat record" },
				});
			},
		);
	});
});

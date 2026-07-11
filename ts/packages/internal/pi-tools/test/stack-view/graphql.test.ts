import { describe, expect, it } from "vitest";

import {
	buildStackPrQuery,
	fetchStackPrs,
	graphiteUrl,
	parseStackPrResponse,
	type FetchStackPrsResult,
} from "../../src/stack-view/graphql.ts";
import type { CommandExecApi, ExecOptions } from "../../src/stack-view/exec.ts";
import { createPiCommandExecApi } from "@nseng-ai/pi/shared/exec-gateway";
import { GITHUB_CLI_TIMEOUT_MS } from "@nseng-ai/capability-kit/github";
import { deriveStatus, type StackViewStatusInput } from "../../src/stack-view/types.ts";
import { checkEntryFixture, threadDetailFixture } from "./stack-view-fixtures.ts";

const CWD = "/repo";

// ---------------------------------------------------------------------------
// Exec fake: records every call and replays scripted results. No real process.
// ---------------------------------------------------------------------------

interface RecordedCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

interface FakeExec {
	api: CommandExecApi;
	calls: RecordedCall[];
}

interface ExitedResultOverrides {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code?: number | null;
	readonly signal?: string | null;
}

function fakeExec(overrides: ExitedResultOverrides): FakeExec {
	const calls: RecordedCall[] = [];
	const api: CommandExecApi = {
		async exec(command, args, options) {
			calls.push({ command, args: [...args], options });
			return {
				type: "exited",
				stdout: overrides.stdout ?? "",
				stderr: overrides.stderr ?? "",
				code: overrides.code ?? 0,
				signal: overrides.signal ?? null,
			};
		},
	};
	return { api, calls };
}

// ---------------------------------------------------------------------------
// Response fixture builders. These mirror the selection built in graphql.ts.
// ---------------------------------------------------------------------------

function checkRun(name: string, status: string, conclusion: string | null): unknown {
	return {
		__typename: "CheckRun",
		name,
		status,
		conclusion,
		startedAt: null,
		completedAt: null,
		detailsUrl: null,
	};
}

/** A CheckRun carrying a `checkSuite.workflowRun.workflow.name` so `workflowName` projects. */
function checkRunWithWorkflow(
	name: string,
	workflowName: string,
	status: string,
	conclusion: string | null,
): unknown {
	return {
		__typename: "CheckRun",
		name,
		status,
		conclusion,
		startedAt: null,
		completedAt: null,
		detailsUrl: null,
		checkSuite: {
			workflowRun: {
				databaseId: null,
				runNumber: null,
				runAttempt: null,
				createdAt: null,
				updatedAt: null,
				workflow: { name: workflowName },
			},
		},
	};
}

function statusContext(context: string, state: string, targetUrl: string | null = null): unknown {
	return { __typename: "StatusContext", context, state, createdAt: null, targetUrl };
}

/** Expected check entry the parse produces for a node, keeping assertions terse. */
const checkEntry = checkEntryFixture;

const COMMENT_CREATED_AT = "2026-01-01T00:00:00Z";
const COMMENT_BODY = "comment body";

interface ThreadNodeOverrides {
	id?: string | null;
	isResolved?: boolean;
	path?: string;
	line?: number | null;
	originalLine?: number | null;
	author?: string | null;
	comments?: unknown;
	lastComment?: unknown;
}

/**
 * One review-thread node in the fetched `reviewThreads.nodes` shape. By default a
 * single comment authored by `octocat` (id/body/createdAt derived) plus a
 * `lastComment` alias is attached; pass an explicit `comments` / `lastComment`
 * (including `undefined`) to model a missing connection, an empty `nodes`, or a
 * null author. Omit `path` to model a file-level thread with no path. Thread and
 * comment ids derive from the author so multi-thread fixtures stay distinct.
 */
function threadNode(overrides: ThreadNodeOverrides = {}): unknown {
	const login = overrides.author ?? "octocat";
	const node: Record<string, unknown> = {
		id: "id" in overrides ? overrides.id : `rt-${login}`,
		isResolved: overrides.isResolved ?? false,
		line: overrides.line ?? null,
		originalLine: overrides.originalLine ?? null,
	};
	if ("path" in overrides) node.path = overrides.path;
	if ("comments" in overrides) {
		node.comments = overrides.comments;
	} else {
		node.comments = {
			totalCount: 1,
			nodes: [
				{ id: `c-${login}`, body: COMMENT_BODY, author: { login }, createdAt: COMMENT_CREATED_AT },
			],
		};
	}
	if ("lastComment" in overrides) {
		node.lastComment = overrides.lastComment;
	} else {
		node.lastComment = { nodes: [{ id: `c-${login}` }] };
	}
	return node;
}

/**
 * The thread detail the parse produces for a default-shape {@link threadNode}
 * with the given author (single derived comment). Keeps the connection-driven
 * assertions readable.
 */
function expectedThread(fields: { path: string; line: number | null; author: string }) {
	return threadDetailFixture({
		id: `rt-${fields.author}`,
		path: fields.path,
		line: fields.line,
		author: fields.author,
		comments: [
			{
				id: `c-${fields.author}`,
				author: fields.author,
				body: COMMENT_BODY,
				createdAt: COMMENT_CREATED_AT,
			},
		],
		lastCommentId: `c-${fields.author}`,
		totalComments: 1,
	});
}

function threadsConnection(
	resolved: number,
	unresolved: number,
	totalCount?: number,
): { totalCount: number; nodes: unknown[] } {
	const nodes = [
		...Array.from({ length: resolved }, (_value, index) =>
			threadNode({
				isResolved: true,
				path: `resolved/${index}.ts`,
				line: index + 1,
				author: `resolver${index}`,
			}),
		),
		...Array.from({ length: unresolved }, (_value, index) =>
			threadNode({
				isResolved: false,
				path: `unresolved/${index}.ts`,
				line: index + 1,
				author: `author${index}`,
			}),
		),
	];
	return { totalCount: totalCount ?? nodes.length, nodes };
}

function commitsConnection(checkNodes: unknown[], totalCount?: number): { nodes: unknown[] } {
	return {
		nodes: [
			{
				commit: {
					statusCheckRollup: {
						state: "PENDING",
						contexts: { totalCount: totalCount ?? checkNodes.length, nodes: checkNodes },
					},
				},
			},
		],
	};
}

interface PrNodeOverrides {
	number?: number;
	title?: string;
	url?: string;
	isDraft?: boolean;
	body?: string;
	reviewThreads?: unknown;
	commits?: unknown;
}

function prNode(overrides: PrNodeOverrides = {}): unknown {
	return {
		number: 101,
		title: "A title",
		url: "https://github.com/acme/repo/pull/101",
		isDraft: false,
		body: "Body text",
		reviewThreads: threadsConnection(0, 0),
		commits: commitsConnection([]),
		...overrides,
	};
}

function aliasNode(node: unknown): unknown {
	return { nodes: [node] };
}

function repoResponse(aliases: Record<string, unknown>): unknown {
	return { data: { repository: aliases } };
}

// ===========================================================================

describe("buildStackPrQuery", () => {
	it("emits one aliased pullRequests selection per branch bound to a per-branch variable", () => {
		const query = buildStackPrQuery(["main", "feature", "topper"]);

		// Each alias references its own `$branch{index}` variable, never an inline literal.
		expect(query).toContain("b0: pullRequests(headRefName: $branch0");
		expect(query).toContain("b1: pullRequests(headRefName: $branch1");
		expect(query).toContain("b2: pullRequests(headRefName: $branch2");
		// No stray alias beyond the branch count.
		expect(query).not.toContain("b3:");
		// Per-branch variables are declared alongside owner/repo in the operation signature.
		expect(query).toContain(
			"query($owner:String!,$repo:String!,$branch0:String!,$branch1:String!,$branch2:String!)",
		);
		expect(query).toContain("repository(owner:$owner,name:$repo)");
	});

	it("emits exactly N aliases and N branch variables for N branches", () => {
		const query = buildStackPrQuery(["a", "b", "c", "d"]);
		expect([...query.matchAll(/b\d+: pullRequests/g)]).toHaveLength(4);
		expect([...query.matchAll(/\$branch\d+:String!/g)]).toHaveLength(4);
	});

	it("produces an empty repository selection and no branch variables for zero branches", () => {
		const query = buildStackPrQuery([]);
		expect(query).toContain(
			"query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){}}",
		);
		expect(query).not.toContain("b0:");
		expect(query).not.toContain("$branch0");
	});

	it("selects per-thread detail (id, path/line/originalLine, comments, and the lastComment alias)", () => {
		const query = buildStackPrQuery(["main"]);
		expect(query).toContain(
			"reviewThreads(first:100){totalCount nodes{id isResolved path line originalLine" +
				" comments(first:30){totalCount nodes{id body author{login} createdAt}}" +
				" lastComment: comments(last:1){nodes{id}}}}",
		);
		// The pieces the change-detection key and detail pane depend on.
		expect(query).toContain("comments(first:30)");
		expect(query).toContain("lastComment: comments(last:1)");
	});
});

describe("parseStackPrResponse happy path", () => {
	it("maps aliases positionally into StackPrData with thread and check tallies", () => {
		const branches = ["alpha", "beta"];
		const response = repoResponse({
			b0: aliasNode(
				prNode({
					number: 11,
					title: "First",
					url: "https://github.com/acme/repo/pull/11",
					isDraft: false,
					body: "first body",
					reviewThreads: threadsConnection(2, 1),
					commits: commitsConnection([
						checkRun("build", "COMPLETED", "SUCCESS"),
						checkRun("unit", "COMPLETED", "SUCCESS"),
						checkRun("e2e", "COMPLETED", "FAILURE"),
						checkRun("lint", "IN_PROGRESS", null),
					]),
				}),
			),
			b1: aliasNode(
				prNode({
					number: 22,
					title: "Second",
					url: "https://github.com/acme/repo/pull/22",
					isDraft: true,
					body: "second body",
					reviewThreads: threadsConnection(3, 0),
					commits: commitsConnection([
						statusContext("ci/deploy", "SUCCESS"),
						statusContext("ci/security", "PENDING"),
					]),
				}),
			),
		});

		const result = parseStackPrResponse(response, branches);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;

		const [first, second] = result.prs;
		expect(first).toEqual({
			number: 11,
			title: "First",
			url: "https://github.com/acme/repo/pull/11",
			isDraft: false,
			body: "first body",
			threads: { resolved: 2, total: 3 },
			checks: { passing: 2, failing: 1, pending: 1, total: 4 },
			checkEntries: [
				checkEntry({
					name: "build",
					bucket: "passing",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					identity: "check-run:build",
				}),
				checkEntry({
					name: "unit",
					bucket: "passing",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					identity: "check-run:unit",
				}),
				checkEntry({
					name: "e2e",
					bucket: "failing",
					status: "COMPLETED",
					conclusion: "FAILURE",
					identity: "check-run:e2e",
				}),
				checkEntry({
					name: "lint",
					bucket: "pending",
					status: "IN_PROGRESS",
					identity: "check-run:lint",
				}),
			],
			unresolvedThreads: [expectedThread({ path: "unresolved/0.ts", line: 1, author: "author0" })],
		});
		expect(second).toEqual({
			number: 22,
			title: "Second",
			url: "https://github.com/acme/repo/pull/22",
			isDraft: true,
			body: "second body",
			threads: { resolved: 3, total: 3 },
			checks: { passing: 1, failing: 0, pending: 1, total: 2 },
			checkEntries: [
				checkEntry({ name: "ci/deploy", bucket: "passing", identity: "status-context:ci/deploy" }),
				checkEntry({
					name: "ci/security",
					bucket: "pending",
					identity: "status-context:ci/security",
				}),
			],
			unresolvedThreads: [],
		});
	});

	it("folds unknown-bucket checks into pending so they never mark failing or vanish", () => {
		const response = repoResponse({
			b0: aliasNode(
				prNode({
					commits: commitsConnection([
						checkRun("ok", "COMPLETED", "SUCCESS"),
						// Unrecognized conclusion -> unknown bucket.
						checkRun("mystery", "COMPLETED", "SOMETHING_NEW"),
						// StatusContext with an unrecognized state -> unknown bucket.
						statusContext("legacy", "WEIRD"),
					]),
				}),
			),
		});

		const result = parseStackPrResponse(response, ["only"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		// 1 passing, 0 failing, 2 unknown folded into pending, total = 3.
		expect(result.prs[0]?.checks).toEqual({ passing: 1, failing: 0, pending: 2, total: 3 });
	});

	it("defaults missing scalar fields", () => {
		const response = repoResponse({
			b0: aliasNode({ number: 7 }),
		});
		const result = parseStackPrResponse(response, ["one"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.prs[0]).toEqual({
			number: 7,
			title: "",
			url: "",
			isDraft: false,
			body: "",
			threads: { resolved: 0, total: 0 },
			checks: { passing: 0, failing: 0, pending: 0, total: 0 },
			checkEntries: [],
			unresolvedThreads: [],
		});
	});
});

describe("parseStackPrResponse unresolved-thread detail", () => {
	function parseOne(reviewThreads: unknown) {
		const response = repoResponse({ b0: aliasNode(prNode({ reviewThreads })) });
		const result = parseStackPrResponse(response, ["only"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("expected ok result");
		return result.prs[0];
	}

	it("extracts only unresolved threads, excluding resolved ones", () => {
		const pr = parseOne({
			totalCount: 3,
			nodes: [
				threadNode({ isResolved: true, path: "resolved.ts", line: 1, author: "alice" }),
				threadNode({ isResolved: false, path: "src/a.ts", line: 12, author: "bob" }),
				threadNode({ isResolved: false, path: "src/b.ts", line: 34, author: "carol" }),
			],
		});
		expect(pr?.unresolvedThreads).toEqual([
			expectedThread({ path: "src/a.ts", line: 12, author: "bob" }),
			expectedThread({ path: "src/b.ts", line: 34, author: "carol" }),
		]);
	});

	it("falls back to originalLine when line is null, and to null when both are null", () => {
		const pr = parseOne({
			totalCount: 2,
			nodes: [
				threadNode({
					isResolved: false,
					path: "src/a.ts",
					line: null,
					originalLine: 7,
					author: "bob",
				}),
				threadNode({
					isResolved: false,
					path: "src/b.ts",
					line: null,
					originalLine: null,
					author: "carol",
				}),
			],
		});
		expect(pr?.unresolvedThreads).toEqual([
			expectedThread({ path: "src/a.ts", line: 7, author: "bob" }),
			expectedThread({ path: "src/b.ts", line: null, author: "carol" }),
		]);
	});

	it("defaults a missing path to the empty string", () => {
		const pr = parseOne({
			totalCount: 1,
			nodes: [threadNode({ isResolved: false, line: 3, author: "bob" })],
		});
		expect(pr?.unresolvedThreads).toEqual([expectedThread({ path: "", line: 3, author: "bob" })]);
	});

	it("yields a null author when comments are missing, empty, or carry a null author", () => {
		const pr = parseOne({
			totalCount: 3,
			nodes: [
				threadNode({
					id: "rt-a",
					isResolved: false,
					path: "src/a.ts",
					line: 1,
					comments: undefined,
					lastComment: undefined,
				}),
				threadNode({
					id: "rt-b",
					isResolved: false,
					path: "src/b.ts",
					line: 2,
					comments: { nodes: [] },
					lastComment: { nodes: [] },
				}),
				threadNode({
					id: "rt-c",
					isResolved: false,
					path: "src/c.ts",
					line: 3,
					comments: { nodes: [{ author: null }] },
					lastComment: { nodes: [{ id: "c-c" }] },
				}),
			],
		});
		expect(pr?.unresolvedThreads).toEqual([
			{
				id: "rt-a",
				path: "src/a.ts",
				line: 1,
				author: null,
				comments: [],
				lastCommentId: null,
				totalComments: 0,
			},
			{
				id: "rt-b",
				path: "src/b.ts",
				line: 2,
				author: null,
				comments: [],
				lastCommentId: null,
				totalComments: 0,
			},
			{
				id: "rt-c",
				path: "src/c.ts",
				line: 3,
				author: null,
				comments: [{ id: "", author: null, body: "", createdAt: null }],
				lastCommentId: "c-c",
				totalComments: 1,
			},
		]);
	});

	it("parses adversarial threads: missing id → null, empty comments, and a missing lastComment alias", () => {
		const pr = parseOne({
			totalCount: 1,
			nodes: [
				threadNode({
					id: null,
					isResolved: false,
					path: "src/adversarial.ts",
					line: 9,
					comments: { totalCount: 0, nodes: [] },
					lastComment: undefined,
				}),
			],
		});
		expect(pr?.unresolvedThreads).toEqual([
			{
				id: null,
				path: "src/adversarial.ts",
				line: 9,
				author: null,
				comments: [],
				lastCommentId: null,
				totalComments: 0,
			},
		]);
	});

	it("keeps totalComments honest from totalCount when it exceeds fetched comment nodes", () => {
		const pr = parseOne({
			totalCount: 1,
			nodes: [
				threadNode({
					id: "rt-big",
					isResolved: false,
					path: "src/big.ts",
					line: 4,
					comments: {
						totalCount: 42,
						nodes: [{ id: "c1", body: "first", author: { login: "dana" }, createdAt: null }],
					},
					lastComment: { nodes: [{ id: "c42" }] },
				}),
			],
		});
		expect(pr?.unresolvedThreads).toEqual([
			{
				id: "rt-big",
				path: "src/big.ts",
				line: 4,
				author: "dana",
				comments: [{ id: "c1", author: "dana", body: "first", createdAt: null }],
				lastCommentId: "c42",
				totalComments: 42,
			},
		]);
	});
});

describe("parseStackPrResponse check entries", () => {
	function parseChecks(checkNodes: unknown[]) {
		const response = repoResponse({
			b0: aliasNode(prNode({ commits: commitsConnection(checkNodes) })),
		});
		const result = parseStackPrResponse(response, ["only"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("expected ok result");
		return result.prs[0];
	}

	it("projects a CheckRun's name, workflow name, bucket, status/conclusion, and identity", () => {
		const pr = parseChecks([
			checkRunWithWorkflow("typecheck", "CI", "COMPLETED", "SUCCESS"),
			checkRunWithWorkflow("e2e", "CI", "COMPLETED", "FAILURE"),
		]);
		expect(pr?.checkEntries).toEqual([
			checkEntry({
				name: "typecheck",
				workflowName: "CI",
				bucket: "passing",
				status: "COMPLETED",
				conclusion: "SUCCESS",
				identity: "check-run:CI:typecheck",
			}),
			checkEntry({
				name: "e2e",
				workflowName: "CI",
				bucket: "failing",
				status: "COMPLETED",
				conclusion: "FAILURE",
				identity: "check-run:CI:e2e",
			}),
		]);
	});

	it("projects a StatusContext's context as the name with null workflow/status/conclusion", () => {
		const pr = parseChecks([statusContext("ci/deploy", "SUCCESS")]);
		expect(pr?.checkEntries).toEqual([
			checkEntry({ name: "ci/deploy", bucket: "passing", identity: "status-context:ci/deploy" }),
		]);
	});

	it("folds a StatusContext's targetUrl into the entry's detailsUrl", () => {
		const pr = parseChecks([statusContext("ci/deploy", "SUCCESS", "https://ci.example/build/1")]);
		expect(pr?.checkEntries).toEqual([
			checkEntry({
				name: "ci/deploy",
				bucket: "passing",
				identity: "status-context:ci/deploy",
				detailsUrl: "https://ci.example/build/1",
			}),
		]);
	});

	it("folds an unknown-bucket check into the pending bucket on the entry", () => {
		const pr = parseChecks([
			checkRun("ok", "COMPLETED", "SUCCESS"),
			// Unrecognized conclusion -> unknown bucket -> folded to pending.
			checkRun("mystery", "COMPLETED", "SOMETHING_NEW"),
		]);
		expect(pr?.checkEntries).toEqual([
			checkEntry({
				name: "ok",
				bucket: "passing",
				status: "COMPLETED",
				conclusion: "SUCCESS",
				identity: "check-run:ok",
			}),
			checkEntry({
				name: "mystery",
				bucket: "pending",
				status: "COMPLETED",
				conclusion: "SOMETHING_NEW",
				identity: "check-run:mystery",
			}),
		]);
	});
});

describe("parseStackPrResponse per-branch degradation", () => {
	it("returns null for a branch whose connection has no open PR", () => {
		const response = repoResponse({
			b0: aliasNode(prNode({ number: 5 })),
			b1: { nodes: [] },
		});
		const result = parseStackPrResponse(response, ["has-pr", "no-pr"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.prs[0]?.number).toBe(5);
		expect(result.prs[1]).toBeNull();
	});

	it("returns null for a malformed alias without failing the whole response", () => {
		const response = repoResponse({
			b0: aliasNode(prNode({ number: 9 })),
			// Wrong shape entirely: not an object with a nodes array.
			b1: 42,
			// Object, but a node whose number is missing/invalid: node parse fails -> null.
			b2: { nodes: [{ title: "no number" }] },
		});
		const result = parseStackPrResponse(response, ["a", "b", "c"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.prs[0]?.number).toBe(9);
		expect(result.prs[1]).toBeNull();
		expect(result.prs[2]).toBeNull();
	});

	it("returns null for an alias entirely absent from the repository object", () => {
		const response = repoResponse({ b0: aliasNode(prNode({ number: 3 })) });
		// Ask for two branches; only b0 is present.
		const result = parseStackPrResponse(response, ["present", "missing"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.prs[0]?.number).toBe(3);
		expect(result.prs[1]).toBeNull();
	});
});

describe("parseStackPrResponse whole-response failures", () => {
	it("surfaces GraphQL errors with their messages", () => {
		const response = { errors: [{ message: "Bad credentials" }, { message: "rate limited" }] };
		const result = parseStackPrResponse(response, ["a"]);
		expect(result).toEqual({
			type: "graphql-errors",
			messages: ["Bad credentials", "rate limited"],
		});
	});

	it("substitutes a placeholder message when GraphQL errors carry none", () => {
		const response = { errors: [{}, { message: "   " }] };
		const result = parseStackPrResponse(response, ["a"]);
		expect(result).toEqual({
			type: "graphql-errors",
			messages: ["GitHub returned GraphQL errors without messages"],
		});
	});

	it("reports schema-mismatch when repository is null", () => {
		const result = parseStackPrResponse({ data: { repository: null } }, ["a"]);
		expect(result).toEqual({ type: "schema-mismatch" });
	});

	it("reports schema-mismatch for a totally wrong shape", () => {
		expect(parseStackPrResponse({ nonsense: true }, ["a"])).toEqual({ type: "schema-mismatch" });
		expect(parseStackPrResponse({ data: {} }, ["a"])).toEqual({ type: "schema-mismatch" });
	});
});

describe("parseStackPrResponse pagination degradation", () => {
	it("keeps total honest at totalCount while resolved counts only fetched thread nodes", () => {
		// 150 threads total but only 100 fetched (40 resolved, 60 unresolved).
		const response = repoResponse({
			b0: aliasNode(prNode({ number: 12, reviewThreads: threadsConnection(40, 60, 150) })),
		});
		const result = parseStackPrResponse(response, ["big"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.prs[0]?.threads).toEqual({ resolved: 40, total: 150 });
	});

	it("does not corrupt check counts when contexts.totalCount exceeds fetched nodes", () => {
		// hasMore is derived from totalCount > nodes.length; counts must stay the visible tally.
		const response = repoResponse({
			b0: aliasNode(
				prNode({
					number: 13,
					commits: commitsConnection(
						[
							checkRun("build", "COMPLETED", "SUCCESS"),
							checkRun("test", "COMPLETED", "FAILURE"),
							checkRun("lint", "IN_PROGRESS", null),
						],
						250,
					),
				}),
			),
		});
		const result = parseStackPrResponse(response, ["big"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.prs[0]?.checks).toEqual({ passing: 1, failing: 1, pending: 1, total: 3 });
	});
});

describe("fetchStackPrs", () => {
	function okResult(result: FetchStackPrsResult): Extract<FetchStackPrsResult, { type: "ok" }> {
		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("expected ok result");
		return result;
	}

	it("runs gh api graphql with query/owner/repo and per-branch -f args, timeout, and parses success", async () => {
		const branches = ["alpha", "beta"];
		const response = repoResponse({
			b0: aliasNode(prNode({ number: 1 })),
			b1: { nodes: [] },
		});
		const fake = fakeExec({ stdout: JSON.stringify(response) });

		const result = await fetchStackPrs({
			execApi: fake.api,
			cwd: CWD,
			branches,
			repoIdentity: { owner: "acme", repo: "widgets" },
		});

		const ok = okResult(result);
		expect(ok.prs[0]?.number).toBe(1);
		expect(ok.prs[1]).toBeNull();

		expect(fake.calls).toHaveLength(1);
		const call = fake.calls[0];
		expect(call?.command).toBe("gh");
		// Each branch rides as its own `-f branch{index}=…` variable after owner/repo.
		expect(call?.args).toEqual([
			"api",
			"graphql",
			"-f",
			`query=${buildStackPrQuery(branches)}`,
			"-f",
			"owner=acme",
			"-f",
			"repo=widgets",
			"-f",
			"branch0=alpha",
			"-f",
			"branch1=beta",
		]);
		expect(call?.options).toEqual({ cwd: CWD, timeout: GITHUB_CLI_TIMEOUT_MS });
	});

	it("maps a nonzero exit into exec-error carrying the stderr reason", async () => {
		const fake = fakeExec({ code: 1, stderr: "gh: not authenticated" });
		const result = await fetchStackPrs({
			execApi: fake.api,
			cwd: CWD,
			branches: ["a"],
			repoIdentity: { owner: "acme", repo: "widgets" },
		});
		expect(result).toEqual({ type: "exec-error", message: "gh: not authenticated" });
	});

	it("maps non-JSON stdout into invalid-json", async () => {
		const fake = fakeExec({ stdout: "not json at all" });
		const result = await fetchStackPrs({
			execApi: fake.api,
			cwd: CWD,
			branches: ["a"],
			repoIdentity: { owner: "acme", repo: "widgets" },
		});
		expect(result.type).toBe("invalid-json");
		if (result.type !== "invalid-json") return;
		expect(result.message.length).toBeGreaterThan(0);
	});

	it("propagates GraphQL errors from a successful exec", async () => {
		const fake = fakeExec({ stdout: JSON.stringify({ errors: [{ message: "boom" }] }) });
		const result = await fetchStackPrs({
			execApi: fake.api,
			cwd: CWD,
			branches: ["a"],
			repoIdentity: { owner: "acme", repo: "widgets" },
		});
		expect(result).toEqual({ type: "graphql-errors", messages: ["boom"] });
	});

	it("propagates a top-level schema mismatch from a successful exec", async () => {
		const fake = fakeExec({ stdout: JSON.stringify({ data: { repository: null } }) });
		const result = await fetchStackPrs({
			execApi: fake.api,
			cwd: CWD,
			branches: ["a"],
			repoIdentity: { owner: "acme", repo: "widgets" },
		});
		expect(result).toEqual({ type: "schema-mismatch" });
	});
});

describe("Pi exec adapter throw-safety", () => {
	it("normalizes a rejecting host exec into a spawn-failed result instead of throwing", async () => {
		const execApi = createPiCommandExecApi({
			exec: () => Promise.reject(new Error("spawn gh ENOENT")),
		});

		const result = await execApi.exec("gh", ["api", "graphql"], { cwd: CWD });

		expect(result).toEqual({
			type: "spawn-failed",
			stdout: "",
			stderr: "spawn gh ENOENT",
			error: "spawn gh ENOENT",
		});
	});

	it("keeps fetchStackPrs from throwing when the host exec rejects, mapping to exec-error", async () => {
		const execApi = createPiCommandExecApi({
			exec: () => Promise.reject(new Error("spawn gh ENOENT")),
		});

		const result = await fetchStackPrs({
			execApi,
			cwd: CWD,
			branches: ["a"],
			repoIdentity: { owner: "acme", repo: "widgets" },
		});

		expect(result.type).toBe("exec-error");
	});
});

describe("graphiteUrl", () => {
	it("formats the Graphite app PR URL", () => {
		expect(graphiteUrl({ owner: "acme", repo: "widgets" }, 42)).toBe(
			"https://app.graphite.com/github/pr/acme/widgets/42",
		);
	});
});

describe("deriveStatus", () => {
	function statusInput(overrides: Partial<StackViewStatusInput> = {}): StackViewStatusInput {
		return {
			number: 1,
			isDraft: false,
			checks: { failing: 0 },
			threads: { resolved: 0, total: 0 },
			...overrides,
		};
	}

	it("returns no-pr when there is no PR number, regardless of other fields", () => {
		expect(
			deriveStatus(
				statusInput({
					number: null,
					isDraft: true,
					checks: { failing: 5 },
					threads: { resolved: 0, total: 4 },
				}),
			),
		).toBe("no-pr");
	});

	it("returns draft when the PR is a draft, even with failing checks (draft beats failing)", () => {
		expect(
			deriveStatus(
				statusInput({ isDraft: true, checks: { failing: 3 }, threads: { resolved: 0, total: 2 } }),
			),
		).toBe("draft");
	});

	it("returns checks-failing when a check fails, even with unresolved threads (failing beats unresolved)", () => {
		expect(
			deriveStatus(statusInput({ checks: { failing: 1 }, threads: { resolved: 0, total: 5 } })),
		).toBe("checks-failing");
	});

	it("returns unresolved when checks pass but threads remain open", () => {
		expect(deriveStatus(statusInput({ threads: { resolved: 1, total: 3 } }))).toBe("unresolved");
	});

	it("returns ready when there is a PR, it is not a draft, checks pass, and threads are resolved", () => {
		expect(deriveStatus(statusInput({ threads: { resolved: 4, total: 4 } }))).toBe("ready");
	});
});

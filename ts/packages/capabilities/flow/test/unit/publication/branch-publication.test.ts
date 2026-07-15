import { describe, expect, test } from "vitest";

import {
	createFlowBranchPublicationClientFromGateways,
	type FlowBoundBranchPublicationTarget,
	type FlowPublicationError,
	type FlowPublicationGatewayResult,
	type FlowPublicationPullRequest,
	type FlowPublicationPullRequestGateway,
	type FlowPublicationRepositoryGateway,
} from "../../../src/publication/branch-publication.ts";

const OLD_HEAD = "a".repeat(40);
const NEW_HEAD = "b".repeat(40);

function target(headOid = OLD_HEAD): FlowBoundBranchPublicationTarget {
	return {
		branch: "feature/demo",
		pullRequest: {
			number: 12,
			url: "https://github.com/acme/project/pull/12",
			headRefName: "feature/demo",
			headOid,
		},
	};
}

function pullRequest(
	options: { readonly headOid?: string; readonly body?: string } = {},
): FlowPublicationPullRequest {
	const headOid = options.headOid ?? OLD_HEAD;
	return { ...target(headOid).pullRequest, body: options.body ?? "Human prose" };
}

class InMemoryRepository implements FlowPublicationRepositoryGateway {
	readonly operations: string[];
	private readonly state: { branch: string; headOid: string };
	private readonly pushError: FlowPublicationError | undefined;

	constructor(input: {
		operations: string[];
		branch?: string;
		headOid?: string;
		pushError?: FlowPublicationError;
	}) {
		this.operations = input.operations;
		this.state = { branch: input.branch ?? "feature/demo", headOid: input.headOid ?? NEW_HEAD };
		this.pushError = input.pushError;
	}

	async readCurrentBranch() {
		this.operations.push("read-repository");
		return success({ ...this.state });
	}

	async publishBranch(input: { branch: string; expectedHeadOid: string }) {
		this.operations.push(`push:${input.branch}:${input.expectedHeadOid}`);
		return this.pushError === undefined ? success(undefined) : failure(this.pushError);
	}
}

class InMemoryPullRequests implements FlowPublicationPullRequestGateway {
	readonly operations: string[];
	readonly editedBodies: string[] = [];
	private readonly reads: FlowPublicationPullRequest[];
	private readonly editError: FlowPublicationError | undefined;

	constructor(input: {
		operations: string[];
		reads: FlowPublicationPullRequest[];
		editError?: FlowPublicationError;
	}) {
		this.operations = input.operations;
		this.reads = input.reads.map((value) => ({ ...value }));
		this.editError = input.editError;
	}

	async readCurrentBranchPullRequest() {
		this.operations.push("read-current-pr");
		return success({ ...(this.reads[0] ?? pullRequest()) });
	}

	async readPullRequest(number: number) {
		this.operations.push(`read-pr:${number}`);
		const value = this.reads.shift();
		return value === undefined
			? failure({ code: "missing", message: "missing PR state" })
			: success({ ...value });
	}

	async replacePullRequestBody(input: { number: number; body: string }) {
		this.operations.push(`edit-pr:${input.number}`);
		this.editedBodies.push(input.body);
		return this.editError === undefined ? success(undefined) : failure(this.editError);
	}
}

describe("Flow branch publication", () => {
	test("resolves a non-trunk current branch and its existing PR target", async () => {
		const operations: string[] = [];
		const client = createFlowBranchPublicationClientFromGateways({
			repository: new InMemoryRepository({ operations, headOid: OLD_HEAD }),
			pullRequests: new InMemoryPullRequests({ operations, reads: [pullRequest()] }),
		});
		expect(await client.resolveCurrentBranchTarget({ trunkBranch: "main" })).toEqual({
			type: "resolved",
			localHeadOid: OLD_HEAD,
			target: target(),
		});
		expect(operations).toEqual(["read-repository", "read-current-pr"]);
	});

	test("revalidates, pushes, rereads, then updates the preserved body", async () => {
		const operations: string[] = [];
		const repository = new InMemoryRepository({ operations });
		const pullRequests = new InMemoryPullRequests({
			operations,
			reads: [pullRequest(), pullRequest({ headOid: NEW_HEAD })],
		});
		const client = createFlowBranchPublicationClientFromGateways({ repository, pullRequests });
		expect(
			await client.publishBoundBranch({
				target: target(),
				expectedHeadOid: NEW_HEAD,
				objectiveSlug: "demo-objective",
				managedBody: "## Objective Runner\n\nFacts",
			}),
		).toEqual({ type: "published", headOid: NEW_HEAD, target: target(NEW_HEAD) });
		expect(operations).toEqual([
			"read-repository",
			"read-pr:12",
			`push:feature/demo:${NEW_HEAD}`,
			"read-pr:12",
			"edit-pr:12",
		]);
		expect(pullRequests.editedBodies[0]).toContain("Human prose\n\n<!-- ns-objective-runner:begin");
	});

	test("refuses target drift and malformed regions before mutation", async () => {
		const operations: string[] = [];
		const client = createFlowBranchPublicationClientFromGateways({
			repository: new InMemoryRepository({ operations }),
			pullRequests: new InMemoryPullRequests({
				operations,
				reads: [pullRequest({ headOid: "c".repeat(40) })],
			}),
		});
		expect(
			await client.publishBoundBranch({
				target: target(),
				expectedHeadOid: NEW_HEAD,
				objectiveSlug: "demo-objective",
				managedBody: "Facts",
			}),
		).toMatchObject({ type: "refused", reason: "pull-request-drift" });
		expect(operations).toEqual(["read-repository", "read-pr:12"]);

		const malformedOperations: string[] = [];
		const malformedClient = createFlowBranchPublicationClientFromGateways({
			repository: new InMemoryRepository({ operations: malformedOperations }),
			pullRequests: new InMemoryPullRequests({
				operations: malformedOperations,
				reads: [
					pullRequest({
						headOid: OLD_HEAD,
						body: "<!-- ns-objective-runner:begin objective=demo-objective -->\nBroken",
					}),
				],
			}),
		});
		expect(
			await malformedClient.publishBoundBranch({
				target: target(),
				expectedHeadOid: NEW_HEAD,
				objectiveSlug: "demo-objective",
				managedBody: "Facts",
			}),
		).toMatchObject({ type: "refused", reason: "malformed-region" });
		expect(malformedOperations).toEqual(["read-repository", "read-pr:12"]);
	});

	test("does not edit after push failure and never rolls back after edit failure", async () => {
		const pushOperations: string[] = [];
		const pushClient = createFlowBranchPublicationClientFromGateways({
			repository: new InMemoryRepository({
				operations: pushOperations,
				pushError: { code: "push-failed", message: "non-fast-forward" },
			}),
			pullRequests: new InMemoryPullRequests({
				operations: pushOperations,
				reads: [pullRequest()],
			}),
		});
		expect(
			await pushClient.publishBoundBranch({
				target: target(),
				expectedHeadOid: NEW_HEAD,
				objectiveSlug: "demo-objective",
				managedBody: "Facts",
			}),
		).toMatchObject({ type: "push-failed" });
		expect(pushOperations).not.toContain("edit-pr:12");

		const editOperations: string[] = [];
		const editClient = createFlowBranchPublicationClientFromGateways({
			repository: new InMemoryRepository({ operations: editOperations }),
			pullRequests: new InMemoryPullRequests({
				operations: editOperations,
				reads: [pullRequest(), pullRequest({ headOid: NEW_HEAD })],
				editError: { code: "edit-failed", message: "GitHub unavailable" },
			}),
		});
		expect(
			await editClient.publishBoundBranch({
				target: target(),
				expectedHeadOid: NEW_HEAD,
				objectiveSlug: "demo-objective",
				managedBody: "Facts",
			}),
		).toEqual({
			type: "pushed-pr-update-failed",
			headOid: NEW_HEAD,
			target: target(NEW_HEAD),
			error: { code: "edit-failed", message: "GitHub unavailable" },
		});
		expect(editOperations).toEqual([
			"read-repository",
			"read-pr:12",
			`push:feature/demo:${NEW_HEAD}`,
			"read-pr:12",
			"edit-pr:12",
		]);
	});
});

function success<T>(value: T): FlowPublicationGatewayResult<T> {
	return { ok: true, value };
}

function failure(error: FlowPublicationError): { ok: false; error: FlowPublicationError } {
	return { ok: false, error };
}

import type {
	GhStackInventory,
	GhStackInventoryItem,
	GhStackStatus,
	LocalBranch,
	LocalStack,
	RemotePullRequest,
	RemoteStack,
} from "./types.ts";

export type ReconciliationResult =
	| { readonly ok: true; readonly value: GhStackInventory }
	| { readonly ok: false; readonly detail: string };

export function reconcileGhStackInventory(options: {
	readonly local: readonly LocalStack[];
	readonly remote: readonly RemoteStack[];
	readonly limit: number;
}): ReconciliationResult {
	if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
		return { ok: false, detail: "limit must be a positive safe integer" };
	}

	const identityValidation = validateIdentities(options.local, options.remote);
	if (!identityValidation.ok) return identityValidation;

	const remoteByNumber = new Map(options.remote.map((stack) => [stack.number, stack]));
	const remoteById = new Map(options.remote.map((stack) => [stack.id, stack]));
	const matchedRemoteIds = new Set<string>();
	const rows: GhStackInventoryItem[] = [];

	for (const local of options.local) {
		const remote =
			(local.number === null ? undefined : remoteByNumber.get(local.number)) ??
			(local.id === null ? undefined : remoteById.get(local.id));
		if (remote !== undefined) {
			if (matchedRemoteIds.has(remote.id)) {
				return { ok: false, detail: `multiple local stacks match remote stack ${remote.id}` };
			}
			const composition = validateComposition(local, remote);
			if (!composition.ok) return composition;
			matchedRemoteIds.add(remote.id);
		}
		const row = localRow(local, remote);
		if (!isFullyMerged(row.status)) rows.push(row);
	}

	for (const remote of options.remote) {
		if (matchedRemoteIds.has(remote.id)) continue;
		const row = remoteRow(remote);
		if (!isFullyMerged(row.status)) rows.push(row);
	}

	const sorted = rows.toSorted(compareRows);
	const total = sorted.length;
	const stacks = sorted.slice(0, options.limit);
	return {
		ok: true,
		value: {
			stacks,
			limit: options.limit,
			returned: stacks.length,
			total,
			truncated: stacks.length < total,
		},
	};
}

function validateIdentities(
	local: readonly LocalStack[],
	remote: readonly RemoteStack[],
): { readonly ok: true } | { readonly ok: false; readonly detail: string } {
	const localNumbers = local.flatMap((stack) => (stack.number === null ? [] : [stack.number]));
	const localIds = local.flatMap((stack) => (stack.id === null ? [] : [stack.id]));
	const remoteNumbers = remote.map((stack) => stack.number);
	const remoteIds = remote.map((stack) => stack.id);
	for (const [label, values] of [
		["local stack number", localNumbers],
		["local stack id", localIds],
		["remote stack number", remoteNumbers],
		["remote stack id", remoteIds],
	] as const) {
		const duplicate = firstDuplicate(values);
		if (duplicate !== undefined) return { ok: false, detail: `duplicate ${label}: ${duplicate}` };
	}
	return { ok: true };
}

function firstDuplicate(values: readonly (string | number)[]): string | undefined {
	const seen = new Set<string | number>();
	for (const value of values) {
		if (seen.has(value)) return String(value);
		seen.add(value);
	}
	return undefined;
}

function validateComposition(
	local: LocalStack,
	remote: RemoteStack,
): { readonly ok: true } | { readonly ok: false; readonly detail: string } {
	const localPublished = local.branches.flatMap((branch) =>
		branch.pullRequest === null ? [] : [{ number: branch.pullRequest.number, branch: branch.name }],
	);
	const remotePublished = remote.pullRequests.map((pullRequest) => ({
		number: pullRequest.number,
		branch: pullRequest.branch,
	}));
	if (JSON.stringify(localPublished) === JSON.stringify(remotePublished)) return { ok: true };
	return {
		ok: false,
		detail: `local and remote composition disagree for stack ${remote.number}`,
	};
}

function localRow(local: LocalStack, remote: RemoteStack | undefined): GhStackInventoryItem {
	const branches = local.branches.map((branch) => branch.name);
	return {
		number: remote?.number ?? local.number,
		branches,
		bottomBranch: requiredEnd(branches, 0),
		topBranch: requiredEnd(branches, branches.length - 1),
		base: remote?.base ?? local.base,
		type: "local",
		status: localStatus(local.branches, remote?.pullRequests),
		createdAt: remote?.createdAt ?? null,
	};
}

function remoteRow(remote: RemoteStack): GhStackInventoryItem {
	const branches = remote.pullRequests.map((pullRequest) => pullRequest.branch);
	return {
		number: remote.number,
		branches,
		bottomBranch: requiredEnd(branches, 0),
		topBranch: requiredEnd(branches, branches.length - 1),
		base: remote.base,
		type: "remote",
		status: remoteStatus(remote.pullRequests),
		createdAt: remote.createdAt,
	};
}

function requiredEnd(branches: readonly string[], index: number): string {
	const branch = branches[index];
	if (branch === undefined) throw new Error("parsed gh-stack records must contain branches");
	return branch;
}

function localStatus(
	branches: readonly LocalBranch[],
	remotePullRequests: readonly RemotePullRequest[] | undefined,
): GhStackStatus {
	const remoteByNumber = new Map(
		(remotePullRequests ?? []).map((pullRequest) => [pullRequest.number, pullRequest]),
	);
	let merged = 0;
	let open = 0;
	let closed = 0;
	let unpushed = 0;
	for (const branch of branches) {
		if (branch.pullRequest === null) {
			unpushed += 1;
			continue;
		}
		const remote = remoteByNumber.get(branch.pullRequest.number);
		if (remote !== undefined) {
			if (remote.mergedAt !== null) merged += 1;
			else if (remote.state === "closed") closed += 1;
			else open += 1;
		} else if (branch.pullRequest.merged) merged += 1;
		else open += 1;
	}
	return { merged, open, closed, unpushed };
}

function remoteStatus(pullRequests: readonly RemotePullRequest[]): GhStackStatus {
	let merged = 0;
	let open = 0;
	let closed = 0;
	for (const pullRequest of pullRequests) {
		if (pullRequest.mergedAt !== null) merged += 1;
		else if (pullRequest.state === "closed") closed += 1;
		else open += 1;
	}
	return { merged, open, closed, unpushed: 0 };
}

function isFullyMerged(status: GhStackStatus): boolean {
	return status.merged > 0 && status.open === 0 && status.closed === 0 && status.unpushed === 0;
}

function compareRows(left: GhStackInventoryItem, right: GhStackInventoryItem): number {
	if ((left.number === null) !== (right.number === null)) return left.number === null ? -1 : 1;
	if (left.number !== right.number) return (right.number ?? 0) - (left.number ?? 0);
	if (left.createdAt !== right.createdAt) {
		if (left.createdAt === null) return 1;
		if (right.createdAt === null) return -1;
		return right.createdAt.localeCompare(left.createdAt);
	}
	const summaryComparison = stackSummary(left).localeCompare(stackSummary(right));
	if (summaryComparison !== 0) return summaryComparison;
	return left.type.localeCompare(right.type);
}

function stackSummary(stack: GhStackInventoryItem): string {
	return stack.bottomBranch === stack.topBranch
		? stack.bottomBranch
		: `${stack.bottomBranch}...${stack.topBranch}`;
}

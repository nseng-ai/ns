import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { formatModelRef } from "@nseng-ai/foundation/model-slug";

import { modelOperation, withActiveOperations } from "../phase-stream/matrix-progress-core.ts";
import {
	assemblePrInventoryBody,
	preparePrInventory,
	resolvePrInventoryGeneration,
} from "./index.ts";
import type { NormalizedPrTitlePrefix } from "./pr-title-prefix.ts";
import { composePrefixedPrTitle } from "./pr-title-prefix.ts";
import type { SubmitPrInventoryOptions } from "./submit.ts";
import type { SubmitProgress } from "./submit-progress.ts";

export interface BranchSubmitError {
	code: string;
	message: string;
	displayCommand?: string;
}

export type BranchSubmitResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: BranchSubmitError };

export interface BranchSubmitRepositoryFacts {
	branch: string;
	trunk: string;
	headOid: string;
	commitHeadlines: readonly string[];
	diff: string;
}

export interface BranchSubmitPullRequest {
	number: number;
	url: string;
	title: string;
	body: string;
	headRefName: string;
	baseRefName: string;
	headOid: string;
}

export type BranchSubmitPullRequestLookup =
	| { type: "missing" }
	| { type: "found"; pullRequest: BranchSubmitPullRequest }
	| { type: "ambiguous"; candidates: readonly { number: number; url: string }[] };

export interface BranchSubmitRepositoryGateway {
	readFacts(input: { cwd: string }): Promise<BranchSubmitResult<BranchSubmitRepositoryFacts>>;
	pushExact(input: {
		cwd: string;
		branch: string;
		headOid: string;
	}): Promise<BranchSubmitResult<void>>;
}

export interface BranchSubmitPullRequestGateway {
	findOpenByHead(input: {
		cwd: string;
		branch: string;
	}): Promise<BranchSubmitResult<BranchSubmitPullRequestLookup>>;
	create(input: {
		cwd: string;
		head: string;
		base: string;
		title: string;
		body: string;
	}): Promise<BranchSubmitResult<{ number: number; url: string }>>;
	read(input: {
		cwd: string;
		number: number;
	}): Promise<BranchSubmitResult<BranchSubmitPullRequest>>;
	edit(input: {
		cwd: string;
		number: number;
		title: string;
		body: string;
	}): Promise<BranchSubmitResult<void>>;
}

export interface BranchSubmitContext {
	repository: BranchSubmitRepositoryGateway;
	pullRequests: BranchSubmitPullRequestGateway;
}

export type SubmitBranchOutcome =
	| { type: "submitted"; pullRequest: BranchSubmitPullRequest; metadataReplaced: boolean }
	| {
			type: "failed";
			stage: "inspection" | "metadata" | "push" | "create";
			error: BranchSubmitError;
	  }
	| {
			type: "pushed-pr-create-failed";
			branch: string;
			headOid: string;
			error: BranchSubmitError;
	  }
	| {
			type: "pushed-pr-metadata-failed";
			pullRequest: BranchSubmitPullRequest;
			error: BranchSubmitError;
	  };

export async function submitBranch(input: {
	cwd: string;
	context: BranchSubmitContext;
	prInventory: SubmitPrInventoryOptions;
	replaceExistingMetadata: boolean;
	titlePrefix?: NormalizedPrTitlePrefix;
	progress: SubmitProgress;
}): Promise<SubmitBranchOutcome> {
	input.progress.phase({
		type: "phase-started",
		phaseKey: "inventory",
		label: "inspecting branch target",
	});
	const facts = await input.context.repository.readFacts({ cwd: input.cwd });
	if (!facts.ok) return failed("inspection", facts.error);
	if (facts.value.branch === facts.value.trunk) {
		return failed("inspection", {
			code: "branch-submit-trunk-refused",
			message: `Refusing to submit trunk branch ${facts.value.trunk}.`,
		});
	}
	const lookup = await input.context.pullRequests.findOpenByHead({
		cwd: input.cwd,
		branch: facts.value.branch,
	});
	if (!lookup.ok) return failed("inspection", lookup.error);
	if (lookup.value.type === "ambiguous") {
		return failed("inspection", {
			code: "branch-submit-pr-ambiguous",
			message: `GitHub reported more than one open PR for ${facts.value.branch}: ${lookup.value.candidates.map((candidate) => `#${candidate.number}`).join(", ")}. Close the duplicate PR or repair its head branch before submitting.`,
		});
	}

	input.progress.matrix?.setRows([
		{
			branch: facts.value.branch,
			label:
				lookup.value.type === "found"
					? `${facts.value.branch} (#${lookup.value.pullRequest.number})`
					: facts.value.branch,
			kind: lookup.value.type === "found" ? "existing" : "new",
			...(lookup.value.type === "found"
				? {
						pr: { label: `#${lookup.value.pullRequest.number}`, url: lookup.value.pullRequest.url },
					}
				: {}),
		},
	]);
	input.progress.phase({
		type: "phase-done",
		phaseKey: "inventory",
		detail: "branch target inspected",
	});

	let prepared: { title: string; body: string } | undefined;
	if (lookup.value.type === "missing" || input.replaceExistingMetadata) {
		input.progress.phase({
			type: "phase-started",
			phaseKey: "inventories",
			label: "preparing complete PR metadata",
		});
		const generation = await resolvePrInventoryGeneration({
			env: input.prInventory.env,
			cwd: input.cwd,
			git: input.prInventory.git,
			descriptorSource: input.prInventory.descriptorSource,
			modelSelection: input.prInventory.modelSelection,
		});
		if (!generation.ok)
			return failed("metadata", {
				code: "branch-submit-metadata-resolution-failed",
				message: generation.error,
			});
		const inventory = await withActiveOperations(
			input.progress.matrix?.setActiveOperations,
			[
				modelOperation(
					"generating PR inventory",
					formatModelRef(generation.modelSelection),
					facts.value.branch,
				),
			],
			() =>
				preparePrInventory({
					textGenerator: input.prInventory.textGenerator,
					modelSelection: generation.modelSelection,
					promptText: generation.promptText,
					context: {
						kind: "local",
						title: facts.value.commitHeadlines[0] ?? facts.value.branch,
						headRefName: facts.value.branch,
						baseRefName: facts.value.trunk,
						commitMessages: facts.value.commitHeadlines.map((headline) => ({ headline })),
						diff: facts.value.diff,
					},
					...optionalEntry("time", input.prInventory.time),
				}),
		);
		if (!inventory.ok)
			return failed("metadata", {
				code: "branch-submit-metadata-generation-failed",
				message: inventory.error,
			});
		prepared = {
			title:
				lookup.value.type === "missing" && input.titlePrefix !== undefined
					? composePrefixedPrTitle(input.titlePrefix, inventory.title)
					: inventory.title,
			body: assemblePrInventoryBody({
				inventory: inventory.body,
				source: "submit",
				promptSource: generation.promptSource,
				modelSelection: generation.modelSelection,
			}),
		};
		input.progress.phase({
			type: "phase-done",
			phaseKey: "inventories",
			detail: "PR metadata ready",
		});
	}

	input.progress.phase({ type: "phase-started", phaseKey: "submit", label: "pushing branch" });
	const pushFacts = await input.context.repository.readFacts({ cwd: input.cwd });
	if (!pushFacts.ok) return failed("inspection", pushFacts.error);
	if (
		pushFacts.value.branch !== facts.value.branch ||
		pushFacts.value.headOid !== facts.value.headOid
	) {
		return failed("inspection", {
			code: "branch-submit-local-drift",
			message: `Current branch or HEAD changed while preparing submission (expected ${facts.value.branch}@${facts.value.headOid}, observed ${pushFacts.value.branch}@${pushFacts.value.headOid}); refusing to push.`,
		});
	}
	const pushed = await input.context.repository.pushExact({
		cwd: input.cwd,
		branch: facts.value.branch,
		headOid: facts.value.headOid,
	});
	if (!pushed.ok) return failed("push", pushed.error);

	if (lookup.value.type === "missing") {
		if (prepared === undefined)
			throw new Error("New branch PR metadata was not prepared before push.");
		const created = await input.context.pullRequests.create({
			cwd: input.cwd,
			head: facts.value.branch,
			base: facts.value.trunk,
			title: prepared.title,
			body: prepared.body,
		});
		if (!created.ok) {
			const recovered = await recoverCreatedPullRequest(input, facts.value);
			if (!recovered.ok) {
				return {
					type: "pushed-pr-create-failed",
					branch: facts.value.branch,
					headOid: facts.value.headOid,
					error: {
						code: created.error.code,
						message: `${created.error.message} Re-query after the create failure did not find one matching open PR: ${recovered.error.message}`,
						...optionalEntry("displayCommand", created.error.displayCommand),
					},
				};
			}
			input.progress.phase({
				type: "phase-done",
				phaseKey: "submit",
				detail: "branch pushed and concurrently created PR verified",
			});
			return { type: "submitted", pullRequest: recovered.value, metadataReplaced: true };
		}
		const verified = await input.context.pullRequests.read({
			cwd: input.cwd,
			number: created.value.number,
		});
		if (!verified.ok) {
			return {
				type: "pushed-pr-create-failed",
				branch: facts.value.branch,
				headOid: facts.value.headOid,
				error: verified.error,
			};
		}
		const mismatch = verifyPullRequest(verified.value, facts.value);
		if (mismatch !== undefined) {
			return {
				type: "pushed-pr-create-failed",
				branch: facts.value.branch,
				headOid: facts.value.headOid,
				error: mismatch,
			};
		}
		input.progress.phase({
			type: "phase-done",
			phaseKey: "submit",
			detail: "branch pushed and PR created",
		});
		return { type: "submitted", pullRequest: verified.value, metadataReplaced: true };
	}

	const verified = await input.context.pullRequests.read({
		cwd: input.cwd,
		number: lookup.value.pullRequest.number,
	});
	if (!verified.ok)
		return {
			type: "pushed-pr-metadata-failed",
			pullRequest: lookup.value.pullRequest,
			error: verified.error,
		};
	const mismatch = verifyPullRequest(verified.value, facts.value);
	if (mismatch !== undefined)
		return { type: "pushed-pr-metadata-failed", pullRequest: verified.value, error: mismatch };
	let finalPullRequest = verified.value;
	if (prepared !== undefined) {
		const edited = await input.context.pullRequests.edit({
			cwd: input.cwd,
			number: verified.value.number,
			title: prepared.title,
			body: prepared.body,
		});
		if (!edited.ok)
			return {
				type: "pushed-pr-metadata-failed",
				pullRequest: verified.value,
				error: edited.error,
			};
		const readBack = await input.context.pullRequests.read({
			cwd: input.cwd,
			number: verified.value.number,
		});
		if (!readBack.ok)
			return {
				type: "pushed-pr-metadata-failed",
				pullRequest: verified.value,
				error: readBack.error,
			};
		const identityMismatch = verifyPullRequest(readBack.value, facts.value);
		if (identityMismatch !== undefined)
			return {
				type: "pushed-pr-metadata-failed",
				pullRequest: readBack.value,
				error: identityMismatch,
			};
		if (readBack.value.title !== prepared.title || readBack.value.body !== prepared.body)
			return {
				type: "pushed-pr-metadata-failed",
				pullRequest: readBack.value,
				error: {
					code: "branch-submit-pr-metadata-verification-failed",
					message: `PR #${readBack.value.number} did not retain the requested complete title and body after editing.`,
				},
			};
		finalPullRequest = readBack.value;
	}
	input.progress.phase({ type: "phase-done", phaseKey: "submit", detail: "branch pushed" });
	return {
		type: "submitted",
		pullRequest: finalPullRequest,
		metadataReplaced: prepared !== undefined,
	};
}

async function recoverCreatedPullRequest(
	input: Pick<Parameters<typeof submitBranch>[0], "cwd" | "context">,
	facts: BranchSubmitRepositoryFacts,
): Promise<BranchSubmitResult<BranchSubmitPullRequest>> {
	const lookup = await input.context.pullRequests.findOpenByHead({
		cwd: input.cwd,
		branch: facts.branch,
	});
	if (!lookup.ok) return lookup;
	if (lookup.value.type !== "found") {
		return {
			ok: false,
			error: {
				code: "branch-submit-pr-create-race-unresolved",
				message:
					lookup.value.type === "ambiguous"
						? `GitHub reported multiple open PRs (${lookup.value.candidates.map((candidate) => `#${candidate.number}`).join(", ")}).`
						: "GitHub still reported no open PR for the pushed branch.",
			},
		};
	}
	const mismatch = verifyPullRequest(lookup.value.pullRequest, facts);
	return mismatch === undefined
		? { ok: true, value: lookup.value.pullRequest }
		: { ok: false, error: mismatch };
}

function verifyPullRequest(
	pullRequest: BranchSubmitPullRequest,
	facts: BranchSubmitRepositoryFacts,
): BranchSubmitError | undefined {
	if (
		pullRequest.headRefName === facts.branch &&
		pullRequest.baseRefName === facts.trunk &&
		pullRequest.headOid === facts.headOid
	)
		return undefined;
	return {
		code: "branch-submit-pr-verification-failed",
		message: `PR #${pullRequest.number} did not verify as ${facts.branch}@${facts.headOid} targeting ${facts.trunk}.`,
	};
}

function failed(
	stage: Extract<SubmitBranchOutcome, { type: "failed" }>["stage"],
	error: BranchSubmitError,
): SubmitBranchOutcome {
	return { type: "failed", stage, error };
}

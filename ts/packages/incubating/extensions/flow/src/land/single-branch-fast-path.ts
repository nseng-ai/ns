import type { NsCommandIo } from "@nseng-ai/sdk";
import {
	executeSingleBranchLanding,
	isSingleBranchFastPath,
	type SingleBranchLandingOutcome,
} from "./execution/single-branch-landing.ts";
import type {
	LandConfirmationRequest,
	LandExecutionMessageProgress,
} from "./execution/host-seams.ts";
import type { PostLandingCleanupRequest } from "./execution/post-landing-cleanup.ts";
import { setStatus } from "./land-presentation.ts";
import {
	createFlowLandConfirmationGateway,
	createUpfrontApprovedLandConfirmationGateway,
} from "./flow-land-confirmation-gateway.ts";
import type { PrintAwareLandStackCommandContext } from "./stack/types.ts";
import type { LandContext, LandingShape } from "./types.ts";

export interface ValidPullRequestView {
	number: number;
	headRefName: string;
	baseRefName: string;
	title: string;
	body: string;
	headRefOid: string;
}

interface RunSingleBranchFastPathLandingOptions {
	landContext: LandContext;
	ctx: PrintAwareLandStackCommandContext;
	target: LandingShape;
	isDryRun: boolean;
	cleanup: PostLandingCleanupRequest;
	approvedConfirmationKinds: ReadonlySet<LandConfirmationRequest["kind"]>;
	progressIo?: NsCommandIo;
}

export { isSingleBranchFastPath };

export interface SingleBranchFastPathLandingResult {
	readonly outcome: SingleBranchLandingOutcome;
	readonly chosenCleanupPolicy?: PostLandingCleanupRequest["policy"];
}

export async function runSingleBranchFastPathLanding(
	options: RunSingleBranchFastPathLandingOptions,
): Promise<SingleBranchFastPathLandingResult> {
	const outcome = await executeSingleBranchLanding({
		context: options.landContext,
		host: {
			confirmation: createUpfrontApprovedLandConfirmationGateway(
				createFlowLandConfirmationGateway(options.ctx),
				options.approvedConfirmationKinds,
			),
			progress: singleBranchLandingProgress(options.ctx, options.progressIo),
		},
		target: options.target,
		isDryRun: options.isDryRun,
		cleanup: options.cleanup,
	});
	return {
		outcome,
		...(outcome.type === "completed" &&
		outcome.result === "merged" &&
		outcome.chosenCleanupPolicy !== undefined
			? { chosenCleanupPolicy: outcome.chosenCleanupPolicy }
			: {}),
	};
}

function singleBranchLandingProgress(
	ctx: PrintAwareLandStackCommandContext,
	progressIo: NsCommandIo | undefined,
): LandExecutionMessageProgress {
	return {
		note(message): void {
			progressIo?.message(message);
		},
		setStatus(message): void {
			if (progressIo !== undefined) {
				if (message !== undefined) progressIo.phase(message);
				return;
			}
			setStatus(ctx, message);
		},
	};
}

export function parsePullRequestView(value: unknown): ValidPullRequestView | { error: string } {
	if (!isRecord(value)) {
		return { error: "gh pr view did not return a PR object. Merge not attempted." };
	}

	const number =
		typeof value.number === "number" && Number.isFinite(value.number) ? value.number : undefined;
	const headRefName = nonEmptyString(value.headRefName) ? value.headRefName : undefined;
	const baseRefName = nonEmptyString(value.baseRefName) ? value.baseRefName : undefined;
	const title = nonEmptyString(value.title) ? value.title : undefined;
	const headRefOid = nonEmptyString(value.headRefOid) ? value.headRefOid : undefined;

	const missingFields: string[] = [];
	if (number === undefined) missingFields.push("number");
	if (headRefName === undefined) missingFields.push("headRefName");
	if (baseRefName === undefined) missingFields.push("baseRefName");
	if (title === undefined) missingFields.push("title");
	if (headRefOid === undefined) missingFields.push("headRefOid");

	if (
		number === undefined ||
		headRefName === undefined ||
		baseRefName === undefined ||
		title === undefined ||
		headRefOid === undefined
	) {
		return {
			error: `gh pr view did not return required field(s): ${missingFields.join(", ")}. Merge not attempted.`,
		};
	}

	const body = value.body;
	if (body !== undefined && body !== null && typeof body !== "string") {
		return { error: "gh pr view returned a non-string body. Merge not attempted." };
	}

	return {
		number,
		headRefName,
		baseRefName,
		title,
		body: typeof body === "string" ? body : "",
		headRefOid,
	};
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

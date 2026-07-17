import type {
	CurrentPrVerificationResult,
	SubmitCommandParams,
	SubmitGateway,
	SubmitPreflightResult,
	SubmitRestackResult,
	SubmitRunResult,
} from "./submit-contracts.ts";

export type SubmitTransportStage =
	| "readiness"
	| "restack"
	| "readiness-recheck"
	| "submit"
	| "verification";

export type SubmitTransportGateway = Pick<
	SubmitGateway,
	"checkSubmitReadiness" | "restackCurrentStack" | "submitCurrentStack" | "verifyCurrentPr"
>;

export type SubmitTransportObservation =
	| { type: "stage-started"; stage: SubmitTransportStage }
	| { type: "stage-completed"; stage: SubmitTransportStage };

export type SubmitTransportObservationSink = (observation: SubmitTransportObservation) => void;

type FailedReadinessOutcome = Extract<SubmitPreflightResult, { kind: "failed" }>;
type FailedReadinessRecheckOutcome = Exclude<SubmitPreflightResult, { kind: "ready" }>;
type FailedRestackOutcome = Exclude<SubmitRestackResult, { kind: "success" }>;
type FailedSubmitOutcome = Extract<SubmitRunResult, { kind: "failed" }>;
type SuccessfulSubmitOutcome = Extract<SubmitRunResult, { kind: "success" }>;
type RestackRequiredOutcome = Extract<SubmitPreflightResult, { kind: "restack_required" }>;

export type SubmitTransportFailure =
	| {
			kind: "failed";
			stage: "readiness";
			outcome: FailedReadinessOutcome;
	  }
	| {
			kind: "failed";
			stage: "restack";
			outcome: FailedRestackOutcome;
	  }
	| {
			kind: "failed";
			stage: "readiness-recheck";
			outcome: FailedReadinessRecheckOutcome;
	  }
	| {
			kind: "failed";
			stage: "submit";
			outcome: FailedSubmitOutcome;
	  };

declare const submitTransportStateBrand: unique symbol;

interface SubmitTransportState {
	readonly [submitTransportStateBrand]: true;
}

export interface SubmitTransportRestackRequired extends SubmitTransportState {
	readonly kind: "restack-required";
	readonly outcome: RestackRequiredOutcome;
	restackAndRecheck(params: {
		restack: SubmitCommandParams;
		readinessRecheck: SubmitCommandParams;
	}): Promise<
		| SubmitTransportReady
		| Extract<SubmitTransportFailure, { stage: "restack" | "readiness-recheck" }>
	>;
}

export interface SubmitTransportReady extends SubmitTransportState {
	readonly kind: "ready";
	submitPrimary(
		params: SubmitCommandParams,
	): Promise<SubmitTransportSubmitted | Extract<SubmitTransportFailure, { stage: "submit" }>>;
}

export interface SubmitTransportSubmitted extends SubmitTransportState {
	readonly kind: "submitted";
	readonly outcome: SuccessfulSubmitOutcome;
	verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult>;
}

export type SubmitTransportPreparation =
	| Extract<SubmitTransportFailure, { stage: "readiness" }>
	| SubmitTransportRestackRequired
	| SubmitTransportReady;

export async function prepareSubmitTransport(options: {
	gateway: SubmitTransportGateway;
	params: SubmitCommandParams;
	observationSink?: SubmitTransportObservationSink;
}): Promise<SubmitTransportPreparation> {
	const outcome = await observeStage(options.observationSink, "readiness", () =>
		options.gateway.checkSubmitReadiness(options.params),
	);
	if (outcome.kind === "failed") {
		return { kind: "failed", stage: "readiness", outcome };
	}
	if (outcome.kind === "restack_required") {
		return new RestackRequiredState(options.gateway, options.observationSink, outcome);
	}
	return new ReadyState(options.gateway, options.observationSink);
}

class RestackRequiredState implements SubmitTransportRestackRequired {
	declare readonly [submitTransportStateBrand]: true;
	readonly kind = "restack-required" as const;
	readonly outcome: RestackRequiredOutcome;
	private readonly gateway: SubmitTransportGateway;
	private readonly observationSink: SubmitTransportObservationSink | undefined;

	constructor(
		gateway: SubmitTransportGateway,
		observationSink: SubmitTransportObservationSink | undefined,
		outcome: RestackRequiredOutcome,
	) {
		this.gateway = gateway;
		this.observationSink = observationSink;
		this.outcome = outcome;
	}

	async restackAndRecheck(params: {
		restack: SubmitCommandParams;
		readinessRecheck: SubmitCommandParams;
	}): Promise<
		| SubmitTransportReady
		| Extract<SubmitTransportFailure, { stage: "restack" | "readiness-recheck" }>
	> {
		const restack = await observeStage(this.observationSink, "restack", () =>
			this.gateway.restackCurrentStack(params.restack),
		);
		if (restack.kind !== "success") {
			return { kind: "failed", stage: "restack", outcome: restack };
		}

		const readiness = await observeStage(this.observationSink, "readiness-recheck", () =>
			this.gateway.checkSubmitReadiness(params.readinessRecheck),
		);
		if (readiness.kind !== "ready") {
			return { kind: "failed", stage: "readiness-recheck", outcome: readiness };
		}
		return new ReadyState(this.gateway, this.observationSink);
	}
}

class ReadyState implements SubmitTransportReady {
	declare readonly [submitTransportStateBrand]: true;
	readonly kind = "ready" as const;
	private readonly gateway: SubmitTransportGateway;
	private readonly observationSink: SubmitTransportObservationSink | undefined;

	constructor(
		gateway: SubmitTransportGateway,
		observationSink: SubmitTransportObservationSink | undefined,
	) {
		this.gateway = gateway;
		this.observationSink = observationSink;
	}

	async submitPrimary(
		params: SubmitCommandParams,
	): Promise<SubmitTransportSubmitted | Extract<SubmitTransportFailure, { stage: "submit" }>> {
		const outcome = await observeStage(this.observationSink, "submit", () =>
			this.gateway.submitCurrentStack(params),
		);
		if (outcome.kind === "failed") {
			return { kind: "failed", stage: "submit", outcome };
		}
		return new SubmittedState(this.gateway, this.observationSink, outcome);
	}
}

class SubmittedState implements SubmitTransportSubmitted {
	declare readonly [submitTransportStateBrand]: true;
	readonly kind = "submitted" as const;
	readonly outcome: SuccessfulSubmitOutcome;
	private readonly gateway: SubmitTransportGateway;
	private readonly observationSink: SubmitTransportObservationSink | undefined;

	constructor(
		gateway: SubmitTransportGateway,
		observationSink: SubmitTransportObservationSink | undefined,
		outcome: SuccessfulSubmitOutcome,
	) {
		this.gateway = gateway;
		this.observationSink = observationSink;
		this.outcome = outcome;
	}

	async verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult> {
		return await observeStage(this.observationSink, "verification", () =>
			this.gateway.verifyCurrentPr(params),
		);
	}
}

async function observeStage<Result>(
	sink: SubmitTransportObservationSink | undefined,
	stage: SubmitTransportStage,
	run: () => Promise<Result>,
): Promise<Result> {
	reportObservation(sink, { type: "stage-started", stage });
	try {
		return await run();
	} finally {
		reportObservation(sink, { type: "stage-completed", stage });
	}
}

function reportObservation(
	sink: SubmitTransportObservationSink | undefined,
	observation: SubmitTransportObservation,
): void {
	try {
		sink?.(observation);
	} catch {
		// Observation is deliberately non-controlling; telemetry failures cannot alter submission.
	}
}

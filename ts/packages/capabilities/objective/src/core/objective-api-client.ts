import type { ObjectiveCliContext } from "./context.ts";
import { createRealObjectiveContext } from "./context.ts";
import {
	buildObjectiveListResult,
	matchesStatusFilter,
	type ListObjectivesRequest,
	type ObjectiveListResult,
} from "./operations/list-objectives.ts";
import { readObjectiveRecord, type ReadObjectiveResult } from "./operations/read-objective.ts";
import type { ObjectiveRecordStatus } from "./storage.ts";

export interface ObjectiveApiFailure {
	errorType: string;
	message: string;
}

export type ObjectiveListing =
	| { ok: true; result: ObjectiveListResult }
	| { ok: false; failure: ObjectiveApiFailure };

export type ObjectiveRead =
	| { ok: true; result: ReadObjectiveResult }
	| { ok: false; failure: ObjectiveApiFailure };

export interface ObjectiveCandidate {
	slug: string;
	status: ObjectiveRecordStatus;
}

export type ObjectiveCandidates =
	| { ok: true; candidates: readonly ObjectiveCandidate[] }
	| { ok: false; failure: ObjectiveApiFailure };

export interface ObjectiveClientOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	/** Inject a prebuilt Domain Core context (gateways) instead of constructing a real one. */
	context?: ObjectiveCliContext;
}

/**
 * In-process facade over the objective Domain Core. Mirrors the `@nseng-ai/slot/api`
 * client shape: a single factory returning a typed client whose methods resolve
 * the gateway-injected context lazily and return clean ok/failure results.
 */
export interface ObjectiveClient {
	/** List checkout-local Objective records (defaults to active status). */
	listObjectives(request?: Partial<ListObjectivesRequest>): Promise<ObjectiveListing>;
	/** Read one Objective record by slug. */
	readObjective(slug: string): Promise<ObjectiveRead>;
	/** List active (open) Objective slugs for selection menus. */
	listActiveCandidates(): Promise<ObjectiveCandidates>;
}

const DEFAULT_LIST_REQUEST: ListObjectivesRequest = {
	names: false,
	status: "active",
	minimal: false,
};

export function createObjectiveClient(options: ObjectiveClientOptions): ObjectiveClient {
	return {
		async listObjectives(request) {
			const ctx = await resolveContext(options);
			const result = await buildObjectiveListResult(ctx, {
				...DEFAULT_LIST_REQUEST,
				...request,
			});
			if (result.type === "ok") return { ok: true, result: result.value };
			return { ok: false, failure: toFailure(result.error) };
		},
		async readObjective(slug) {
			const ctx = await resolveContext(options);
			const result = await readObjectiveRecord(ctx.storage, slug);
			if (result.type === "ok") return { ok: true, result: result.value };
			return { ok: false, failure: toFailure(result.error) };
		},
		async listActiveCandidates() {
			const ctx = await resolveContext(options);
			const inventory = await ctx.storage.checkoutInventory();
			if (!inventory.ok) return { ok: false, failure: toFailure(inventory.error) };
			return {
				ok: true,
				candidates: inventory.value.records
					.filter((record) => matchesStatusFilter(record.status, "active"))
					.map((record) => ({ slug: record.slug, status: record.status })),
			};
		},
	};
}

async function resolveContext(options: ObjectiveClientOptions): Promise<ObjectiveCliContext> {
	if (options.context !== undefined) return options.context;
	return await createRealObjectiveContext({
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env as NodeJS.ProcessEnv }),
	});
}

function toFailure(error: { code: string; message: string }): ObjectiveApiFailure {
	return { errorType: error.code, message: error.message };
}

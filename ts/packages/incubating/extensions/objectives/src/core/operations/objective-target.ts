import {
	parseObjectiveSelector,
	renderObjectiveLocator,
	type ObjectiveLocator,
} from "../identity.ts";
import type { ObjectiveOwnerGateway } from "../owner-gateway.ts";
import {
	activeRootRelativePath,
	findRecordLocation,
	ownerNestedRecordRelativePath,
	type ObjectiveCheckoutInventory,
	type ObjectiveRecordLocation,
	type ObjectiveStorage,
	type ObjectiveStorageError,
} from "../storage.ts";

/**
 * Central single-record resolution for every public and hidden Objective
 * surface. Input is an Objective Locator selector: a full `<owner>/<slug>`
 * locator resolves directly from discovered inventory (no authentication),
 * while a bare slug resolves only inside the authenticated owner's namespace —
 * never by searching other owners.
 */

type ObjectiveTargetStatus =
	| "missing-slug"
	| "invalid-slug"
	| "owner-unavailable"
	| "not-found"
	| "found";

interface ObjectiveTargetBase {
	status: ObjectiveTargetStatus;
	rootPath: string;
	hasRoot: boolean;
	owner: string | null;
	slug: string | null;
	/** Canonical rendered locator once the selector resolves to one. */
	locator: string | null;
	path: string | null;
	/** Actionable detail for invalid-slug and owner-unavailable statuses. */
	message?: string;
}

export interface ObjectiveRecordTargetFound extends ObjectiveTargetBase {
	status: "found";
	owner: string;
	slug: string;
	locator: string;
	path: string;
	location: ObjectiveRecordLocation;
}

export type ObjectiveRecordTarget =
	| ObjectiveRecordTargetFound
	| (ObjectiveTargetBase & {
			status: "missing-slug" | "invalid-slug" | "owner-unavailable" | "not-found";
	  });

export type ObjectiveRecordTargetResolution =
	| { type: "ok"; value: ObjectiveRecordTarget }
	| { type: "storage-error"; error: ObjectiveStorageError };

export type EmptyObjectiveTargetFields = Omit<ObjectiveTargetBase, "status">;

export function targetToEmptyResultFields(
	target: ObjectiveRecordTarget,
): EmptyObjectiveTargetFields {
	return {
		rootPath: target.rootPath,
		hasRoot: target.hasRoot,
		owner: target.owner,
		slug: target.slug,
		locator: target.locator,
		path: target.path,
		...(target.message === undefined ? {} : { message: target.message }),
	};
}

export interface ResolveObjectiveRecordTargetOptions {
	/** Reuse an already-discovered inventory instead of rescanning storage. */
	inventory?: ObjectiveCheckoutInventory;
}

export async function resolveObjectiveRecordTarget(
	storage: ObjectiveStorage,
	ownerGateway: ObjectiveOwnerGateway,
	selector: string | undefined,
	options: ResolveObjectiveRecordTargetOptions = {},
): Promise<ObjectiveRecordTargetResolution> {
	const rootPath = activeRootRelativePath();
	const rootPresence = await storage.activeRootExists();
	if (!rootPresence.ok) return { type: "storage-error", error: rootPresence.error };
	const hasRoot = rootPresence.value;

	const empty = (
		status: Exclude<ObjectiveTargetStatus, "found" | "not-found">,
		fields: Partial<EmptyObjectiveTargetFields> = {},
	): ObjectiveRecordTargetResolution => ({
		type: "ok",
		value: {
			status,
			rootPath,
			hasRoot,
			owner: null,
			slug: null,
			locator: null,
			path: null,
			...fields,
		},
	});

	if (selector === undefined) return empty("missing-slug");

	const parsed = parseObjectiveSelector(selector);
	if (parsed.type === "invalid") return empty("invalid-slug", { message: parsed.message });

	let locator: ObjectiveLocator;
	if (parsed.type === "locator") {
		locator = parsed.locator;
	} else {
		const currentOwner = await ownerGateway.resolveAuthenticatedOwner();
		if (currentOwner.type === "unavailable") {
			return empty("owner-unavailable", {
				slug: parsed.slug,
				message: `${currentOwner.message} Bare Objective slugs resolve only inside the authenticated owner's namespace; pass a full <owner>/<slug> locator.`,
			});
		}
		locator = { owner: currentOwner.owner, slug: parsed.slug };
	}

	let inventory = options.inventory;
	if (inventory === undefined) {
		const discovered = await storage.checkoutInventory();
		if (!discovered.ok) return { type: "storage-error", error: discovered.error };
		inventory = discovered.value;
	}
	const location = findRecordLocation(inventory.records, locator);
	if (location === null) {
		return {
			type: "ok",
			value: {
				status: "not-found",
				rootPath,
				hasRoot,
				owner: locator.owner,
				slug: locator.slug,
				locator: renderObjectiveLocator(locator),
				path: ownerNestedRecordRelativePath(locator),
			},
		};
	}
	return {
		type: "ok",
		value: {
			status: "found",
			rootPath,
			hasRoot,
			owner: location.owner,
			slug: location.slug,
			locator: location.locator,
			path: location.recordRelativePath,
			location,
		},
	};
}

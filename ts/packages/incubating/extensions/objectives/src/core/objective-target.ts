import {
	activeRecordRelativePath,
	activeRootRelativePath,
	isValidObjectiveSlug,
	type ObjectiveStorage,
	type ObjectiveStorageError,
} from "./storage.ts";

type ObjectiveTargetStatus = "missing-slug" | "invalid-slug" | "not-found" | "found";

interface ObjectiveTargetBase {
	status: ObjectiveTargetStatus;
	rootPath: string;
	hasRoot: boolean;
	slug: string | null;
	path: string | null;
}

export interface ObjectiveRecordTargetFound extends ObjectiveTargetBase {
	status: "found";
	slug: string;
	path: string;
}

export type ObjectiveRecordTarget =
	| ObjectiveRecordTargetFound
	| (ObjectiveTargetBase & { status: "missing-slug" | "invalid-slug" | "not-found" });

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
		slug: target.slug,
		path: target.path,
	};
}

export async function resolveObjectiveRecordTarget(
	storage: ObjectiveStorage,
	slug: string | undefined,
): Promise<ObjectiveRecordTargetResolution> {
	const rootPath = activeRootRelativePath();
	const rootPresence = await storage.activeRootExists();
	if (!rootPresence.ok) return { type: "storage-error", error: rootPresence.error };
	const hasRoot = rootPresence.value;

	if (slug === undefined) {
		return {
			type: "ok",
			value: { status: "missing-slug", rootPath, hasRoot, slug: null, path: null },
		};
	}
	if (!isValidObjectiveSlug(slug)) {
		return {
			type: "ok",
			value: { status: "invalid-slug", rootPath, hasRoot, slug: null, path: null },
		};
	}

	const path = activeRecordRelativePath(slug);
	const recordExists = await storage.activeRecordExists(slug);
	if (!recordExists.ok) return { type: "storage-error", error: recordExists.error };
	if (!recordExists.value) {
		return {
			type: "ok",
			value: { status: "not-found", rootPath, hasRoot, slug, path },
		};
	}
	return {
		type: "ok",
		value: { status: "found", rootPath, hasRoot, slug, path },
	};
}

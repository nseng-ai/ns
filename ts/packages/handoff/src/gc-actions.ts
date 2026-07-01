export type DeletedBranchGarbageCollectionAction =
	| "keptActive"
	| "wouldDelete"
	| "deleted"
	| "error";

export type DeletedBranchGarbageCollectionCountKey = "wouldDelete" | "deleted" | "kept" | "error";

const DELETED_BRANCH_GARBAGE_COLLECTION_ACTION_METADATA = [
	{
		action: "keptActive",
		wireValue: "kept-active",
		label: "kept active",
		isCandidate: false,
		countKey: "kept",
	},
	{
		action: "wouldDelete",
		wireValue: "would-delete",
		label: "would delete",
		isCandidate: true,
		countKey: "wouldDelete",
	},
	{
		action: "deleted",
		wireValue: "deleted",
		label: "deleted",
		isCandidate: true,
		countKey: "deleted",
	},
	{
		action: "error",
		wireValue: "error",
		label: "error",
		isCandidate: true,
		countKey: "error",
	},
] as const satisfies readonly {
	action: DeletedBranchGarbageCollectionAction;
	wireValue: string;
	label: string;
	isCandidate: boolean;
	countKey: DeletedBranchGarbageCollectionCountKey;
}[];

export type DeletedBranchGarbageCollectionActionMetadata =
	(typeof DELETED_BRANCH_GARBAGE_COLLECTION_ACTION_METADATA)[number];
export type DeletedBranchGarbageCollectionWireAction =
	DeletedBranchGarbageCollectionActionMetadata["wireValue"];

export function deletedBranchGarbageCollectionMetadataForAction(
	action: DeletedBranchGarbageCollectionAction,
): DeletedBranchGarbageCollectionActionMetadata {
	return requiredDeletedBranchGarbageCollectionActionMetadata(
		DELETED_BRANCH_GARBAGE_COLLECTION_ACTION_METADATA.find(
			(metadata) => metadata.action === action,
		),
		action,
	);
}

export function deletedBranchGarbageCollectionMetadataForWireAction(
	action: DeletedBranchGarbageCollectionWireAction,
): DeletedBranchGarbageCollectionActionMetadata {
	return requiredDeletedBranchGarbageCollectionActionMetadata(
		DELETED_BRANCH_GARBAGE_COLLECTION_ACTION_METADATA.find(
			(metadata) => metadata.wireValue === action,
		),
		action,
	);
}

export function deletedBranchGarbageCollectionWireValues(): [
	DeletedBranchGarbageCollectionWireAction,
	...DeletedBranchGarbageCollectionWireAction[],
] {
	return DELETED_BRANCH_GARBAGE_COLLECTION_ACTION_METADATA.map(
		(metadata) => metadata.wireValue,
	) as [DeletedBranchGarbageCollectionWireAction, ...DeletedBranchGarbageCollectionWireAction[]];
}

function requiredDeletedBranchGarbageCollectionActionMetadata(
	metadata: DeletedBranchGarbageCollectionActionMetadata | undefined,
	action: DeletedBranchGarbageCollectionAction | DeletedBranchGarbageCollectionWireAction,
): DeletedBranchGarbageCollectionActionMetadata {
	if (metadata === undefined) throw new Error(`Unknown handoff gc action: ${action}`);
	return metadata;
}

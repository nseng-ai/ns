import { duplicateValues } from "./duplicate-values.ts";

export interface NonEmptyStringCollectionValidationOptions {
	commandName: string;
	emptyItemLabel: string;
	itemLabel: string;
	duplicateCollectionLabel: string;
}

export function nonEmptyStringCollectionValidationMessage(
	values: readonly string[],
	options: NonEmptyStringCollectionValidationOptions,
): string | null {
	if (values.length === 0) {
		return `${options.commandName} requires at least one ${options.emptyItemLabel}.`;
	}
	if (!values.every((value) => value.trim() !== "")) {
		return `${options.commandName} requires every ${options.itemLabel} to be non-empty.`;
	}
	const duplicates = duplicateValues(values);
	if (duplicates.length > 0) {
		return `${options.commandName} ${options.duplicateCollectionLabel} contain duplicates: ${duplicates.join(", ")}`;
	}
	return null;
}

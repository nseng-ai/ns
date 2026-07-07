import { sortStrings } from "@nseng-ai/harness-artifacts/api";

export { sortStrings };

export function uniqueSortedStrings(values: readonly string[]): string[] {
	return sortStrings([...new Set(values)]);
}

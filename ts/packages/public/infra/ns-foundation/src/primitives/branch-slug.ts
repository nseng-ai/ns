export const MAX_BRANCH_SLUG_LENGTH = 50;

export function normalizeBranchSlugText(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function sanitizeBranchName(value: string): string | undefined {
	const firstLine = value
		.replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z]*\n?|```/g, ""))
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) {
		return undefined;
	}

	return finalizeBranchSlug(normalizeBranchSlugText(firstLine));
}

export function trimBranchSlugToLength(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	return value.slice(0, maxLength).replace(/[-/]+$/g, "");
}

export function finalizeBranchSlug(value: string): string | undefined {
	const withoutPlanSuffix = value.replace(/(?:-plan)+$/g, "").replace(/^-|-$/g, "");
	if (!withoutPlanSuffix) {
		return undefined;
	}

	const trimmed = trimBranchSlugToLength(withoutPlanSuffix, MAX_BRANCH_SLUG_LENGTH)
		.replace(/(?:-plan)+$/g, "")
		.replace(/^-|-$/g, "");
	return trimmed || undefined;
}

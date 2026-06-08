import {
	finalizeBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	trimBranchSlugToLength,
} from "@asdl/pi-extension-runtime/branch-slug";

export { finalizeBranchSlug, MAX_BRANCH_SLUG_LENGTH, trimBranchSlugToLength };

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

export type ReviewDisplayRole = "tripwire" | "deep_review";

export function reviewDisplayRole(reviewName: string): ReviewDisplayRole {
	return reviewName.endsWith("-tripwire") ? "tripwire" : "deep_review";
}

export function reviewRoleLabel(reviewName: string): "Tripwire" | "Deep review" {
	return reviewDisplayRole(reviewName) === "tripwire" ? "Tripwire" : "Deep review";
}

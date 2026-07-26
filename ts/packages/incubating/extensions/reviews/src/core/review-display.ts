export type ReviewDisplayRole = "tripwire" | "deep_review";

export function reviewDisplayRole(modelProfile: string): ReviewDisplayRole {
	return modelProfile === "fast" ? "tripwire" : "deep_review";
}

export function reviewRoleLabel(modelProfile: string): "Tripwire" | "Deep review" {
	return reviewDisplayRole(modelProfile) === "tripwire" ? "Tripwire" : "Deep review";
}

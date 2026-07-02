export type RoasterReviewDisplayRole = "tripwire" | "deep_review";

export function roasterReviewDisplayRole(modelProfile: string): RoasterReviewDisplayRole {
	return modelProfile === "quick" ? "tripwire" : "deep_review";
}

export function roasterReviewRoleLabel(modelProfile: string): "Tripwire" | "Deep review" {
	return roasterReviewDisplayRole(modelProfile) === "tripwire" ? "Tripwire" : "Deep review";
}

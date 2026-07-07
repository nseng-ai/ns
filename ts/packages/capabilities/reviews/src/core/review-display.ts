export type ReviewsReviewDisplayRole = "tripwire" | "deep_review";

export function reviewsReviewDisplayRole(modelProfile: string): ReviewsReviewDisplayRole {
	return modelProfile === "quick" ? "tripwire" : "deep_review";
}

export function reviewsReviewRoleLabel(modelProfile: string): "Tripwire" | "Deep review" {
	return reviewsReviewDisplayRole(modelProfile) === "tripwire" ? "Tripwire" : "Deep review";
}

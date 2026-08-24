import type {
	GrillDecisionRoundInput,
	GrillRoundAnswer,
	GrillRoundInput,
	GrillRoundUiOutcome,
} from "./round-protocol.ts";

export type GrillRoundView = "question" | "freeform" | "status" | "review" | "confirmation";

export class GrillRoundController {
	readonly input: GrillRoundInput;
	private questionIndexValue = 0;
	private viewValue: GrillRoundView;
	private readonly answers: GrillRoundAnswer[];

	constructor(input: GrillRoundInput) {
		this.input = input;
		this.viewValue = input.mode === "confirmation" ? "confirmation" : "question";
		this.answers = input.mode === "confirmation" ? [] : recommendedAnswers(input);
	}

	get view(): GrillRoundView {
		return this.viewValue;
	}

	get questionIndex(): number {
		return this.questionIndexValue;
	}

	get currentAnswer(): GrillRoundAnswer | undefined {
		return this.answers[this.questionIndexValue];
	}

	get draftAnswers(): readonly GrillRoundAnswer[] {
		return this.answers.map((answer) => ({ ...answer }));
	}

	selectOption(optionIndex: number): void {
		if (this.input.mode !== "decision-round") return;
		const question = this.input.questions[this.questionIndexValue];
		const option = question?.options[optionIndex];
		if (question === undefined || option === undefined) return;
		this.answers[this.questionIndexValue] = {
			questionId: question.id,
			kind: "option",
			value: option.value,
			label: option.label,
			recommendation: option.value === question.recommendedOptionValue ? "retained" : "changed",
		};
	}

	openFreeform(): void {
		if (this.input.mode === "decision-round") this.viewValue = "freeform";
	}

	submitFreeform(value: string): boolean {
		if (this.input.mode !== "decision-round") return false;
		const question = this.input.questions[this.questionIndexValue];
		const trimmed = value.trim();
		if (question === undefined || trimmed.length === 0) return false;
		this.answers[this.questionIndexValue] = {
			questionId: question.id,
			kind: "freeform",
			value: trimmed,
			recommendation: "changed",
		};
		this.viewValue = "question";
		return true;
	}

	move(delta: number): void {
		if (this.input.mode !== "decision-round") return;
		this.viewValue = "question";
		this.questionIndexValue = Math.max(
			0,
			Math.min(this.input.questions.length - 1, this.questionIndexValue + delta),
		);
	}

	showStatus(): void {
		if (this.input.mode === "decision-round") this.viewValue = "status";
	}

	showReview(): void {
		if (this.input.mode === "decision-round") this.viewValue = "review";
	}

	returnToQuestion(): void {
		if (this.input.mode === "decision-round") this.viewValue = "question";
	}

	submit(): GrillRoundUiOutcome | undefined {
		if (this.input.mode !== "decision-round" || this.viewValue !== "review") return undefined;
		return { action: "submitted", answers: this.draftAnswers };
	}
}

function recommendedAnswers(input: GrillDecisionRoundInput): GrillRoundAnswer[] {
	return input.questions.map((question) => {
		const option = question.options.find(
			(candidate) => candidate.value === question.recommendedOptionValue,
		);
		if (option === undefined) {
			throw new Error(`Validated recommendation is missing for ${question.id}`);
		}
		return {
			questionId: question.id,
			kind: "option",
			value: option.value,
			label: option.label,
			recommendation: "retained",
		};
	});
}

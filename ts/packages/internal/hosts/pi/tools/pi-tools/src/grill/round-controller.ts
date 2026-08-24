import type {
	GrillDecisionRoundInput,
	GrillDecisionRoundUiOutcome,
	GrillRoundAnswer,
} from "./round-protocol.ts";

export type GrillRoundView = "question" | "freeform" | "status" | "review";

export class GrillRoundController {
	readonly input: GrillDecisionRoundInput;
	private questionIndexValue = 0;
	private viewValue: GrillRoundView = "question";
	private readonly answers: GrillRoundAnswer[];

	constructor(input: GrillDecisionRoundInput) {
		this.input = input;
		this.answers = recommendedAnswers(input);
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
		this.viewValue = "freeform";
	}

	submitFreeform(value: string): boolean {
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
		this.viewValue = "question";
		this.questionIndexValue = Math.max(
			0,
			Math.min(this.input.questions.length - 1, this.questionIndexValue + delta),
		);
	}

	showStatus(): void {
		this.viewValue = "status";
	}

	showReview(): void {
		this.viewValue = "review";
	}

	returnToQuestion(): void {
		this.viewValue = "question";
	}

	submit(): GrillDecisionRoundUiOutcome | undefined {
		if (this.viewValue !== "review") return undefined;
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

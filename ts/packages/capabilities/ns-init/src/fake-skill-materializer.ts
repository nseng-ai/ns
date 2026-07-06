import type {
	SkillMaterializeParams,
	SkillMaterializer,
	SkillMaterializeResult,
} from "./skill-materializer.ts";

export interface InMemorySkillMaterializerState {
	result?: SkillMaterializeResult;
}

export class InMemorySkillMaterializer implements SkillMaterializer {
	private readonly result: SkillMaterializeResult;
	private readonly materializeCalls: SkillMaterializeParams[] = [];

	constructor(state: InMemorySkillMaterializerState = {}) {
		this.result = state.result ?? { type: "materialized", installedSkillPaths: [] };
	}

	async materializeObjectiveSkills(
		params: SkillMaterializeParams,
	): Promise<SkillMaterializeResult> {
		this.materializeCalls.push({ repoRoot: params.repoRoot, harnesses: [...params.harnesses] });
		return this.result;
	}

	calls(): readonly SkillMaterializeParams[] {
		return [...this.materializeCalls];
	}
}

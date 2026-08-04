import { defineExtension } from "@nseng-ai/sdk";

export const flowExtensionDescriptor = defineExtension({
	description: "Checkpoint, branch, submit, and land Graphite-backed work.",
	commandDirectory: `${import.meta.dirname}/cli`,
	points: [
		{
			id: "flow.submit.pre",
			accepts: "hook",
			cardinality: "many",
			description: "Commands to run before flow submit checkpointing.",
		},
		{
			id: "flow.submit.pre.recovery",
			accepts: "prompt",
			cardinality: "one",
			default: "../submit/prompts/submit-check-recovery-default.md",
			description: "Agent guidance after a flow submit pre-check failure.",
		},
		{
			id: "flow.submit.pr-inventory",
			accepts: "prompt",
			cardinality: "one",
			default: "../submit/prompts/pr-inventory-default.md",
			description: "Prompt for generating pull request inventories during flow submit.",
		},
	],
});

export const flowExtensionDescriptorSource = {
	descriptor: flowExtensionDescriptor,
	descriptorUrl: import.meta.url,
};

export default flowExtensionDescriptor;

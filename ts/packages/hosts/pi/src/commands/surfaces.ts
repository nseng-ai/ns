import { IMPL_BRANCH_CONTEXT_COMMAND_NAME } from "@ns/core/command";

export {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME,
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
	specializedCommandBackedSkillsFromSpecs,
} from "@ns/core/command";
export type {
	CommandBackedSkillRegistration,
	CommandBackedSkillRegistrationKind,
	SpecializedCommandBackedSkillSpec,
} from "@ns/core/command";

const PI_COMMAND_SEGMENT_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export interface NsPiExtensionSurface {
	readonly extensionId: string;
	command(action: string): string;
}

export function nsPiCommandSurface(extensionId: string, action: string): string {
	assertValidPiCommandPart(extensionId, "extension id");
	for (const segment of action.split(":")) {
		assertValidPiCommandPart(segment, "action segment");
	}
	return `ns:${extensionId}:${action}`;
}

export function defineNsPiExtensionSurface(extensionId: string): NsPiExtensionSurface {
	assertValidPiCommandPart(extensionId, "extension id");
	return {
		extensionId,
		command(action: string): string {
			return nsPiCommandSurface(extensionId, action);
		},
	};
}

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}

function assertValidPiCommandPart(value: string, label: string): void {
	if (!PI_COMMAND_SEGMENT_PATTERN.test(value)) {
		throw new Error(
			`Invalid ns Pi command ${label}: ${JSON.stringify(value)}. Expected lowercase kebab-case without slashes or colons.`,
		);
	}
}

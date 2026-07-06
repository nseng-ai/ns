import type { AregProjectMutationPolicy } from "../gateways.ts";

interface AregProjectMutationPolicyDescriptor {
	policy: AregProjectMutationPolicy;
	isAllowedRelativePath(relativePath: string): boolean;
	refusedTargetCode: string;
	shouldCheckUnsupportedFirst: boolean;
	unsupportedMessage(relativePath: string, description: string): string;
	unsafeMessage(relativePath: string, description: string): string;
	outsideMessage(relativePath: string, description: string): string;
	symlinkCode: string;
	notFileCode: string;
	parentSymlinkCode: string;
	parentNotDirectoryCode: string;
	parentMissingCode: string;
	parentCreateFailedCode: string;
	writeFailedCode: string;
}

const SKILL_KIND_MUTATION_POLICY = {
	policy: "skill-kind",
	isAllowedRelativePath: isAllowedSkillKindRelativePath,
	refusedTargetCode: "skill-kind-target-refused",
	shouldCheckUnsupportedFirst: false,
	unsupportedMessage: (candidate, description) =>
		`Refusing to manage unsupported ${description} target: ${candidate}`,
	unsafeMessage: (candidate, description) =>
		`Refusing to manage unsafe ${description} target: ${candidate}`,
	outsideMessage: (candidate, description) =>
		`Refusing to manage ${description} outside project root: ${candidate}`,
	symlinkCode: "skill-kind-symlink",
	notFileCode: "skill-kind-not-file",
	parentSymlinkCode: "skill-kind-parent-symlink",
	parentNotDirectoryCode: "skill-kind-parent-not-directory",
	parentMissingCode: "skill-kind-parent-missing",
	parentCreateFailedCode: "skill-kind-parent-create-failed",
	writeFailedCode: "skill-kind-write-failed",
} satisfies AregProjectMutationPolicyDescriptor;

export function getAregProjectMutationPolicyDescriptor(
	policy: AregProjectMutationPolicy,
): AregProjectMutationPolicyDescriptor {
	switch (policy) {
		case "skill-kind":
			return SKILL_KIND_MUTATION_POLICY;
	}
}

function isAllowedSkillKindRelativePath(relativePath: string): boolean {
	if (relativePath === ".pi/settings.json") return true;
	const parts = relativePath.split("/");
	return (
		isAllowedSkillKindRelativePathParts(parts, 1) || isAllowedSkillKindRelativePathParts(parts, 2)
	);
}

function isAllowedSkillKindRelativePathParts(parts: readonly string[], rootLength: 1 | 2): boolean {
	const isLocalRoot = rootLength === 1 && parts[0] === "skills";
	const isVendoredRoot = rootLength === 2 && parts[0] === ".agents" && parts[1] === "skills";
	if (!isLocalRoot && !isVendoredRoot) return false;
	return (
		(parts.length === rootLength + 2 && parts[rootLength + 1] === "SKILL.md") ||
		(parts.length === rootLength + 3 &&
			parts[rootLength + 1] === "agents" &&
			parts[rootLength + 2] === "openai.yaml") ||
		(parts.length === rootLength + 2 && parts[rootLength + 1] === "agents")
	);
}

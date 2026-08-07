/**
 * Extension API for `@nseng-ai/ns` — the shared home for harness-artifact and
 * harness-overlay conventions. Cross-package consumers import from this door
 * only.
 */

export {
	artifactProvisionName,
	HARNESS_ARTIFACT_KINDS,
	HARNESS_ARTIFACT_SOURCE_TYPES,
	type AgentHarnessArtifactEntry,
	type ExtensionBundleHarnessArtifactEntry,
	type FirstPartyHarnessArtifactCatalog,
	type FirstPartyHarnessArtifactSource,
	type HarnessArtifactEntry,
	type HarnessArtifactEntryBase,
	type HarnessArtifactKind,
	type HarnessArtifactSource,
	type HarnessArtifactSourceType,
	type NpmModuleHarnessArtifactSource,
	type SkillHarnessArtifactEntry,
} from "./artifact-catalog.ts";
export {
	findFirstPartySkillArtifact,
	listFirstPartySkillArtifacts,
	NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG,
	type FirstPartySkillHarnessArtifact,
} from "./first-party-catalog.ts";
export {
	harnessArtifactSourceTypeSchema,
	harnessIdSchema,
	harnessScopeSchema,
} from "./harness-artifact-schemas.ts";
export {
	nodeHarnessArtifactFileSystemGateway,
	type HarnessArtifactFileSystemErrorInfo,
	type HarnessArtifactFileSystemGateway,
	type HarnessArtifactModuleDiscoveryGateway,
	type HarnessArtifactRemovalSafety,
	type HarnessArtifactSafetyInspection,
	type ModuleDiscoveryDirectoryEntry,
	type ModuleDiscoveryDirectoryState,
	type ModuleDiscoveryPathState,
	type OptionalFileState,
	type OptionalTextFileState,
} from "./filesystem.ts";
export type { PathState, TextFileState } from "./fs-state.ts";
export {
	describeProvisionConflict,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
	firstPartySkillProvisionPathContext,
	provisionFirstPartySkill,
	resolveFirstPartyCatalogSourceRoot,
	splitProvisionFirstPartySkillOutcome,
	type ProvisionFirstPartySkillFailure,
	type ProvisionFirstPartySkillOutcome,
	type ProvisionFirstPartySkillRequest,
	type SplitProvisionFirstPartySkillOutcome,
} from "./first-party-skill-provisioning.ts";
export {
	ALL_HARNESS_IDS,
	HARNESS_SCOPES,
	HARNESS_SPECS,
	normalizeHarnessId,
	resolveHarnessArtifactPath,
	resolveHarnessSkillRoot,
	resolveHarnessSpec,
	type HarnessBasePathSpec,
	type HarnessId,
	type HarnessPathContext,
	type HarnessPathEnvironment,
	type HarnessPathErrorInfo,
	type HarnessScope,
	type HarnessScopedPathSpec,
	type HarnessSpec,
	type ResolvedHarnessArtifactPath,
	type ResolvedHarnessSkillRoot,
} from "./harness-paths.ts";
export {
	parseNsTomlExtensions,
	type NsTomlChange,
	type NsTomlErrorCode,
	type NsTomlErrorInfo,
	type NsTomlExtensionsParseResult,
} from "./ns-toml.ts";
export {
	applyPreparedProvision,
	prepareProvision,
	previewFromPrepared,
	type ApplyPreparedProvisionOptions,
	type HarnessArtifactProvisionAppliedOutcome,
	type HarnessArtifactProvisionApplyOutcome,
	type HarnessArtifactProvisionApplyResult,
	type HarnessArtifactProvisionConflictOutcome,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessArtifactProvisionPreview,
	type HarnessArtifactProvisionRequest,
	type PreparedHarnessArtifactProvision,
} from "./provision-apply.ts";
export {
	buildInstallManifestData,
	buildInstallManifestEntry,
	INSTALL_MANIFEST_FILE_NAME,
	installManifestPathForPlan,
	readInstallManifestAtRoot,
	type InstallManifestData,
	type InstallManifestEntryData,
	type InstallManifestFileData,
	type InstallManifestSourceData,
} from "./provision-manifest.ts";
export {
	buildProvisionPlan,
	classifyProvisionDecisions,
	contentHashForBytes,
	contentHashForText,
	installManifestKey,
	PROVISION_FILE_DECISION_TYPES,
	provisionFileDecisionSchema,
	provisionPlanFileSchema,
	type BuildProvisionPlanInput,
	type ProvisionDecisionErrorInfo,
	type ProvisionDecisionSet,
	type ProvisionFileDecision,
	type ProvisionFileDecisionType,
	type ProvisionPlan,
	type ProvisionPlanErrorInfo,
	type ProvisionPlanFile,
	type ProvisionSourceFile,
	type ProvisionSourceProvenance,
	type ProvisionableHarnessArtifactEntry,
	type TargetFileHashFact,
} from "./provision-plan.ts";
export {
	parseSkillFrontmatterBlock,
	parseSkillFrontmatterTopLevelLine,
	isSkillFrontmatterTopLevelKey,
	transformSkillFrontmatter,
	type SkillFrontmatterData,
	type SkillFrontmatterParseResult,
	type SkillFrontmatterTopLevelLineParseResult,
} from "./skill-frontmatter.ts";
export {
	agentsSkillMirrorRelativePath,
	claudeSkillMirrorRelativePath,
	classifySkillMirrorSymlinkState,
	expectedAgentsSkillSymlinkTarget,
	expectedClaudeSkillSymlinkTarget,
	expectedMirrorTarget,
	isAgentsSkillMirror,
	isClaudeSkillMirror,
	isSkillMirrorRelativePath,
	parseSkillMirrorRelativePath,
	type SkillMirrorKind,
	type SkillMirrorRelativePathInfo,
} from "./skill-mirror-conventions.ts";
export {
	parseInspectedLockfile,
	parseLockfileData,
	parseLockfileText,
	SOURCE_TYPES,
	type LockfileSkill,
	type LockfileSkillData,
	type SkillsLockfile,
	type SkillsLockfileData,
	type SourceType,
} from "./skills-lockfile.ts";

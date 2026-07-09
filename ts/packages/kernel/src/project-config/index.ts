export { nsExtensionExportTarget } from "../sdk/descriptor.ts";

export {
	declaredExtensionSpecsErrorInfo,
	descriptorExportPathErrorInfo,
	descriptorExportTarget,
	directoryExists,
	fileExists,
	managedDescriptorPackageRoot,
	managedExtensionsNpmProjectRoot,
	parseDeclaredExtensionSpecsToml,
	resolveAcquiredDescriptorPackageRoot,
	resolveDescriptorExportPath,
} from "./descriptor-package.ts";
export type {
	AcquiredDescriptorPackageRoot,
	DeclaredExtensionSpecsErrorInfo,
	DeclaredExtensionSpecsParseResult,
	DescriptorExportPathResult,
	DescriptorPackageErrorInfo,
} from "./descriptor-package.ts";

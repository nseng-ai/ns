import { branchPrChecksOperation } from "../../../../../branch-pr-checks.ts";
import { prAddressOperationNsCommand } from "../../../../command.ts";

export async function command() {
	return prAddressOperationNsCommand(branchPrChecksOperation);
}

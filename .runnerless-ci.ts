import { capabilities, checks, configuration, event, reviews } from "runnerless/v1";

// Runnerless compiles the trusted PR base revision. PR changes cannot approve
// themselves by changing this program. Neither gate allocates an Actions runner.
export function configure(): void {
  configuration.workflow("pr-gates", [
    "pull_request", "pull_request_review", "pull_request_review_comment",
    "pull_request_review_thread", "issue_comment", "check_run",
    "workflow_run", "push", "default_branch_ci"
  ]);
}

export function run(): void {
  const details = event.details();
  if (details.get("pullNumber").isNull() || details.get("state").string() != "open") return;
  const review = reviews.evaluate();
  checks.report("Codex review", review.state == "success", review.summary);
  // Fail closed during the host rollout: unsupported capability, missing CI,
  // pending attempts and unsuccessful runs must never grant a passing check.
  const health = capabilities.call("policies.defaultBranchCi", "{\"workflow\":\"wasm.yml\"}");
  if (!health.ok) {
    checks.report("Main health", false, "Cannot verify latest main CI: Runnerless must support policies.defaultBranchCi.");
  } else {
    checks.report("Main health", health.value.get("state").string() == "success", health.value.get("summary").string());
  }
}

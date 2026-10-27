"""Manual-only acceptance runner.

Tests of workflows deliberately absent from this distribution are excluded
individually. All remaining unit tests and real isolated Docker CI execute.
"""
import sys
import unittest
from pathlib import Path

# These tests require workflow files only shipped in the deferred automation /
# setup / recovery PR, not in the manual-only release.
DEFERRED = {
    "test_automation_policy.AutomationPolicyTests.test_workflow_environment_and_monitor_match_daily_fixed_operation",
    "test_backup.BackupTests.test_inspection_job_rejects_operation_mode_sha_and_branch_mismatches",
    "test_backup.BackupTests.test_manual_setup_condition_rejects_wrong_event_operation_ref_or_sha",
    "test_backup.BackupTests.test_protected_setup_has_exact_sha_review_and_fixed_operations",
    "test_existing_recovery.ExistingRecoveryTests.test_final_retry_restores_portal_only_without_source_credentials",
    "test_existing_recovery.ExistingRecoveryTests.test_workflow_restores_existing_only_under_review",
    "test_failure_audit.FailureAuditTests.test_audit_workflow_excludes_database_and_capture_permissions",
    "test_first_capture.FirstCaptureTests.test_workflow_has_exact_sha_environment_review_and_no_schedule_or_delete",
    "test_first_capture_preparation.FirstCapturePreparationTests.test_workflow_is_reviewed_sha_bound_and_setup_only",
    "test_inspect_runner.InspectionRunnerTests.test_checkout_and_runtime_identity_are_literal_and_immutable",
    "test_inspect_runner.InspectionRunnerTests.test_distinct_controller_and_target_sha_approvals_fail_closed",
    "test_inspect_runner.InspectionRunnerTests.test_event_cannot_run_on_main_or_on_a_timer",
    "test_inspect_runner.InspectionRunnerTests.test_read_only_credentials_and_fixed_operation",
    "test_readiness_monitoring.ReadinessMonitoringTests.test_activation_and_all_triggers_remain_disabled",
}

def flatten(suite):
    for case in suite:
        if isinstance(case, unittest.TestSuite):
            yield from flatten(case)
        else:
            yield case

def main():
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).resolve().parent), pattern="test_*.py")
    tests = list(flatten(suite))
    present = {t.id() for t in tests}
    if not DEFERRED <= present:
        sys.exit("Unexpected test suite change: missing deferred cases " + str(sorted(DEFERRED - present)))
    runnable = [t for t in tests if t.id() not in DEFERRED]
    if len(runnable) < 100:
        sys.exit("Manual safety test count unexpectedly low")
    print(f"Manual-only suite: {len(runnable)} tests, {len(DEFERRED)} deferred workflow-specific tests", flush=True)
    ok = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(runnable))
    return 0 if ok.wasSuccessful() else 1

if __name__ == "__main__":
    raise SystemExit(main())

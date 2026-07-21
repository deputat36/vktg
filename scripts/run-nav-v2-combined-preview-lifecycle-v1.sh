#!/usr/bin/env bash
set -uo pipefail

log_file="/tmp/nav-v2-combined-preview-lifecycle-v1.log"
exec > >(tee "$log_file") 2>&1

preview_dir="/tmp/nav-v2-combined-preview-bundle-v1"
bounded_dir="/tmp/nav-v2-combined-preview-bounded-v1"
report_file="/tmp/nav-v2-combined-preview-artifact-report-v1.json"
rm -rf "$preview_dir" "$bounded_dir"
rm -f "$report_file"

node scripts/assemble-nav-v2-preview-bundle-v1.mjs \
  --output-dir "$preview_dir" || exit $?
node scripts/assemble-nav-v2-bounded-consolidated-candidate-v1.mjs \
  --output-dir "$bounded_dir" || exit $?
node scripts/check-nav-v2-combined-preview-artifacts-v1.mjs \
  --preview-bundle-dir "$preview_dir" \
  --bounded-dir "$bounded_dir" \
  --report "$report_file" || exit $?

run_sql() {
  local file="$1"
  echo "===== RUN ${file} ====="
  psql -v ON_ERROR_STOP=1 -f "$file"
}

quality_applied=0
bounded_applied=0
intake_applied=0
intake_marker_facade_active=0
forward_status=0
rollback_status=0
post_status=0

enter_intake_marker_facade() {
  if [[ "$intake_marker_facade_active" -eq 0 ]]; then
    run_sql tests/sql/nav_v2_combined_preview_intake_marker_facade_enter_v1.sql || return $?
    intake_marker_facade_active=1
  fi
}

exit_intake_marker_facade() {
  if [[ "$intake_marker_facade_active" -eq 1 ]]; then
    run_sql tests/sql/nav_v2_combined_preview_intake_marker_facade_exit_v1.sql || return $?
    intake_marker_facade_active=0
  fi
}

run_forward_and_assertions() {
  run_sql tests/sql/nav_v2_privacy_aligned_quality_harness_setup.sql || return $?

  run_sql "$preview_dir/01-quality-forward.sql" || return $?
  quality_applied=1
  run_sql tests/sql/nav_v2_privacy_aligned_quality_assertions.sql || return $?

  run_sql tests/sql/nav_v2_combined_preview_shared_setup_v1.sql || return $?
  run_sql "$bounded_dir/01-bounded-consolidated-forward.sql" || return $?
  bounded_applied=1
  run_sql tests/sql/nav_v2_combined_preview_bounded_coexistence_assertions_v1.sql || return $?

  run_sql tests/sql/nav_v2_intake_save_integration_harness_setup.sql || return $?
  run_sql "$preview_dir/04-intake-forward.sql" || return $?
  intake_applied=1

  enter_intake_marker_facade || return $?

  run_sql tests/sql/nav_v2_intake_adapter_harness_assertions.sql || return $?
  run_sql tests/sql/nav_v2_intake_save_integration_harness_assertions.sql || return $?

  run_sql tests/sql/nav_v2_governed_intake_save_harness_setup.sql || return $?
  run_sql tests/sql/nav_v2_governed_intake_save_assertions.sql || return $?

  run_sql tests/sql/nav_v2_intake_semantics_wave1_integration_harness_setup.sql || return $?
  run_sql tests/sql/nav_v2_intake_semantics_wave1_integration_rule_assertions.sql || return $?
  run_sql tests/sql/nav_v2_intake_semantics_wave1_integration_negative_assertions.sql || return $?

  run_sql tests/sql/nav_v2_intake_semantics_wave2_integration_harness_setup.sql || return $?
  run_sql tests/sql/nav_v2_intake_semantics_wave2_integration_rule_assertions.sql || return $?
  run_sql tests/sql/nav_v2_intake_semantics_wave2_integration_negative_assertions.sql || return $?

  run_sql tests/sql/nav_v2_intake_special_semantics_assertions.sql || return $?
  run_sql tests/sql/nav_v2_intake_special_semantics_integration_harness_setup.sql || return $?
  run_sql tests/sql/nav_v2_preview_bundle_intake_final_contract_assertions.sql || return $?
  run_sql tests/sql/nav_v2_preview_bundle_intake_final_single_rule_assertions.sql || return $?
  run_sql tests/sql/nav_v2_preview_bundle_intake_final_composite_assertions.sql || return $?

  exit_intake_marker_facade || return $?
  run_sql tests/sql/nav_v2_combined_preview_integration_assertions_v1.sql || return $?
}

run_forward_and_assertions || forward_status=$?

if [[ "$intake_applied" -eq 1 ]]; then
  echo "===== ALWAYS ROLLBACK intake ====="
  if [[ "$intake_marker_facade_active" -eq 0 ]]; then
    enter_intake_marker_facade || rollback_status=$?
  fi
  run_sql "$preview_dir/04-intake-rehearsal-rollback.sql" || rollback_status=$?
  exit_intake_marker_facade || rollback_status=$?
fi
if [[ "$bounded_applied" -eq 1 ]]; then
  echo "===== ALWAYS ROLLBACK bounded_consolidated ====="
  run_sql "$bounded_dir/01-bounded-consolidated-rollback.sql" || rollback_status=$?
fi
if [[ "$quality_applied" -eq 1 ]]; then
  echo "===== ALWAYS ROLLBACK quality ====="
  run_sql "$preview_dir/01-quality-rehearsal-rollback.sql" || rollback_status=$?
fi

if [[ "$quality_applied" -eq 1 && "$bounded_applied" -eq 1 && "$intake_applied" -eq 1 && "$rollback_status" -eq 0 ]]; then
  run_sql tests/sql/nav_v2_combined_preview_post_rollback_assertions_v1.sql || post_status=$?
fi

if [[ "$forward_status" -ne 0 ]]; then
  echo "combined preview forward/assertion status: ${forward_status}" >&2
  exit "$forward_status"
fi
if [[ "$rollback_status" -ne 0 ]]; then
  echo "combined preview rollback status: ${rollback_status}" >&2
  exit "$rollback_status"
fi
if [[ "$post_status" -ne 0 ]]; then
  echo "combined preview post-rollback status: ${post_status}" >&2
  exit "$post_status"
fi

echo "Navigator v2 combined quality -> bounded -> intake PostgreSQL 17 lifecycle passed with ALWAYS ROLLBACK"

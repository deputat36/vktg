#!/usr/bin/env bash
set -uo pipefail

segment="${1:-}"
if [[ -z "$segment" ]]; then
  echo "usage: $0 <quality|bounded_core|bounded_dto|intake>" >&2
  exit 2
fi

log_file="/tmp/nav-v2-preview-bundle-${segment}.log"
exec > >(tee "$log_file") 2>&1

bundle_dir="/tmp/nav-v2-preview-bundle-${segment}"
rm -rf "$bundle_dir"
node scripts/assemble-nav-v2-preview-bundle-v1.mjs --output-dir "$bundle_dir" || exit $?
node scripts/check-nav-v2-preview-bundle-artifacts-v1.mjs --bundle-dir "$bundle_dir" || exit $?

run_sql() {
  local file="$1"
  echo "===== RUN ${file} ====="
  psql -v ON_ERROR_STOP=1 -f "$file"
}

rollback_file=""
post_rollback_file=""
rollback_ready=0

run_forward_and_assertions() {
  case "$segment" in
    quality)
      rollback_file="$bundle_dir/01-quality-rehearsal-rollback.sql"
      run_sql tests/sql/nav_v2_privacy_aligned_quality_harness_setup.sql || return $?
      rollback_ready=1
      run_sql "$bundle_dir/01-quality-forward.sql" || return $?
      run_sql tests/sql/nav_v2_privacy_aligned_quality_assertions.sql || return $?
      ;;

    bounded_core)
      rollback_file="$bundle_dir/02-bounded-core-rehearsal-rollback.sql"
      post_rollback_file="tests/sql/nav_v2_preview_bundle_bounded_core_post_rollback_assertions.sql"
      run_sql tests/sql/nav_v2_bounded_task_mutation_setup.sql || return $?
      rollback_ready=1
      run_sql "$bundle_dir/02-bounded-core-forward.sql" || return $?
      run_sql tests/sql/nav_v2_bounded_task_mutation_assertions.sql || return $?
      run_sql tests/sql/nav_v2_bounded_task_actor_aware_assertions.sql || return $?
      ;;

    bounded_dto)
      rollback_file="$bundle_dir/03-bounded-dto-rehearsal-rollback.sql"
      post_rollback_file="tests/sql/nav_v2_preview_bundle_bounded_post_rollback_assertions.sql"
      run_sql tests/sql/nav_v2_bounded_task_mutation_setup.sql || return $?
      run_sql tests/sql/nav_v2_deal_card_lite_bounded_setup.sql || return $?
      rollback_ready=1
      run_sql "$bundle_dir/03-bounded-dto-forward.sql" || return $?
      run_sql tests/sql/nav_v2_deal_card_lite_bounded_assertions.sql || return $?
      ;;

    intake)
      rollback_file="$bundle_dir/04-intake-rehearsal-rollback.sql"
      run_sql tests/sql/nav_v2_intake_adapter_harness_setup.sql || return $?
      run_sql tests/sql/nav_v2_intake_save_integration_harness_setup.sql || return $?
      rollback_ready=1
      run_sql "$bundle_dir/04-intake-forward.sql" || return $?
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
      ;;

    *)
      echo "unknown segment: $segment" >&2
      return 2
      ;;
  esac
}

forward_status=0
run_forward_and_assertions || forward_status=$?

rollback_status=0
post_status=0
if [[ "$rollback_ready" -eq 1 ]]; then
  echo "===== ALWAYS ROLLBACK ${rollback_file} ====="
  run_sql "$rollback_file" || rollback_status=$?
  if [[ -n "$post_rollback_file" ]]; then
    run_sql "$post_rollback_file" || post_status=$?
  fi
else
  echo "rollback was not armed because synthetic setup did not complete"
fi

if [[ "$forward_status" -ne 0 ]]; then
  echo "segment ${segment} forward/assertion status: ${forward_status}" >&2
  exit "$forward_status"
fi
if [[ "$rollback_status" -ne 0 ]]; then
  echo "segment ${segment} rollback status: ${rollback_status}" >&2
  exit "$rollback_status"
fi
if [[ "$post_status" -ne 0 ]]; then
  echo "segment ${segment} post-rollback status: ${post_status}" >&2
  exit "$post_status"
fi

echo "Navigator v2 preview bundle segment ${segment} passed apply/assert/rollback"

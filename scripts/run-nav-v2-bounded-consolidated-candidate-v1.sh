#!/usr/bin/env bash
set -uo pipefail

log_file="/tmp/nav-v2-bounded-consolidated-candidate-v1.log"
exec > >(tee "$log_file") 2>&1

candidate_dir="/tmp/nav-v2-bounded-consolidated-candidate-v1"
report_file="/tmp/bounded-consolidated-report.json"
rm -rf "$candidate_dir"
rm -f "$report_file"

node scripts/assemble-nav-v2-bounded-consolidated-candidate-v1.mjs \
  --output-dir "$candidate_dir" || exit $?
node scripts/check-nav-v2-bounded-consolidated-candidate-v1.mjs \
  --candidate-dir "$candidate_dir" \
  --report "$report_file" || exit $?

run_sql() {
  local file="$1"
  echo "===== RUN ${file} ====="
  psql -v ON_ERROR_STOP=1 -f "$file"
}

rollback_file="$candidate_dir/01-bounded-consolidated-rollback.sql"
rollback_ready=0
forward_status=0
rollback_status=0
post_status=0

run_forward_and_assertions() {
  run_sql tests/sql/nav_v2_bounded_task_mutation_setup.sql || return $?
  run_sql tests/sql/nav_v2_deal_card_lite_bounded_setup.sql || return $?
  rollback_ready=1

  run_sql "$candidate_dir/01-bounded-consolidated-forward.sql" || return $?
  run_sql tests/sql/nav_v2_bounded_task_mutation_assertions.sql || return $?
  run_sql tests/sql/nav_v2_bounded_task_actor_aware_assertions.sql || return $?
  run_sql tests/sql/nav_v2_deal_card_lite_bounded_assertions.sql || return $?
  run_sql tests/sql/nav_v2_bounded_consolidated_candidate_assertions.sql || return $?
}

run_forward_and_assertions || forward_status=$?

if [[ "$rollback_ready" -eq 1 ]]; then
  echo "===== ALWAYS ROLLBACK ${rollback_file} ====="
  run_sql "$rollback_file" || rollback_status=$?
  run_sql tests/sql/nav_v2_bounded_consolidated_candidate_post_rollback_assertions.sql || post_status=$?
else
  echo "rollback was not armed because synthetic setup did not complete"
fi

if [[ "$forward_status" -ne 0 ]]; then
  echo "consolidated bounded forward/assertion status: ${forward_status}" >&2
  exit "$forward_status"
fi
if [[ "$rollback_status" -ne 0 ]]; then
  echo "consolidated bounded rollback status: ${rollback_status}" >&2
  exit "$rollback_status"
fi
if [[ "$post_status" -ne 0 ]]; then
  echo "consolidated bounded post-rollback status: ${post_status}" >&2
  exit "$post_status"
fi

echo "Navigator v2 bounded consolidated candidate passed PostgreSQL 17 apply/assert/ALWAYS ROLLBACK lifecycle"

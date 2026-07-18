#!/usr/bin/env bash
set -euo pipefail

request_id='64000000-0000-4000-8000-000000000030'
first_log='nav-v2-governed-intake-concurrent-a.log'
second_log='nav-v2-governed-intake-concurrent-b.log'

psql -XAt -v ON_ERROR_STOP=1 -c "
  select harness.mock_governed_intake_save_v1(
    harness.concurrent_intake(),
    '${request_id}'::uuid,
    harness.governed_intake_server_context(),
    p_delay_seconds => 2
  );
" >"${first_log}" 2>&1 &
first_pid=$!

sleep 0.2

psql -XAt -v ON_ERROR_STOP=1 -c "
  select harness.mock_governed_intake_save_v1(
    harness.concurrent_intake(),
    '${request_id}'::uuid,
    harness.governed_intake_server_context()
  );
" >"${second_log}" 2>&1 &
second_pid=$!

wait "${first_pid}"
wait "${second_pid}"

grep -h '"idempotent": false' "${first_log}" "${second_log}"
grep -h '"idempotent": true' "${first_log}" "${second_log}"
echo 'Navigator v2 governed intake concurrent execution completed'

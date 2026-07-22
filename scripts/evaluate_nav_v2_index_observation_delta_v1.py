#!/usr/bin/env python3
"""Offline evaluator for Navigator v2 index observation snapshots.

The evaluator reads two local JSON files only. It does not connect to Supabase,
PostgreSQL, GitHub, or any network service.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any, Iterable

CANDIDATE_INDEXES = (
    "nav_deal_answers_v2_deal_id_question_key_key",
    "nav_deal_answers_v2_deal_idx",
)

DATABASE_COUNTERS = (
    "xact_commit",
    "xact_rollback",
    "blks_read",
    "blks_hit",
    "tup_returned",
    "tup_fetched",
    "tup_inserted",
    "tup_updated",
    "tup_deleted",
    "temp_files",
    "temp_bytes",
    "deadlocks",
)

WAL_COUNTERS = (
    "wal_records",
    "wal_fpi",
    "wal_bytes",
    "wal_buffers_full",
    "wal_write",
    "wal_sync",
)

TABLE_COUNTERS = (
    "seq_scan",
    "seq_tup_read",
    "idx_scan",
    "idx_tup_fetch",
    "n_tup_ins",
    "n_tup_upd",
    "n_tup_del",
    "n_tup_hot_upd",
)

INDEX_COUNTERS = (
    "idx_scan",
    "idx_tup_read",
    "idx_tup_fetch",
)

TABLE_SIZE_FIELDS = ("heap_bytes", "total_bytes")
INDEX_SIZE_FIELDS = ("size_bytes",)

ROOT_KEYS = (
    "observation_capture",
    "observation_baseline",
    "live_baseline",
    "capture",
)


class EvaluationError(ValueError):
    """Raised when a snapshot cannot be evaluated safely."""


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise EvaluationError(f"snapshot file does not exist: {path}") from exc
    except json.JSONDecodeError as exc:
        raise EvaluationError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise EvaluationError(f"snapshot root must be an object: {path}")
    return value


def unwrap_snapshot(value: dict[str, Any]) -> dict[str, Any]:
    """Return a normalized observation capture object.

    Supported inputs:
    - raw capture object;
    - SQL result wrapper with one accepted root key;
    - observation-window config containing ``live_baseline``.
    """

    for key in ROOT_KEYS:
        nested = value.get(key)
        if isinstance(nested, dict):
            return copy.deepcopy(nested)

    if "database" in value and "table" in value and "indexes" in value:
        return copy.deepcopy(value)

    raise EvaluationError(
        "snapshot does not contain a supported observation root or raw capture fields"
    )


def require_dict(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise EvaluationError(f"{path} must be an object")
    return value


def require_list(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise EvaluationError(f"{path} must be an array")
    return value


def require_bool(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise EvaluationError(f"{path} must be a boolean")
    return value


def require_int(value: Any, path: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise EvaluationError(f"{path} must be an integer")
    return value


def require_counter(container: dict[str, Any], key: str, path: str) -> int:
    value = require_int(container.get(key), f"{path}.{key}")
    if value < 0:
        raise EvaluationError(f"{path}.{key} must be non-negative")
    return value


def index_map(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    indexes = require_list(snapshot.get("indexes"), "indexes")
    result: dict[str, dict[str, Any]] = {}
    for position, raw_item in enumerate(indexes):
        item = require_dict(raw_item, f"indexes[{position}]")
        name = item.get("index_name")
        if not isinstance(name, str) or not name:
            raise EvaluationError(f"indexes[{position}].index_name must be a string")
        if name in result:
            raise EvaluationError(f"duplicate index_name: {name}")
        result[name] = item
    if set(result) != set(CANDIDATE_INDEXES):
        raise EvaluationError(
            "candidate index inventory mismatch: "
            f"expected {sorted(CANDIDATE_INDEXES)}, got {sorted(result)}"
        )
    return result


def validate_privacy_markers(snapshot: dict[str, Any], label: str) -> list[str]:
    failures: list[str] = []
    marker_expectations = {
        "business_rows_returned": False,
        "pii_returned": False,
        "data_mutated": False,
        "ddl_executed": False,
        "statistics_reset_performed": False,
    }
    for key, expected in marker_expectations.items():
        actual = snapshot.get(key)
        if actual is not expected:
            failures.append(f"{label}.{key}_must_be_{str(expected).lower()}")

    extensions = snapshot.get("extensions", {})
    if not isinstance(extensions, dict):
        failures.append(f"{label}.extensions_invalid")
    elif extensions.get("query_text_or_user_data_captured") is not False:
        failures.append(f"{label}.query_text_or_user_data_captured")

    if snapshot.get("transaction_read_only") is not True:
        failures.append(f"{label}.transaction_not_read_only")

    return failures


def signed_delta(current: int, baseline: int) -> int:
    return current - baseline


def monotonic_delta(
    baseline: dict[str, Any],
    current: dict[str, Any],
    keys: Iterable[str],
    path: str,
    invalidations: list[str],
) -> dict[str, int]:
    deltas: dict[str, int] = {}
    for key in keys:
        before = require_counter(baseline, key, f"baseline.{path}")
        after = require_counter(current, key, f"current.{path}")
        if after < before:
            invalidations.append(f"counter_decreased:{path}.{key}")
        deltas[key] = after - before
    return deltas


def compare_epoch(
    baseline: dict[str, Any],
    current: dict[str, Any],
    invalidations: list[str],
) -> None:
    direct_checks = (
        ("postmaster_started_at", "postmaster_restart"),
        ("server_version_num", "server_version_changed"),
    )
    for key, reason in direct_checks:
        if baseline.get(key) != current.get(key):
            invalidations.append(reason)

    baseline_db = require_dict(baseline.get("database"), "baseline.database")
    current_db = require_dict(current.get("database"), "current.database")
    if baseline_db.get("database_oid") != current_db.get("database_oid"):
        invalidations.append("database_oid_changed")
    if baseline_db.get("stats_reset") != current_db.get("stats_reset"):
        invalidations.append("database_stats_reset_changed")

    baseline_wal = require_dict(baseline.get("wal"), "baseline.wal")
    current_wal = require_dict(current.get("wal"), "current.wal")
    if baseline_wal.get("stats_reset") != current_wal.get("stats_reset"):
        invalidations.append("wal_stats_reset_changed")

    baseline_table = require_dict(baseline.get("table"), "baseline.table")
    current_table = require_dict(current.get("table"), "current.table")
    if baseline_table.get("table_oid") != current_table.get("table_oid"):
        invalidations.append("candidate_table_oid_changed")
    if baseline_table.get("schema_name") != current_table.get("schema_name"):
        invalidations.append("candidate_table_schema_changed")
    if baseline_table.get("table_name") != current_table.get("table_name"):
        invalidations.append("candidate_table_name_changed")

    baseline_indexes = index_map(baseline)
    current_indexes = index_map(current)
    for name in CANDIDATE_INDEXES:
        before = baseline_indexes[name]
        after = current_indexes[name]
        if before.get("index_oid") != after.get("index_oid"):
            invalidations.append(f"candidate_index_oid_changed:{name}")
        if before.get("definition") != after.get("definition"):
            invalidations.append(f"candidate_index_definition_changed:{name}")
        if after.get("is_valid") is not True:
            invalidations.append(f"candidate_index_not_valid:{name}")
        if after.get("is_ready") is not True:
            invalidations.append(f"candidate_index_not_ready:{name}")
        if before.get("is_unique") != after.get("is_unique"):
            invalidations.append(f"candidate_index_uniqueness_changed:{name}")


def evaluate(baseline_input: dict[str, Any], current_input: dict[str, Any]) -> dict[str, Any]:
    baseline = unwrap_snapshot(baseline_input)
    current = unwrap_snapshot(current_input)

    invalidations: list[str] = []
    invalidations.extend(validate_privacy_markers(baseline, "baseline"))
    invalidations.extend(validate_privacy_markers(current, "current"))

    compare_epoch(baseline, current, invalidations)

    baseline_db = require_dict(baseline.get("database"), "baseline.database")
    current_db = require_dict(current.get("database"), "current.database")
    baseline_wal = require_dict(baseline.get("wal"), "baseline.wal")
    current_wal = require_dict(current.get("wal"), "current.wal")
    baseline_table = require_dict(baseline.get("table"), "baseline.table")
    current_table = require_dict(current.get("table"), "current.table")
    baseline_indexes = index_map(baseline)
    current_indexes = index_map(current)

    database_deltas = monotonic_delta(
        baseline_db, current_db, DATABASE_COUNTERS, "database", invalidations
    )
    wal_deltas = monotonic_delta(
        baseline_wal, current_wal, WAL_COUNTERS, "wal", invalidations
    )
    table_deltas = monotonic_delta(
        baseline_table, current_table, TABLE_COUNTERS, "table", invalidations
    )

    table_size_deltas: dict[str, int] = {}
    for key in TABLE_SIZE_FIELDS:
        before = require_counter(baseline_table, key, "baseline.table")
        after = require_counter(current_table, key, "current.table")
        table_size_deltas[key] = signed_delta(after, before)

    index_deltas: dict[str, dict[str, Any]] = {}
    for name in CANDIDATE_INDEXES:
        before = baseline_indexes[name]
        after = current_indexes[name]
        counter_deltas = monotonic_delta(
            before, after, INDEX_COUNTERS, f"index.{name}", invalidations
        )
        size_deltas: dict[str, int] = {}
        for key in INDEX_SIZE_FIELDS:
            before_size = require_counter(before, key, f"baseline.index.{name}")
            after_size = require_counter(after, key, f"current.index.{name}")
            size_deltas[key] = signed_delta(after_size, before_size)
        index_deltas[name] = {
            "counter_deltas": counter_deltas,
            "size_deltas": size_deltas,
            "current_valid": after.get("is_valid") is True,
            "current_ready": after.get("is_ready") is True,
        }

    invalidations = sorted(set(invalidations))
    window_valid = not invalidations

    report: dict[str, Any] = {
        "schema_version": 1,
        "evaluator": "nav-v2-index-observation-delta-v1",
        "baseline_captured_at": baseline.get("captured_at"),
        "current_captured_at": current.get("captured_at"),
        "window_valid": window_valid,
        "invalidation_reasons": invalidations,
        "epoch": {
            "database_oid": current_db.get("database_oid"),
            "postmaster_started_at": current.get("postmaster_started_at"),
            "database_stats_reset": current_db.get("stats_reset"),
            "wal_stats_reset": current_wal.get("stats_reset"),
            "table_oid": current_table.get("table_oid"),
            "candidate_index_oids": {
                name: current_indexes[name].get("index_oid")
                for name in CANDIDATE_INDEXES
            },
        },
        "deltas": {
            "database": database_deltas if window_valid else None,
            "wal_global": wal_deltas if window_valid else None,
            "table": table_deltas if window_valid else None,
            "table_sizes_signed": table_size_deltas if window_valid else None,
            "indexes": index_deltas if window_valid else None,
        },
        "interpretation": {
            "representative_authenticated_workload_proven": False,
            "candidate_read_benefit_proven": False,
            "candidate_write_cost_proven_in_production": False,
            "global_wal_attributable_to_candidate": False,
            "production_index_removal_ready": False,
            "automatic_ddl_decision": False,
        },
        "required_next_evidence": [
            "approved observation cadence and completion thresholds",
            "representative authenticated workload assessment",
            "production EXPLAIN ANALYZE on approved non-PII fixtures",
            "production-scale benchmark in an approved disposable or isolated environment",
            "authenticated regression",
            "exact forward and rollback migration",
            "separate owner production DDL approval",
        ],
    }

    if window_valid:
        report["decision"] = "delta_valid_same_epoch_evidence_not_representative"
        report["deltas_trusted"] = True
    else:
        report["decision"] = "observation_window_invalidated_restart_capture_required"
        report["deltas_trusted"] = False

    return report


def base_fixture() -> dict[str, Any]:
    return {
        "captured_at": "2026-07-22T05:31:47.591346+00:00",
        "capture_mode": "aggregate_catalog_statistics_only_read_only_transaction",
        "transaction_read_only": True,
        "server_version_num": 170006,
        "postmaster_started_at": "2026-06-13T20:56:45.579218+00:00",
        "database": {
            "database_oid": 5,
            "stats_reset": None,
            "xact_commit": 100,
            "xact_rollback": 1,
            "blks_read": 10,
            "blks_hit": 1000,
            "tup_returned": 2000,
            "tup_fetched": 1500,
            "tup_inserted": 20,
            "tup_updated": 10,
            "tup_deleted": 5,
            "temp_files": 2,
            "temp_bytes": 4096,
            "deadlocks": 0,
        },
        "wal": {
            "stats_reset": "2026-06-13T20:56:11.777190+00:00",
            "wal_records": 1000,
            "wal_fpi": 100,
            "wal_bytes": 500000,
            "wal_buffers_full": 20,
            "wal_write": 300,
            "wal_sync": 200,
        },
        "table": {
            "table_oid": 19392,
            "schema_name": "public",
            "table_name": "nav_deal_answers_v2",
            "seq_scan": 4,
            "seq_tup_read": 35,
            "idx_scan": 0,
            "idx_tup_fetch": 0,
            "n_tup_ins": 0,
            "n_tup_upd": 0,
            "n_tup_del": 0,
            "n_tup_hot_upd": 0,
            "heap_bytes": 8192,
            "total_bytes": 81920,
        },
        "indexes": [
            {
                "index_oid": 19402,
                "index_name": "nav_deal_answers_v2_deal_id_question_key_key",
                "definition": "CREATE UNIQUE INDEX nav_deal_answers_v2_deal_id_question_key_key ON public.nav_deal_answers_v2 USING btree (deal_id, question_key)",
                "is_unique": True,
                "is_valid": True,
                "is_ready": True,
                "idx_scan": 0,
                "idx_tup_read": 0,
                "idx_tup_fetch": 0,
                "size_bytes": 16384,
            },
            {
                "index_oid": 19583,
                "index_name": "nav_deal_answers_v2_deal_idx",
                "definition": "CREATE INDEX nav_deal_answers_v2_deal_idx ON public.nav_deal_answers_v2 USING btree (deal_id)",
                "is_unique": False,
                "is_valid": True,
                "is_ready": True,
                "idx_scan": 0,
                "idx_tup_read": 0,
                "idx_tup_fetch": 0,
                "size_bytes": 16384,
            },
        ],
        "extensions": {"query_text_or_user_data_captured": False},
        "business_rows_returned": False,
        "pii_returned": False,
        "data_mutated": False,
        "ddl_executed": False,
        "statistics_reset_performed": False,
    }


def increment_fixture(baseline: dict[str, Any]) -> dict[str, Any]:
    current = copy.deepcopy(baseline)
    current["captured_at"] = "2026-07-29T05:31:47.591346+00:00"
    current["database"]["xact_commit"] += 50
    current["database"]["blks_hit"] += 500
    current["database"]["tup_inserted"] += 10
    current["wal"]["wal_records"] += 100
    current["wal"]["wal_bytes"] += 50000
    current["table"]["seq_scan"] += 2
    current["table"]["n_tup_ins"] += 10
    current["table"]["heap_bytes"] += 8192
    current["table"]["total_bytes"] += 16384
    for item in current["indexes"]:
        if item["index_name"] == "nav_deal_answers_v2_deal_idx":
            item["idx_scan"] += 3
            item["idx_tup_read"] += 30
        else:
            item["idx_scan"] += 2
            item["idx_tup_read"] += 20
        item["size_bytes"] += 8192
    return current


def assert_invalid(
    baseline: dict[str, Any], current: dict[str, Any], expected_fragment: str
) -> None:
    report = evaluate(baseline, current)
    if report["window_valid"] is not False:
        raise AssertionError(f"expected invalid window for {expected_fragment}")
    if not any(expected_fragment in reason for reason in report["invalidation_reasons"]):
        raise AssertionError(
            f"expected invalidation containing {expected_fragment}, got {report['invalidation_reasons']}"
        )
    if report["production_index_removal_ready"] if "production_index_removal_ready" in report else False:
        raise AssertionError("invalid report must never mark index removal ready")


def self_test() -> None:
    baseline = base_fixture()
    current = increment_fixture(baseline)

    valid_report = evaluate(baseline, current)
    assert valid_report["window_valid"] is True
    assert valid_report["deltas_trusted"] is True
    assert valid_report["decision"] == "delta_valid_same_epoch_evidence_not_representative"
    assert valid_report["deltas"]["database"]["xact_commit"] == 50
    assert valid_report["deltas"]["table"]["n_tup_ins"] == 10
    assert (
        valid_report["deltas"]["indexes"]["nav_deal_answers_v2_deal_idx"]
        ["counter_deltas"]["idx_scan"]
        == 3
    )
    assert valid_report["interpretation"]["production_index_removal_ready"] is False

    case = copy.deepcopy(current)
    case["postmaster_started_at"] = "2026-07-29T00:00:00+00:00"
    assert_invalid(baseline, case, "postmaster_restart")

    case = copy.deepcopy(current)
    case["database"]["stats_reset"] = "2026-07-28T00:00:00+00:00"
    assert_invalid(baseline, case, "database_stats_reset_changed")

    case = copy.deepcopy(current)
    case["wal"]["stats_reset"] = "2026-07-28T00:00:00+00:00"
    assert_invalid(baseline, case, "wal_stats_reset_changed")

    case = copy.deepcopy(current)
    case["indexes"][0]["index_oid"] += 1
    assert_invalid(baseline, case, "candidate_index_oid_changed")

    case = copy.deepcopy(current)
    case["indexes"][0]["definition"] += " INCLUDE (answer_text)"
    assert_invalid(baseline, case, "candidate_index_definition_changed")

    case = copy.deepcopy(current)
    case["indexes"][1]["is_ready"] = False
    assert_invalid(baseline, case, "candidate_index_not_ready")

    case = copy.deepcopy(current)
    case["table"]["seq_scan"] = baseline["table"]["seq_scan"] - 1
    assert_invalid(baseline, case, "counter_decreased:table.seq_scan")

    case = copy.deepcopy(current)
    case["pii_returned"] = True
    assert_invalid(baseline, case, "current.pii_returned_must_be_false")

    case = copy.deepcopy(current)
    case["business_rows_returned"] = True
    assert_invalid(baseline, case, "current.business_rows_returned_must_be_false")

    case = copy.deepcopy(current)
    case["extensions"]["query_text_or_user_data_captured"] = True
    assert_invalid(baseline, case, "current.query_text_or_user_data_captured")

    print("Navigator v2 observation delta evaluator self-test passed")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", nargs="?", type=Path)
    parser.add_argument("current", nargs="?", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.self_test:
        self_test()
        return 0

    if args.baseline is None or args.current is None:
        print("baseline and current JSON files are required", file=sys.stderr)
        return 2

    try:
        report = evaluate(load_json(args.baseline), load_json(args.current))
    except EvaluationError as exc:
        print(f"evaluation failed: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)

    return 0 if report["window_valid"] else 3


if __name__ == "__main__":
    raise SystemExit(main())

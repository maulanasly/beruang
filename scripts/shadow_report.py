#!/usr/bin/env python3
"""Aggregate `shadow_diff` JSON events from gateway logs.

Usage:
    python scripts/shadow_report.py /tmp/opencode/gateway.log [--burn-in YYYY-MM-DD]

Each gateway log line carrying a shadow event contains `"shadow":true` with
a single JSON object (the event). Lines before --burn-in (first ~day of
cold-cache noise) are counted separately and excluded from the verdict.

Promotion bar (defaults): >=7 days wall-clock AND minimum volumes with
zero material diffs post-burn-in:
    quote>=200, index-history>=100, price-history>=100,
    dividend-yields>=50, search>=50, kompas100>=50
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date

MIN_VOLUMES = {
    "quote": 200,
    "index-history": 100,
    "price-history": 100,
    "dividend-yields": 50,
    "search": 50,
    "kompas100": 50,
}


def extract_event(line: str) -> dict | None:
    if '"shadow":true' not in line.replace(" ", ""):
        return None
    start = line.find("{")
    end = line.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        event = json.loads(line[start : end + 1])
    except json.JSONDecodeError:
        return None
    return event if isinstance(event, dict) and event.get("shadow") is True else None


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(pct / 100 * len(ordered)))
    return ordered[index]


def main() -> int:
    parser = argparse.ArgumentParser(description="Aggregate shadow-diff events.")
    parser.add_argument("log", help="Gateway log file (or - for stdin).")
    parser.add_argument("--burn-in", default=None, help="Exclude events before YYYY-MM-DD.")
    args = parser.parse_args()

    burn_in = date.fromisoformat(args.burn_in) if args.burn_in else None
    stream = sys.stdin if args.log == "-" else open(args.log, encoding="utf-8")

    verdicts: dict[str, Counter] = defaultdict(Counter)
    burn_in_counts: dict[str, int] = Counter()
    py_ms: dict[str, list[float]] = defaultdict(list)
    rs_ms: dict[str, list[float]] = defaultdict(list)
    material_samples: dict[str, list[dict]] = defaultdict(list)
    shadow_errors = 0
    days: set[str] = set()
    total = 0

    with stream as handle:
        for line in handle:
            event = extract_event(line)
            if event is None:
                continue
            total += 1
            route = str(event.get("route", "?"))
            ts = str(event.get("ts", ""))[:10]
            if ts:
                days.add(ts)
            if burn_in is not None and ts and ts < args.burn_in:
                burn_in_counts[route] += 1
                continue
            verdict = str(event.get("verdict", "?"))
            verdicts[route][verdict] += 1
            if isinstance(event.get("py_ms"), (int, float)):
                py_ms[route].append(event["py_ms"])
            if isinstance(event.get("rs_ms"), (int, float)):
                rs_ms[route].append(event["rs_ms"])
            if verdict == "material" and len(material_samples[route]) < 5:
                material_samples[route].append(event)
            if verdict == "shadow_error":
                shadow_errors += 1

    print(f"events: {total} (burn-in excluded: {sum(burn_in_counts.values())})")
    print(f"days observed: {len(days)} {sorted(days)[:3]}{'...' if len(days) > 3 else ''}")
    print()
    overall_ok = True
    for route in sorted(set(list(verdicts) + list(MIN_VOLUMES))):
        counts = verdicts.get(route, Counter())
        matched = counts.get("match", 0)
        minor = counts.get("minor", 0)
        material = counts.get("material", 0)
        errors = counts.get("shadow_error", 0)
        volume = matched + minor + material
        required = MIN_VOLUMES.get(route, 0)
        bar = "OK " if (material == 0 and volume >= required) else "FAIL"
        if bar == "FAIL":
            overall_ok = False
        p50 = percentile(rs_ms.get(route, []), 50)
        p95 = percentile(rs_ms.get(route, []), 95)
        py_p95 = percentile(py_ms.get(route, []), 95)
        print(
            f"[{bar}] {route}: match={matched} minor={minor} "
            f"material={material} shadow_error={errors} "
            f"volume={volume}/{required} rs_p50={p50}ms rs_p95={p95}ms py_p95={py_p95}ms"
        )
        for sample in material_samples.get(route, []):
            diffs = json.dumps(sample.get("diffs", []))[:300]
            print(f"      material: params={sample.get('params')} diffs={diffs}")
    print()
    print(f"shadow_error total: {shadow_errors} (harness/upstream noise, not correctness)")
    print("PROMOTION:", "GO" if overall_ok and len(days) >= 7 else "NO-GO")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())

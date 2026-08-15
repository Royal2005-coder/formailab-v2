#!/usr/bin/env python3
"""Normalize, validate and write the final Understand knowledge graph."""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UA = ROOT / ".ua"
INTER = UA / "intermediate"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_array(value, envelope: str):
    if isinstance(value, dict):
        value = value.get(envelope, [])
    return value if isinstance(value, list) else []


def main() -> None:
    scan = load(INTER / "scan-result.json")
    graph = load(INTER / "assembled-graph.json")
    layers = normalize_array(load(INTER / "layers.json"), "layers")
    tour = normalize_array(load(INTER / "tour.json"), "steps")
    node_ids = {node.get("id") for node in graph.get("nodes", []) if node.get("id")}
    file_prefixes = ("file:", "config:", "document:", "service:", "pipeline:", "table:", "schema:", "resource:", "endpoint:")

    clean_layers = []
    for layer in layers:
        ids = layer.pop("nodes", layer.get("nodeIds", []))
        ids = [item.get("id") if isinstance(item, dict) else item for item in ids]
        ids = [item if str(item).startswith(file_prefixes) else f"file:{item}" for item in ids]
        ids = [item for item in ids if item in node_ids]
        clean_layers.append({
            "id": layer.get("id") or "layer:" + layer.get("name", "shared").lower().replace(" ", "-"),
            "name": layer.get("name", "Lớp dùng chung"),
            "description": layer.get("description", "Các thành phần được phân nhóm theo trách nhiệm kiến trúc."),
            "nodeIds": ids,
        })

    clean_tour = []
    for index, step in enumerate(sorted(tour, key=lambda item: item.get("order", 999)), start=1):
        ids = step.get("nodeIds", step.get("nodesToInspect", []))
        ids = [item if str(item).startswith(file_prefixes) else f"file:{item}" for item in ids]
        ids = [item for item in ids if item in node_ids]
        if not ids:
            continue
        item = {
            "order": index,
            "title": step.get("title", f"Bước {index}"),
            "description": step.get("description", step.get("whyItMatters", "Khám phá thành phần quan trọng của hệ thống.")),
            "nodeIds": ids,
        }
        if isinstance(step.get("languageLesson"), str):
            item["languageLesson"] = step["languageLesson"]
        clean_tour.append(item)

    final = {
        "version": "1.0.0",
        "project": {
            "name": scan["name"],
            "languages": scan["languages"],
            "frameworks": scan["frameworks"],
            "description": scan["description"],
            "analyzedAt": datetime.now(timezone.utc).isoformat(),
            "gitCommitHash": "ef92d78aa86916e6fbf4bc8a43044a4a4328154d",
        },
        "nodes": graph.get("nodes", []),
        "edges": graph.get("edges", []),
        "layers": clean_layers,
        "tour": clean_tour,
    }
    (INTER / "assembled-graph.json").write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding="utf-8")

    # Deterministic checks equivalent to the default Understand validator.
    issues, warnings = [], []
    seen = set()
    for idx, node in enumerate(final["nodes"]):
        for field in ("id", "type", "name", "summary", "tags"):
            if not node.get(field):
                issues.append(f"Node[{idx}] thiếu {field}")
        if node.get("id") in seen:
            issues.append(f"Node ID trùng: {node.get('id')}")
        seen.add(node.get("id"))
    for idx, edge in enumerate(final["edges"]):
        if edge.get("source") not in seen or edge.get("target") not in seen:
            issues.append(f"Edge[{idx}] dangling")
    file_types = {"file", "config", "document", "service", "pipeline", "table", "schema", "resource", "endpoint"}
    assigned = {}
    for layer in final["layers"]:
        for node_id in layer["nodeIds"]:
            if node_id in assigned:
                issues.append(f"Node thuộc nhiều layer: {node_id}")
            assigned[node_id] = layer["id"]
    for node in final["nodes"]:
        if node.get("type") in file_types and node.get("id") not in assigned:
            issues.append(f"File node chưa có layer: {node.get('id')}")
    for step in final["tour"]:
        for node_id in step["nodeIds"]:
            if node_id not in seen:
                issues.append(f"Tour dangling: {node_id}")
    connected = {edge[side] for edge in final["edges"] for side in ("source", "target")}
    warnings.extend(f"Orphan: {node['id']}" for node in final["nodes"] if node["id"] not in connected)
    stats = {
        "totalNodes": len(final["nodes"]),
        "totalEdges": len(final["edges"]),
        "totalLayers": len(final["layers"]),
        "tourSteps": len(final["tour"]),
        "nodeTypes": {}, "edgeTypes": {},
    }
    for node in final["nodes"]:
        stats["nodeTypes"][node["type"]] = stats["nodeTypes"].get(node["type"], 0) + 1
    for edge in final["edges"]:
        stats["edgeTypes"][edge["type"]] = stats["edgeTypes"].get(edge["type"], 0) + 1
    (INTER / "review.json").write_text(json.dumps({"issues": issues, "warnings": warnings, "stats": stats}, ensure_ascii=False, indent=2), encoding="utf-8")
    if issues:
        raise SystemExit(f"Final graph validation failed with {len(issues)} issues")
    (UA / "knowledge-graph.json").write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding="utf-8")
    fingerprint_input = {
        "projectRoot": str(ROOT),
        "sourceFilePaths": [item["path"] for item in scan["files"]],
        "gitCommitHash": final["project"]["gitCommitHash"],
    }
    (INTER / "fingerprint-input.json").write_text(
        json.dumps(fingerprint_input, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Validate AEGIS skills against the catalog and house standards.

Usage: python scripts/validate.py [--strict]
Exit code 1 on errors (and on warnings with --strict).
"""
import datetime as dt
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("PyYAML is required: pip install pyyaml")

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = ["name", "description", "module", "version", "jurisdictions", "risk_tier",
            "inputs", "outputs", "depends_on", "related", "last_reviewed", "license"]
RISK_TIERS = {"review-required", "self-serve", "internal"}
REQUIRED_SECTIONS = ["when to use", "inputs", "method", "output", "edge cases"]
INJECTION_PATTERNS = [
    r"ignore (all|any|previous) (instructions|rules)",
    r"disregard (the )?(system|previous)",
    r"curl\s+https?://", r"wget\s+https?://",
    r"send (it|this|the data) to https?://",
]
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")

errors, warnings = [], []


def err(path, msg):
    errors.append(f"{path}: {msg}")


def warn(path, msg):
    warnings.append(f"{path}: {msg}")


def parse(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        err(path, "missing YAML front matter")
        return None, text
    try:
        return yaml.safe_load(m.group(1)) or {}, m.group(2)
    except yaml.YAMLError as e:
        err(path, f"front matter is not valid YAML: {e}".splitlines()[0])
        return None, m.group(2)


def main(strict=False):
    catalog = json.loads((ROOT / "catalog/catalog.json").read_text())
    modules = {m["id"] for m in catalog["modules"]}
    entries = {s["id"]: s for s in catalog["skills"]}
    if len(entries) != len(catalog["skills"]):
        err("catalog.json", "duplicate skill ids")
    for s in catalog["skills"]:
        if s["module"] not in modules:
            err("catalog.json", f"{s['id']} has unknown module {s['module']}")

    found = set()
    for path in sorted((ROOT / "skills").glob("*/*/SKILL.md")):
        rel = path.relative_to(ROOT)
        module, name = path.parent.parent.name, path.parent.name
        sid = f"{module}/{name}"
        found.add(sid)
        fm, body = parse(path)
        if fm is None:
            continue
        for k in REQUIRED:
            if k not in fm:
                err(rel, f"missing field '{k}'")
        if fm.get("name") != f"{module}-{name}":
            err(rel, f"name should be '{module}-{name}'")
        if fm.get("module") != module:
            err(rel, "module does not match folder")
        if sid not in entries:
            err(rel, "not listed in catalog.json")
        elif entries[sid]["status"] != "built":
            err(rel, "catalog status should be 'built'")
        desc = str(fm.get("description", ""))
        if len(desc) > 600:
            err(rel, f"description is {len(desc)} chars (max 600)")
        if not re.search(r"\buse (when|for|before|after|to)\b", desc, re.I):
            warn(rel, "description should say 'Use when …' so the router can match it")
        if fm.get("risk_tier") not in RISK_TIERS:
            err(rel, f"risk_tier must be one of {sorted(RISK_TIERS)}")
        if not SEMVER.match(str(fm.get("version", ""))):
            err(rel, "version must be semver")
        for r in fm.get("related") or []:
            if r not in entries:
                err(rel, f"related id '{r}' not in catalog")
        for d in fm.get("depends_on") or []:
            if not (ROOT / d).exists():
                err(rel, f"depends_on '{d}' does not exist")
        for inp in fm.get("inputs") or []:
            if not isinstance(inp, dict) or not {"name", "required"} <= inp.keys():
                err(rel, "each input needs name and required")
        heads = " | ".join(h.lower() for h in re.findall(r"^#{2,3} (.+)$", body, re.M))
        for sec in REQUIRED_SECTIONS:
            if sec not in heads:
                warn(rel, f"no section matching '{sec}'")
        for pat in INJECTION_PATTERNS:
            for f in path.parent.rglob("*.md"):
                if re.search(pat, f.read_text(encoding="utf-8"), re.I):
                    # Quoted examples inside a security-audit skill are expected.
                    if module != "platform":
                        err(f.relative_to(ROOT), f"suspicious instruction pattern: {pat}")
        try:
            age = (dt.date.today() - dt.date.fromisoformat(str(fm.get("last_reviewed")))).days
            if age > 180:
                warn(rel, f"last_reviewed is {age} days old")
        except ValueError:
            err(rel, "last_reviewed must be an ISO date")

    for sid, s in entries.items():
        if s["status"] == "built" and sid not in found:
            err("catalog.json", f"{sid} marked built but skills/{sid}/SKILL.md missing")

    vf = (ROOT / "_shared/volatile-facts.md").read_text()
    m = re.search(r"as_of:\s*(\d{4}-\d{2}-\d{2})", vf)
    if m and (dt.date.today() - dt.date.fromisoformat(m.group(1))).days > 45:
        warn("_shared/volatile-facts.md", "as_of older than 45 days — re-verify")
    registered = set(re.findall(r"^\| ([A-Z]{2,4}-[A-Z0-9-]+) \|", vf, re.M))
    for path in (ROOT / "skills").rglob("*.md"):
        for vid in set(re.findall(r"\b((?:IN|EU|UK|US)-[A-Z]+-\d{2})\b", path.read_text())):
            if vid not in registered:
                warn(path.relative_to(ROOT), f"cites {vid} which is not in volatile-facts.md")

    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    built = sum(1 for s in entries.values() if s["status"] == "built")
    print(f"\n{len(found)} skills checked · {built}/{len(entries)} catalog entries built · "
          f"{len(errors)} errors · {len(warnings)} warnings")
    return 1 if errors or (strict and warnings) else 0


if __name__ == "__main__":
    sys.exit(main("--strict" in sys.argv))

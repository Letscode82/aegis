#!/usr/bin/env python3
"""Build dist/registry.json (consumed by the AEGIS runtime) and the README catalog table.

Usage: python scripts/build.py
"""
import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
START, END = "<!-- CATALOG:START -->", "<!-- CATALOG:END -->"


def load_skill(path):
    text = path.read_text(encoding="utf-8")
    fm, body = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S).groups()
    meta = yaml.safe_load(fm)
    refs = {
        str(p.relative_to(path.parent)): p.read_text(encoding="utf-8")
        for p in sorted((path.parent / "references").glob("*.md"))
    }
    return meta, body.strip(), refs


def main():
    catalog = json.loads((ROOT / "catalog/catalog.json").read_text())
    shared = {p.name: p.read_text(encoding="utf-8") for p in sorted((ROOT / "_shared").glob("*.md"))}
    skills = []
    for entry in catalog["skills"]:
        path = ROOT / "skills" / entry["id"] / "SKILL.md"
        item = dict(entry)
        if path.exists():
            meta, body, refs = load_skill(path)
            item.update(meta=meta, body=body, references=refs,
                        description=meta["description"], risk_tier=meta["risk_tier"],
                        version=meta["version"])
        skills.append(item)
    out = {"schema_version": 1, "modules": catalog["modules"], "shared": shared, "skills": skills}
    (ROOT / "dist").mkdir(exist_ok=True)
    (ROOT / "dist/registry.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=str))

    lines = []
    for m in catalog["modules"]:
        ms = [s for s in catalog["skills"] if s["module"] == m["id"]]
        built = sum(s["status"] == "built" for s in ms)
        lines += [f"### {m['title']} — {built}/{len(ms)} built", "", f"_{m['description']}_", "",
                  "| Skill | Status | Jurisdictions | What it does |", "|---|---|---|---|"]
        for s in ms:
            name = f"[{s['title']}](skills/{s['id']}/SKILL.md)" if s["status"] == "built" else s["title"]
            badge = "✅ built" if s["status"] == "built" else "🗺️ planned"
            lines.append(f"| {name} | {badge} | {', '.join(s['jurisdictions'])} | {s['summary']} |")
        lines.append("")
    readme = ROOT / "README.md"
    text = readme.read_text(encoding="utf-8")
    block = START + "\n" + "\n".join(lines) + END
    readme.write_text(re.sub(re.escape(START) + ".*?" + re.escape(END), block, text, flags=re.S))
    print(f"dist/registry.json: {len(skills)} entries, {sum(1 for s in skills if 'body' in s)} with content")


if __name__ == "__main__":
    main()

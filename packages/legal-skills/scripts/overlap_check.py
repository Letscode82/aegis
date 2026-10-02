#!/usr/bin/env python3
"""Clean-room check: measure verbatim overlap between AEGIS skills and a reference corpus.

Usage: python scripts/overlap_check.py <reference_dir> [--n 8] [--threshold 0.02]

Computes word n-gram shingles (default 8 words) for every Markdown file under skills/ and
reports, per AEGIS file, the share of its shingles that appear anywhere in the reference corpus
plus the longest shared runs. Short shared phrases ("this skill", statute titles) are normal;
long runs or a high share mean text was carried over and must be rewritten.
Exit code 1 if any file exceeds the threshold.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def words(text):
    text = re.sub(r"```.*?```", " ", text, flags=re.S)  # ignore code blocks
    return re.findall(r"[a-z0-9]+", text.lower())


def shingles(ws, n):
    return {" ".join(ws[i:i + n]) for i in range(len(ws) - n + 1)}


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    ref_dir = Path(args[0])
    n = int(args[args.index("--n") + 1]) if "--n" in args else 8
    threshold = float(args[args.index("--threshold") + 1]) if "--threshold" in args else 0.02

    ref = set()
    for f in ref_dir.rglob("*"):
        if f.is_file() and f.suffix.lower() in {".md", ".txt", ".py", ".json", ".yaml", ".yml"} and ".git" not in f.parts:
            ref |= shingles(words(f.read_text(errors="ignore")), n)

    worst, flagged = [], 0
    for f in sorted((ROOT / "skills").rglob("*.md")) + sorted((ROOT / "_shared").rglob("*.md")):
        mine = shingles(words(f.read_text()), n)
        if not mine:
            continue
        shared = mine & ref
        share = len(shared) / len(mine)
        worst.append((share, f.relative_to(ROOT), sorted(shared)[:3]))
        if share > threshold:
            flagged += 1

    worst.sort(reverse=True)
    print(f"Reference shingles: {len(ref):,}   n={n}   threshold={threshold:.1%}\n")
    for share, path, sample in worst[:15]:
        mark = "FAIL" if share > threshold else "ok  "
        print(f"{mark} {share:6.2%}  {path}")
        for s in sample:
            print(f"        · {s}")
    total = len(worst)
    print(f"\n{total} files scanned · {flagged} over threshold")
    return 1 if flagged else 0


if __name__ == "__main__":
    sys.exit(main())

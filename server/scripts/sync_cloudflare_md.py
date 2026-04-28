#!/usr/bin/env python3
"""sync_cloudflare_md.py

Reads Cloudflare tunnel + route info from a Markdown file and updates .env.local
so the Node server can reload Public Gateway config without manual editing.

- Input Markdown: work/Today/today/cloudflare.md
- Output env file: server/.env.local

This script uses only Python standard library (no pip installs required).

Usage (run from repo root):
  python server/scripts/sync_cloudflare_md.py

Optional env overrides:
  CLOUDFLARE_MD_PATH   Path to cloudflare.md
  ENV_LOCAL_PATH       Path to .env.local
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple


DEFAULT_MD_PATH = str(Path(__file__).resolve().parents[2] / "work" / "Today" / "today" / "cloudflare.md")
DEFAULT_ENV_LOCAL_PATH = str(Path(__file__).resolve().parents[1] / ".env.local")


def _read_text(p: str) -> str:
    return Path(p).read_text(encoding="utf-8", errors="replace")


def _extract_tunnel_id(md: str) -> Optional[str]:
    # Matches: **Tunnel ID** | **<uuid>**
    m = re.search(r"\*\*Tunnel ID\*\*\s*\|\s*\*\*([0-9a-fA-F-]{36})\*\*", md)
    if m:
        return m.group(1)

    # Fallback: any UUID in a line containing 'Tunnel ID'
    for line in md.splitlines():
        if "tunnel id" in line.lower():
            m2 = re.search(r"([0-9a-fA-F-]{36})", line)
            if m2:
                return m2.group(1)

    return None


def _extract_routes(md: str) -> List[Dict[str, str]]:
    routes: List[Dict[str, str]] = []

    # Find the routes table section by scanning markdown table lines.
    # Expected rows like:
    # | Published application | [a.example.com](...) | `[http://127.0.0.1:8000](http://127.0.0.1:8000)` | — |
    table_row_re = re.compile(r"^\|\s*Published application\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|", re.IGNORECASE)

    for raw in md.splitlines():
        line = raw.strip()
        if not line.startswith("|"):
            continue

        m = table_row_re.match(line)
        if not m:
            continue

        host_cell = m.group(1).strip()
        target_cell = m.group(2).strip()

        # Host can be markdown link: [a.example.com](https://a.example.com/)
        host_match = re.search(r"\[([^\]]+)\]", host_cell)
        host = (host_match.group(1) if host_match else host_cell).strip().lower()

        # Target can be backticked or markdown link.
        # Prefer the URL inside (http://...)
        target_match = re.search(r"\((https?://[^)]+)\)", target_cell)
        if target_match:
            target = target_match.group(1).strip()
        else:
            target = target_cell.strip("` ")

        if host and target:
            routes.append({"host": host, "target": target})

    # Deduplicate by host (last wins)
    out: Dict[str, Dict[str, str]] = {}
    for r in routes:
        out[r["host"]] = r
    return list(out.values())


def _parse_env_lines(env_text: str) -> Tuple[List[str], Dict[str, int]]:
    lines = env_text.splitlines(keepends=False)
    index: Dict[str, int] = {}

    for i, line in enumerate(lines):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if "=" not in s:
            continue
        key = s.split("=", 1)[0].strip()
        if key:
            index[key] = i

    return lines, index


def _env_quote_value(v: str) -> str:
    # Use JSON-style quoting to safely support spaces and quotes.
    return json.dumps(v, ensure_ascii=False)


def _upsert_env(lines: List[str], index: Dict[str, int], key: str, value: str) -> None:
    entry = f"{key}={_env_quote_value(value)}"
    if key in index:
        lines[index[key]] = entry
    else:
        lines.append(entry)
        index[key] = len(lines) - 1


def main() -> int:
    md_path = os.environ.get("CLOUDFLARE_MD_PATH", DEFAULT_MD_PATH)
    env_local_path = os.environ.get("ENV_LOCAL_PATH", DEFAULT_ENV_LOCAL_PATH)

    md_text = _read_text(md_path)

    tunnel_id = _extract_tunnel_id(md_text)
    routes = _extract_routes(md_text)

    if not tunnel_id:
        raise SystemExit(f"Tunnel ID not found in: {md_path}")

    if not routes:
        raise SystemExit(f"No routes found in: {md_path}")

    # Build PUBLIC_GATEWAY_ROUTES JSON
    routes_json = json.dumps(routes, ensure_ascii=False)

    env_file = Path(env_local_path)
    if not env_file.exists():
        raise SystemExit(f".env.local not found: {env_local_path}")

    lines, idx = _parse_env_lines(env_file.read_text(encoding="utf-8", errors="replace"))

    _upsert_env(lines, idx, "CLOUDFLARE_TUNNEL_ID", tunnel_id)
    _upsert_env(lines, idx, "PUBLIC_GATEWAY_ENABLED", "true")
    _upsert_env(lines, idx, "PUBLIC_GATEWAY_PORT", "9000")
    _upsert_env(lines, idx, "PUBLIC_GATEWAY_ROUTES", routes_json)

    # Require these env keys to be present before gateway serves public traffic.
    # Keep it minimal and actionable.
    _upsert_env(lines, idx, "PUBLIC_GATEWAY_REQUIRE_ENV", "UAS_API_KEY,CLOUDFLARE_TUNNEL_ID")

    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("Updated .env.local:")
    print(f"- CLOUDFLARE_TUNNEL_ID={tunnel_id}")
    print(f"- PUBLIC_GATEWAY_ROUTES={routes_json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

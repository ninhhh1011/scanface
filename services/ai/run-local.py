"""Local entrypoint. Load ignored root .env without printing credentials."""
import os
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
for line in (root / ".env").read_text(encoding="utf-8-sig").splitlines():
    if line.strip() and not line.lstrip().startswith("#") and "=" in line:
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))
os.chdir(Path(__file__).resolve().parent)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "worker":
        import runpy
        sys.argv = ["worker"] + sys.argv[2:]
        runpy.run_module("app.worker", run_name="__main__")
    elif len(sys.argv) > 1 and sys.argv[1] == "test":
        import pytest
        raise SystemExit(pytest.main(sys.argv[2:] or ["tests", "-q"]))
    else:
        import uvicorn
        uvicorn.run("app.main:app", host="127.0.0.1", port=8000, access_log=False, limit_concurrency=16, timeout_keep_alive=5)

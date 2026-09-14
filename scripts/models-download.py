"""Run with services/ai/.venv/Scripts/python.exe from repository root."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "ai"))
from app.models import download, MODELS, model_dir, verify
if '--verify' in sys.argv:
    for filename, (_, size, checksum) in MODELS.items():
        if not verify(model_dir() / filename, size, checksum):
            raise SystemExit('MODEL_VERIFICATION_FAILED: ' + filename)
    print('Both pinned model binaries verified; no download performed.')
else:
    download()

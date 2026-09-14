"""Immutable upstream model manifest, verified against Git LFS object metadata."""
import hashlib
import os
from pathlib import Path
import urllib.request

COMMIT = "47534e27c9851bb1128ccc0102f1145e27f23f98"
MODEL_VERSION = "yunet-2023mar+sface-2021dec:" + COMMIT[:12]
MODELS = {
    "face_detection_yunet_2023mar.onnx": ("face_detection_yunet", 232589, "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    "face_recognition_sface_2021dec.onnx": ("face_recognition_sface", 38696353, "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"),
}


def model_dir():
    return Path(os.environ.get("FACE_MODEL_DIR", Path(__file__).resolve().parents[3] / ".local" / "models"))


def verify(path, size, checksum):
    if not path.is_file() or path.stat().st_size != size: return False
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest() == checksum


def download():
    directory = model_dir()
    directory.mkdir(parents=True, exist_ok=True)
    for filename, (folder, size, checksum) in MODELS.items():
        target = directory / filename
        if not verify(target, size, checksum):
            url = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/{COMMIT}/models/{folder}/{filename}"
            temporary = target.with_suffix(".part")
            try:
                with urllib.request.urlopen(url, timeout=60) as response, temporary.open("wb") as output:
                    count = 0
                    while block := response.read(1024 * 1024):
                        count += len(block)
                        if count > size: raise ValueError("MODEL_SIZE_MISMATCH")
                        output.write(block)
                if not verify(temporary, size, checksum): raise ValueError("MODEL_CHECKSUM_MISMATCH")
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
        print(f"verified {filename} sha256={checksum}")


if __name__ == "__main__":
    download()

# Python/model third-party notices

Model sources are pinned and verified in `docs/MODEL_CARD.md`; no unlicensed third-party face images are distributed.

- YuNet detector: MIT, copyright (c) 2020 Shiqi Yu. Full upstream license retained in `services/ai/licenses/YuNet-MIT.txt`.
- SFace recognition directory: Apache License 2.0. Contributed by Yaoyao Zhong; ONNX conversion credited upstream to Chengrui Wang. Full license retained in `services/ai/licenses/SFace-Apache-2.0.txt`.
- OpenCV 4.12.0.88 / opencv-python-headless: Apache 2.0 core; binary distribution retains bundled codec/library notices in package metadata. See [OpenCV license](https://opencv.org/license/).
- FastAPI: MIT; Uvicorn: BSD-3-Clause; Starlette: BSD-3-Clause; HTTPX: BSD-3-Clause; NumPy: BSD-3-Clause.
- Cryptography: Apache-2.0 OR BSD-3-Clause; Psycopg 3: LGPL-3.0; pypdf: BSD-3-Clause; python-docx: MIT; Pillow: MIT-CMU; pytest: MIT.

Resolved package versions, including transitive dependencies, are pinned in `services/ai/requirements.txt`. Installed wheels retain their upstream license files and metadata. This notice lists used components; it does not imply certification, biometric accuracy guarantees, or a license to unrelated training datasets.

Document processing uses official [pypdf text extraction](https://pypdf.readthedocs.io/en/stable/user/extract-text.html) and [python-docx document API](https://python-docx.readthedocs.io/en/latest/api/document.html). The configured embedding adapter follows the [OpenAI-compatible embeddings request/response contract](https://developers.openai.com/api/reference/resources/embeddings/methods/create); the actual chosen provider/model must be configured and its terms approved by the operator. No provider is contacted when configuration is missing.

"""Private, text-only document extraction and explicitly configured embeddings."""
import hashlib
import io
import math
import os
from pathlib import PurePath
import re
import zipfile

import httpx
from docx import Document
from docx.text.paragraph import Paragraph
from pypdf import PdfReader

MAX_FILE = 10 * 1024 * 1024
MAX_TEXT = 1_000_000
MAX_CHUNKS = 1000


class IngestionError(ValueError):
    pass


def extract(data, filename, mime_type):
    if not 0 < len(data) <= MAX_FILE: raise IngestionError("FILE_SIZE_INVALID")
    suffix = PurePath(filename).suffix.lower()
    result = []
    if suffix in (".txt", ".md"):
        if mime_type not in ("text/plain", "text/markdown", "application/octet-stream"): raise IngestionError("FILE_TYPE_INVALID")
        try: text = data.decode("utf-8-sig")
        except UnicodeError: raise IngestionError("TEXT_ENCODING_INVALID") from None
        if "\x00" in text: raise IngestionError("FILE_TYPE_INVALID")
        heading, lines = None, []
        for line in text.splitlines():
            match = re.match(r"^#{1,6}\s+(.+)$", line) if suffix == ".md" else None
            if match:
                if lines: result.append({"content": "\n".join(lines), "section": heading, "page": None})
                heading, lines = match[1][:250], [line]
            else: lines.append(line)
        if lines: result.append({"content": "\n".join(lines), "section": heading, "page": None})
    elif suffix == ".pdf":
        if not data.startswith(b"%PDF-") or mime_type != "application/pdf": raise IngestionError("FILE_TYPE_INVALID")
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted: raise IngestionError("ENCRYPTED_DOCUMENT")
        if len(reader.pages) > 200: raise IngestionError("DOCUMENT_TOO_LARGE")
        for index, page in enumerate(reader.pages):
            # Bound decompressed content before the comparatively expensive text interpreter.
            content = page.get_contents()
            if content and len(content.get_data()) > 5_000_000: raise IngestionError("DOCUMENT_TOO_LARGE")
            text = page.extract_text() or ""
            if text.strip(): result.append({"content": text, "section": None, "page": index+1})
        if not result: raise IngestionError("UNSUPPORTED_SCAN_NEEDS_TEXT")
    elif suffix == ".docx":
        if mime_type != "application/vnd.openxmlformats-officedocument.wordprocessingml.document": raise IngestionError("FILE_TYPE_INVALID")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 2000 or sum(x.file_size for x in entries) > 30_000_000: raise IngestionError("DOCUMENT_TOO_LARGE")
            if any(x.flag_bits & 1 for x in entries): raise IngestionError("ENCRYPTED_DOCUMENT")
            if "word/document.xml" not in archive.namelist(): raise IngestionError("FILE_TYPE_INVALID")
        doc = Document(io.BytesIO(data))
        heading, lines = None, []
        for element in doc.iter_inner_content():
            if isinstance(element, Paragraph):
                if element.style.name.startswith("Heading"):
                    if lines: result.append({"content": "\n".join(lines), "section": heading, "page": None})
                    heading, lines = element.text[:250], []
                lines.append(element.text)
            else:
                lines.extend(" | ".join(cell.text for cell in row.cells) for row in element.rows)
        if lines: result.append({"content": "\n".join(lines), "section": heading, "page": None})
    else: raise IngestionError("UNSUPPORTED_FILE_TYPE")
    result = [section for section in result if section["content"].strip()]
    if not result: raise IngestionError("NEEDS_TEXT")
    if sum(len(s["content"]) for s in result) > MAX_TEXT: raise IngestionError("DOCUMENT_TOO_LARGE")
    return result


def chunks(sections):
    output = []
    for section in sections:
        text = section["content"].strip()
        start = 0
        while start < len(text):
            end = min(start+1200, len(text))
            if end < len(text):
                split = text.rfind("\n", start+700, end)
                if split > start: end = split
            content = text[start:end].strip()
            if content:
                output.append({"content": content, "section": section["section"], "page": section["page"], "content_hash": hashlib.sha256(content.encode()).hexdigest()})
            if len(output) > MAX_CHUNKS: raise IngestionError("TOO_MANY_CHUNKS")
            if end >= len(text): break
            start = end-150
    if not output: raise IngestionError("NEEDS_TEXT")
    return output


def validate_embeddings(payload, count, dimension):
    try:
        rows = payload["data"]
        if len(rows) != count: raise ValueError()
        indices = set()
        for i, row in enumerate(rows):
            idx = row.get("index")
            indices.add(i if idx is None else idx)
        if indices != set(range(count)): raise ValueError()
        vectors = [row["embedding"] for i, row in sorted(enumerate(rows), key=lambda item: item[1].get("index") if item[1].get("index") is not None else item[0])]
        for vector in vectors:
            if len(vector) != dimension or not all(type(x) in (float, int) and math.isfinite(x) for x in vector): raise ValueError()
            if sum(x*x for x in vector) <= 1e-12: raise ValueError()
        return vectors
    except (KeyError, TypeError, ValueError): raise IngestionError("EMBEDDING_RESPONSE_INVALID") from None


def embedding_config():
    base, key, model = (os.environ.get(k, "") for k in ("EMBEDDING_BASE_URL", "EMBEDDING_API_KEY", "EMBEDDING_MODEL"))
    try: dimension = int(os.environ.get("EMBEDDING_DIMENSION", "0"))
    except ValueError: dimension = 0
    if not base or not key or not model or not 1 <= dimension <= 4096: raise IngestionError("EMBEDDINGS_NOT_CONFIGURED")
    url = httpx.URL(base)
    if url.scheme != "https" and not (url.scheme == "http" and url.host in ("localhost", "127.0.0.1", "host.docker.internal")):
        raise IngestionError("EMBEDDING_URL_INVALID")
    if url.username or url.password or url.query or url.fragment: raise IngestionError("EMBEDDING_URL_INVALID")
    return base.rstrip("/"), key, model, dimension


def embed(texts):
    base, key, model, dimension = embedding_config()
    try:
        # Fixed configured URL only; documents never control endpoint, model, ACL or instructions.
        with httpx.Client(timeout=httpx.Timeout(45, connect=10), follow_redirects=False) as client:
            response = client.post(base+"/embeddings", headers={"Authorization": "Bearer "+key}, json={"model": model, "input": texts, "encoding_format": "float", "dimensions": dimension})
            response.raise_for_status()
            if len(response.content) > 8_000_000: raise IngestionError("EMBEDDING_RESPONSE_TOO_LARGE")
            return validate_embeddings(response.json(), len(texts), dimension)
    except (httpx.HTTPError, ValueError) as exc:
        if isinstance(exc, IngestionError): raise
        raise IngestionError("EMBEDDING_PROVIDER_ERROR") from None

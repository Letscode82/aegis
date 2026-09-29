"""
AEGIS embedding service — a small, self-hosted CPU sentence-embedding endpoint.

Deployed to Railway (or any container host) so privileged legal text is embedded
in-tenant and never leaves for a third-party API. The HTTP contract matches what
@aegis/search's `EMBEDDINGS_URL` provider expects:

    POST /embed   {"input": ["text", ...], "model": "<ignored>"}
      -> {"embeddings": [[...floats...], ...], "model": "<name>", "dim": N}
    GET  /health  -> {"ok": true, "model": "<name>", "dim": N}

Config (env):
    MODEL_NAME           HF model id (default BAAI/bge-small-en-v1.5, 384-dim)
    EMBEDDINGS_API_KEY   optional bearer token; when set, /embed requires it

The AEGIS side stores `self:<EMBEDDINGS_MODEL>` as the retrieval partition key,
so set EMBEDDINGS_MODEL on the app to a stable label (e.g. bge-small-en-v1.5).
"""
import os
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.environ.get("MODEL_NAME", "BAAI/bge-small-en-v1.5")
API_KEY = os.environ.get("EMBEDDINGS_API_KEY", "")
MAX_BATCH = int(os.environ.get("MAX_BATCH", "128"))

app = FastAPI(title="AEGIS Embeddings", version="1.0")
model = SentenceTransformer(MODEL_NAME)
DIM = model.get_sentence_embedding_dimension()


class EmbedRequest(BaseModel):
    input: list[str]
    model: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME, "dim": DIM}


@app.post("/embed")
def embed(req: EmbedRequest, authorization: str | None = Header(default=None)):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")
    if not req.input:
        return {"embeddings": [], "model": MODEL_NAME, "dim": DIM}
    if len(req.input) > MAX_BATCH:
        raise HTTPException(status_code=413, detail=f"batch too large (max {MAX_BATCH})")
    # normalize_embeddings=True → unit vectors, so cosine distance is well-behaved.
    vecs = model.encode(req.input, normalize_embeddings=True, convert_to_numpy=True)
    return {"embeddings": vecs.tolist(), "model": MODEL_NAME, "dim": DIM}

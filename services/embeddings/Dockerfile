FROM python:3.11-slim
WORKDIR /app

ENV HF_HOME=/app/.hf \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Bake the model weights into the image so the first request doesn't pay a
# cold download. Override MODEL_NAME at build time to ship a different model.
ARG MODEL_NAME=BAAI/bge-small-en-v1.5
ENV MODEL_NAME=${MODEL_NAME}
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${MODEL_NAME}')"

# Railway/most hosts inject $PORT; default to 8000 for local `docker run`.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

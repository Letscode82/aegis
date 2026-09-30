FROM python:3.11-slim
WORKDIR /app

# HF_HOME keeps the auto-downloaded Laya weights on the image/volume layer.
# LAYA_PRELOAD=1 loads the model at boot so the first /v1/systemone request
# doesn't pay the cold-start. LAYA_DEVICE=cpu / LAYA_MODELS=english keep the
# footprint inside a small ($5) Railway CPU instance.
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/app/.hf \
    LAYA_DEVICE=cpu \
    LAYA_PRELOAD=1 \
    LAYA_MODELS=english

RUN pip install --no-cache-dir "laya[serve]"

# Railway/most hosts inject $PORT; default to 8000 for local `docker run`.
# LAYA_HOST must be 0.0.0.0 so the container is reachable off-host.
CMD ["sh", "-c", "LAYA_HOST=0.0.0.0 LAYA_PORT=${PORT:-8000} laya-serve"]

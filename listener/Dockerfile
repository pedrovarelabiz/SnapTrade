# SnapTrade Listener
FROM python:3.11-slim
WORKDIR /app

# Install tesseract for OCR (pocket_vip_sticker parser)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./
COPY .env .env

HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
  CMD python3 -c "import os; exit(0 if os.path.exists('/tmp/listener_alive') else 1)"

CMD ["python3", "listener.py"]

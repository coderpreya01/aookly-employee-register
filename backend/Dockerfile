FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libopenblas0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps face_recognition==1.3.0

COPY . .
EXPOSE 8001
CMD ["uvicorn", "backend_app:app", "--host", "0.0.0.0", "--port", "8001"]

# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Python backend and serve both
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system dependencies:
# - libgl1 and libglib2.0-0 resolve "ImportError: libGL.so.1: cannot open shared object file"
# - libgomp1 and libopenblas0 for numpy, dlib, and face recognition
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libgomp1 \
       libopenblas0 \
       libgl1 \
       libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && pip install --no-cache-dir --no-deps face_recognition==1.3.0 \
    && pip uninstall -y opencv-python opencv-contrib-python || true \
    && pip install --no-cache-dir --no-deps --force-reinstall opencv-python-headless

# Copy backend files
COPY backend/ backend/

# Copy built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8001

WORKDIR /app/backend

# Render provides $PORT; falls back to 8001 locally
CMD ["sh", "-c", "uvicorn backend_app:app --host 0.0.0.0 --port ${PORT:-8001}"]

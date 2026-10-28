# ---------- Stage 1: Build the React frontend ----------
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build


# ---------- Stage 2: Python backend + serve built frontend ----------
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System libs: libgl1 + libglib2.0-0 fix the "libGL.so.1" error
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

# Copy backend files (includes migrate_photos_to_cloudinary.py and employee_photos/ if present)
COPY backend/ backend/

# Copy built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8001

WORKDIR /app/backend

# On every start: 1) upload any local /photos/... images to Cloudinary and update the DB
# (already-uploaded photos are skipped; "|| true" keeps the app starting even if migration fails)
# 2) start the API. Render provides $PORT; falls back to 8001 locally.
CMD ["sh", "-c", "python migrate_photos_to_cloudinary.py || true; exec uvicorn backend_app:app --host 0.0.0.0 --port ${PORT:-8001}"]
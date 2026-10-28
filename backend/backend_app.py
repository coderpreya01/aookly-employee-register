import asyncio
import io
import os
import shutil
from contextlib import asynccontextmanager
from datetime import datetime

import asyncpg
import cv2
from insightface.app import FaceAnalysis
import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Load environment variables from .env
load_dotenv()

# Configuration from .env
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in .env")
PORT = int(os.getenv("PORT", 8001))
HOST = os.getenv("HOST", "0.0.0.0")

# Directory to save uploaded images
UPLOAD_DIR = "employee_photos"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# InsightFace produces 512-dimensional face embeddings using buffalo_l
EMBEDDING_DIM = 512

# Initialize InsightFace model for buffalo_l
face_app = FaceAnalysis(name='buffalo_l')
face_app.prepare(ctx_id=-1, det_size=(640, 640))

# Pose labels for the 3 required photos
PHOTO_LABELS = ["left_side", "right_side", "front_face"]

SCHEMA_SQL = f"""
CREATE TABLE IF NOT EXISTS aookly_register_employees (
    id           SERIAL PRIMARY KEY,
    employee_id  TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    designation  TEXT NOT NULL DEFAULT '',
    department   TEXT NOT NULL DEFAULT '',
    photos       TEXT[] NOT NULL DEFAULT '{{}}',
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE aookly_register_employees ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT '';
ALTER TABLE aookly_register_employees ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS aookly_register_faceemdding (
    id           SERIAL PRIMARY KEY,
    employee_id  TEXT NOT NULL REFERENCES aookly_register_employees(employee_id) ON DELETE CASCADE,
    photo_index  INT NOT NULL,
    embedding    float8[] NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, photo_index)
);

CREATE TABLE IF NOT EXISTS aookly_register_attendance (
    id           SERIAL PRIMARY KEY,
    employee_id  TEXT NOT NULL REFERENCES aookly_register_employees(employee_id) ON DELETE CASCADE,
    date         DATE NOT NULL,
    time         TIME NOT NULL,
    status       TEXT NOT NULL DEFAULT 'Present',
    UNIQUE (employee_id, date)
);
"""


async def connect_with_retry(retries: int = 20, delay: int = 2) -> asyncpg.Connection:
    """Wait for PostgreSQL to accept connections (useful when starting with Docker)."""
    for attempt in range(1, retries + 1):
        try:
            return await asyncpg.connect(DATABASE_URL)
        except (OSError, asyncpg.PostgresError) as e:
            print(f"PostgreSQL not ready (attempt {attempt}/{retries}): {e}")
            await asyncio.sleep(delay)
    raise RuntimeError("Could not connect to PostgreSQL")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1) create tables first
    conn = await connect_with_retry()
    try:
        await conn.execute(SCHEMA_SQL)
    finally:
        await conn.close()

    # 2) connection pool
    app.state.pool = await asyncpg.create_pool(
        DATABASE_URL, min_size=1, max_size=10
    )
    yield
    await app.state.pool.close()


app = FastAPI(title="Alphabet Employee Registration & Attendance", lifespan=lifespan)

# Serve employee photos as static files at /photos/<employeeId>/<filename>
app.mount("/photos", StaticFiles(directory=UPLOAD_DIR), name="employee_photos")

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AttendanceRequest(BaseModel):
    employeeId: str


def compute_embedding(image_bytes: bytes, label: str) -> np.ndarray:
    """Return the 512-d face embedding for an image that contains exactly one face using InsightFace."""
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Image decoding failed")
    except Exception:
        raise HTTPException(status_code=400, detail=f"{label} is not a valid image")

    faces = face_app.get(img)
    if len(faces) == 0:
        raise HTTPException(status_code=400, detail=f"No face detected in {label}")
    if len(faces) > 1:
        raise HTTPException(status_code=400, detail=f"Multiple faces detected in {label}; use a photo with one person")
    return faces[0].embedding


@app.get("/api/health")
async def health():
    async with app.state.pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}


@app.post("/api/register-employee")
async def register_employee(
    name: str = Form(...),
    email: str = Form(...),
    employeeId: str = Form(...),
    designation: str = Form(...),
    department: str = Form(...),
    photo_1: UploadFile = File(...),  # Left side face
    photo_2: UploadFile = File(...),  # Right side face
    photo_3: UploadFile = File(...),  # Front face
):
    emp_folder = None
    try:
        # employeeId is used as a folder name, so it must be a plain name
        if not employeeId.strip() or os.path.basename(employeeId) != employeeId:
            raise HTTPException(status_code=400, detail="Invalid Employee ID")

        pool = app.state.pool

        # Check if employee already exists
        async with pool.acquire() as conn:
            existing_emp = await conn.fetchval(
                "SELECT 1 FROM aookly_register_employees WHERE employee_id = $1", employeeId
            )
        if existing_emp:
            raise HTTPException(status_code=400, detail="Employee ID already exists")

        # Read photos and create the face embedding of each one
        photos = [photo_1, photo_2, photo_3]
        photo_bytes = [await p.read() for p in photos]
        embeddings = []
        pose_labels = ["Left Side", "Right Side", "Front Face"]
        for idx, data in enumerate(photo_bytes):
            emb = await asyncio.to_thread(compute_embedding, data, pose_labels[idx])
            embeddings.append(emb)

        # Process and save photos — store URL-accessible paths (relative to /photos mount)
        photo_urls = []
        emp_folder = os.path.join(UPLOAD_DIR, employeeId)
        os.makedirs(emp_folder, exist_ok=True)

        for idx, (photo, data) in enumerate(zip(photos, photo_bytes)):
            ext = photo.filename.split('.')[-1].lower() if photo.filename and '.' in photo.filename else 'jpg'
            pose_name = PHOTO_LABELS[idx]  # left_side, right_side, front_face
            file_name = f"{pose_name}.{ext}"
            file_path = os.path.join(emp_folder, file_name)

            with open(file_path, "wb") as buffer:
                buffer.write(data)

            # Store as a URL path that the frontend can access via /photos/
            photo_urls.append(f"/photos/{employeeId}/{file_name}")

        # Insert employee + embeddings in one transaction
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO aookly_register_employees (employee_id, name, email, designation, department, photos, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    employeeId, name, email, designation, department, photo_urls, datetime.now(),
                )
                for idx, emb in enumerate(embeddings, start=1):
                    await conn.execute(
                        """
                        INSERT INTO aookly_register_faceemdding (employee_id, photo_index, embedding)
                        VALUES ($1, $2, $3)
                        """,
                        employeeId, idx, emb.tolist(),
                    )

        return {
            "message": "Employee registered successfully",
            "employeeId": employeeId,
            "photos": photo_urls,
        }

    except HTTPException as he:
        if emp_folder and os.path.isdir(emp_folder):
            shutil.rmtree(emp_folder, ignore_errors=True)
        raise he
    except asyncpg.UniqueViolationError:
        if emp_folder and os.path.isdir(emp_folder):
            shutil.rmtree(emp_folder, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Employee ID already exists")
    except Exception as e:
        if emp_folder and os.path.isdir(emp_folder):
            shutil.rmtree(emp_folder, ignore_errors=True)
        print(f"Error registering employee: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/mark-attendance")
async def mark_attendance(req: AttendanceRequest):
    try:
        employeeId = req.employeeId
        pool = app.state.pool

        async with pool.acquire() as conn:
            # Check if employee exists
            existing_emp = await conn.fetchval(
                "SELECT 1 FROM aookly_register_employees WHERE employee_id = $1", employeeId
            )
            if not existing_emp:
                raise HTTPException(status_code=404, detail="Employee ID not found. Please register first.")

            now = datetime.now()
            today = now.date()
            current_time = now.time().replace(microsecond=0)

            # Check if already marked attendance today
            already_marked = await conn.fetchrow(
                "SELECT time FROM aookly_register_attendance WHERE employee_id = $1 AND date = $2",
                employeeId, today,
            )
            if already_marked:
                raise HTTPException(
                    status_code=400,
                    detail=f"Attendance already marked for today at {already_marked['time'].strftime('%H:%M:%S')}",
                )

            await conn.execute(
                """
                INSERT INTO aookly_register_attendance (employee_id, date, time, status)
                VALUES ($1, $2, $3, 'Present')
                """,
                employeeId, today, current_time,
            )

        return {
            "message": "Attendance marked successfully",
            "employeeId": employeeId,
            "date": today.strftime("%Y-%m-%d"),
            "time": current_time.strftime("%H:%M:%S"),
        }

    except HTTPException as he:
        raise he
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=400, detail="Attendance already marked for today")
    except Exception as e:
        print(f"Error marking attendance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/identify-face")
async def identify_face(
    photo: UploadFile = File(...),
    threshold: float = Query(0.6, description="Max L2 distance for a match (lower = stricter)"),
):
    """Optional: find the closest registered employee for a face photo using pgvector search."""
    try:
        emb = await asyncio.to_thread(compute_embedding, await photo.read(), "Photo")
        async with app.state.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT e.employee_id, e.name, f.embedding
                FROM aookly_register_faceemdding f
                JOIN aookly_register_employees e ON e.employee_id = f.employee_id
                """
            )
            
        if not rows:
            raise HTTPException(status_code=404, detail="No registered employees found")
            
        min_distance = float('inf')
        best_match = None
        
        for row in rows:
            db_emb = np.array(row["embedding"])
            distance = np.linalg.norm(db_emb - emb)
            if distance < min_distance:
                min_distance = distance
                best_match = row
                
        if min_distance > threshold:
            raise HTTPException(status_code=404, detail="No matching employee found")
            
        return {
            "employeeId": best_match["employee_id"],
            "name": best_match["name"],
            "distance": float(min_distance),
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error identifying face: {e}")
        raise HTTPException(status_code=500, detail=str(e))


from fastapi.responses import FileResponse

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("photos/"):
        raise HTTPException(status_code=404, detail="Not Found")
    
    # Go up one directory from backend to reach the root, then into frontend/dist
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_dir = os.path.join(base_dir, "frontend", "dist")
    file_path = os.path.join(dist_dir, full_path)
    
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    
    index_file = os.path.join(dist_dir, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)
        
    raise HTTPException(status_code=404, detail="Not Found")

if __name__ == "__main__":
    uvicorn.run("backend_app:app", host=HOST, port=PORT, reload=True)
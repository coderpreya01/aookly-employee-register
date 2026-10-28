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
from typing import Optional

import cloudinary
import cloudinary.uploader
import cloudinary.api

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Query, UploadFile
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

# Cloudinary configuration
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )
    print(f"Cloudinary configured successfully for cloud: {CLOUDINARY_CLOUD_NAME}")
else:
    print("Warning: Cloudinary credentials not fully configured in .env")

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


def upload_to_cloudinary(image_bytes: bytes, employee_id: str, pose_name: str) -> Optional[str]:
    """Uploads photo bytes to Cloudinary and returns the secure URL, or None if failed."""
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        return None
    try:
        timestamp = int(datetime.now().timestamp())
        res = cloudinary.uploader.upload(
            image_bytes,
            folder=f"emp_register/{employee_id}",
            public_id=f"{pose_name}_{timestamp}",
            overwrite=True,
            resource_type="image",
        )
        return res.get("secure_url")
    except Exception as e:
        print(f"Cloudinary upload failed for {employee_id} {pose_name}: {e}")
        return None

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

        # Process and save photos — upload to Cloudinary and also keep local backup
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

            # Upload to Cloudinary
            cloud_url = await asyncio.to_thread(upload_to_cloudinary, data, employeeId, pose_name)
            if cloud_url:
                photo_urls.append(cloud_url)
            else:
                # Fallback to local URL path
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


# ── Dashboard & Registered Employee Routes ────────────────────────────────
dashboard_router = APIRouter(tags=["Dashboard"])


@dashboard_router.get("/api/dashboard")
async def get_dashboard(
    search: Optional[str] = Query(None, description="Search by name, employee_id, email, designation, or department"),
    limit: int = Query(100, ge=1, le=1000, description="Max employees to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """Retrieve registered employee details for the dashboard."""
    try:
        pool = app.state.pool
        async with pool.acquire() as conn:
            total_count = await conn.fetchval("SELECT COUNT(*) FROM aookly_register_employees")

            if search and search.strip():
                search_term = f"%{search.strip()}%"
                filtered_count = await conn.fetchval(
                    """
                    SELECT COUNT(*)
                    FROM aookly_register_employees
                    WHERE name ILIKE $1
                       OR employee_id ILIKE $1
                       OR email ILIKE $1
                       OR designation ILIKE $1
                       OR department ILIKE $1
                    """,
                    search_term,
                )
                rows = await conn.fetch(
                    """
                    SELECT id, employee_id, name, email, designation, department, photos, created_at
                    FROM aookly_register_employees
                    WHERE name ILIKE $1
                       OR employee_id ILIKE $1
                       OR email ILIKE $1
                       OR designation ILIKE $1
                       OR department ILIKE $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    search_term,
                    limit,
                    offset,
                )
            else:
                filtered_count = total_count
                rows = await conn.fetch(
                    """
                    SELECT id, employee_id, name, email, designation, department, photos, created_at
                    FROM aookly_register_employees
                    ORDER BY created_at DESC
                    LIMIT $1 OFFSET $2
                    """,
                    limit,
                    offset,
                )

            employees = [
                {
                    "id": row["id"],
                    "employee_id": row["employee_id"],
                    "name": row["name"],
                    "email": row["email"],
                    "designation": row["designation"],
                    "department": row["department"],
                    "photos": row["photos"] or [],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                }
                for row in rows
            ]

            return {
                "status": "success",
                "total_registered_employees": total_count,
                "filtered_count": filtered_count,
                "employees": employees,
            }
    except Exception as e:
        print(f"Error fetching dashboard data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@dashboard_router.get("/api/dashboard/employees")
@dashboard_router.get("/api/employees")
async def get_all_registered_employees():
    """Retrieve all registered employees details."""
    try:
        pool = app.state.pool
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, employee_id, name, email, designation, department, photos, created_at
                FROM aookly_register_employees
                ORDER BY created_at DESC
                """
            )
            employees = [
                {
                    "id": row["id"],
                    "employee_id": row["employee_id"],
                    "name": row["name"],
                    "email": row["email"],
                    "designation": row["designation"],
                    "department": row["department"],
                    "photos": row["photos"] or [],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                }
                for row in rows
            ]
            return {
                "status": "success",
                "total": len(employees),
                "employees": employees,
            }
    except Exception as e:
        print(f"Error fetching registered employees: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@dashboard_router.get("/api/dashboard/employee/{employee_id}")
@dashboard_router.get("/api/employees/{employee_id}")
async def get_registered_employee_by_id(employee_id: str):
    """Retrieve single registered employee details by employee_id."""
    try:
        pool = app.state.pool
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, employee_id, name, email, designation, department, photos, created_at
                FROM aookly_register_employees
                WHERE employee_id = $1
                """,
                employee_id,
            )
            if not row:
                raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found")

            return {
                "status": "success",
                "employee": {
                    "id": row["id"],
                    "employee_id": row["employee_id"],
                    "name": row["name"],
                    "email": row["email"],
                    "designation": row["designation"],
                    "department": row["department"],
                    "photos": row["photos"] or [],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                },
            }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching employee details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@dashboard_router.delete("/api/dashboard/employee/{employee_id}")
@dashboard_router.delete("/api/employees/{employee_id}")
async def delete_employee(employee_id: str):
    """Delete employee and remove face embeddings, attendance records, and photos."""
    try:
        pool = app.state.pool
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                "SELECT employee_id FROM aookly_register_employees WHERE employee_id = $1",
                employee_id,
            )
            if not existing:
                raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found")

            # Cascade delete in DB (cascades to embeddings and attendance)
            await conn.execute("DELETE FROM aookly_register_employees WHERE employee_id = $1", employee_id)

        # Remove local folder
        emp_folder = os.path.join(UPLOAD_DIR, employee_id)
        if os.path.isdir(emp_folder):
            shutil.rmtree(emp_folder, ignore_errors=True)

        # Cleanup Cloudinary photos
        if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
            try:
                await asyncio.to_thread(
                    cloudinary.api.delete_resources_by_prefix,
                    f"emp_register/{employee_id}",
                )
            except Exception as ce:
                print(f"Cloudinary deletion notice: {ce}")

        return {
            "status": "success",
            "message": f"Employee '{employee_id}' and all associated records deleted successfully",
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error deleting employee: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@dashboard_router.put("/api/dashboard/employee/{employee_id}")
@dashboard_router.put("/api/employees/{employee_id}")
@dashboard_router.post("/api/employees/{employee_id}/update")
async def update_employee(
    employee_id: str,
    name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    designation: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    photo_1: Optional[UploadFile] = File(None),
    photo_2: Optional[UploadFile] = File(None),
    photo_3: Optional[UploadFile] = File(None),
):
    """Update employee details and optionally re-upload/re-capture any of the 3 photos with face re-embedding."""
    try:
        pool = app.state.pool
        async with pool.acquire() as conn:
            emp = await conn.fetchrow(
                "SELECT * FROM aookly_register_employees WHERE employee_id = $1",
                employee_id,
            )
            if not emp:
                raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found")

            curr_name = name.strip() if name and name.strip() else emp["name"]
            curr_email = email.strip() if email and email.strip() else emp["email"]
            curr_designation = designation.strip() if designation is not None else emp["designation"]
            curr_department = department.strip() if department is not None else emp["department"]

            photos_list = list(emp["photos"]) if emp["photos"] else ["", "", ""]
            while len(photos_list) < 3:
                photos_list.append("")

            emp_folder = os.path.join(UPLOAD_DIR, employee_id)
            os.makedirs(emp_folder, exist_ok=True)

            updated_photos = [photo_1, photo_2, photo_3]
            pose_labels = ["Left Side", "Right Side", "Front Face"]

            for idx, p_file in enumerate(updated_photos):
                if p_file is not None and getattr(p_file, "filename", None):
                    data = await p_file.read()
                    if len(data) > 0:
                        # 1. Compute embedding
                        emb = await asyncio.to_thread(compute_embedding, data, pose_labels[idx])

                        # 2. Save locally
                        pose_name = PHOTO_LABELS[idx]
                        ext = p_file.filename.split('.')[-1].lower() if '.' in p_file.filename else 'jpg'
                        file_name = f"{pose_name}.{ext}"
                        file_path = os.path.join(emp_folder, file_name)
                        with open(file_path, "wb") as buffer:
                            buffer.write(data)

                        # 3. Upload to Cloudinary
                        cloud_url = await asyncio.to_thread(upload_to_cloudinary, data, employee_id, pose_name)
                        if cloud_url:
                            photos_list[idx] = cloud_url
                        else:
                            photos_list[idx] = f"/photos/{employee_id}/{file_name}"

                        # 4. Upsert face embedding in database
                        await conn.execute(
                            """
                            INSERT INTO aookly_register_faceemdding (employee_id, photo_index, embedding, created_at)
                            VALUES ($1, $2, $3, NOW())
                            ON CONFLICT (employee_id, photo_index)
                            DO UPDATE SET embedding = EXCLUDED.embedding, created_at = NOW()
                            """,
                            employee_id,
                            idx + 1,
                            emb.tolist(),
                        )

            # Update aookly_register_employees record
            await conn.execute(
                """
                UPDATE aookly_register_employees
                SET name = $1, email = $2, designation = $3, department = $4, photos = $5
                WHERE employee_id = $6
                """,
                curr_name,
                curr_email,
                curr_designation,
                curr_department,
                photos_list,
                employee_id,
            )

            updated_emp = await conn.fetchrow(
                "SELECT id, employee_id, name, email, designation, department, photos, created_at FROM aookly_register_employees WHERE employee_id = $1",
                employee_id,
            )

        return {
            "status": "success",
            "message": "Employee updated successfully",
            "employee": {
                "id": updated_emp["id"],
                "employee_id": updated_emp["employee_id"],
                "name": updated_emp["name"],
                "email": updated_emp["email"],
                "designation": updated_emp["designation"],
                "department": updated_emp["department"],
                "photos": updated_emp["photos"] or [],
                "created_at": updated_emp["created_at"].isoformat() if updated_emp["created_at"] else None,
            },
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error updating employee: {e}")
        raise HTTPException(status_code=500, detail=str(e))


app.include_router(dashboard_router)


from fastapi.responses import FileResponse

def get_frontend_dist_dir():
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist"),
        "/app/frontend/dist",
        os.path.abspath("frontend/dist"),
        os.path.abspath("../frontend/dist"),
    ]
    for candidate in candidates:
        if os.path.isdir(candidate):
            return candidate
    return None


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("photos/"):
        raise HTTPException(status_code=404, detail="Not Found")

    dist_dir = get_frontend_dist_dir()
    if dist_dir:
        file_path = os.path.join(dist_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)

        index_file = os.path.join(dist_dir, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)

    raise HTTPException(status_code=404, detail="Not Found")

if __name__ == "__main__":
    uvicorn.run("backend_app:app", host=HOST, port=PORT, reload=True)
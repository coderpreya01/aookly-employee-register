import asyncio
import glob
import os
import sys
from datetime import datetime

import asyncpg
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
API_KEY = os.getenv("CLOUDINARY_API_KEY")
API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not found in .env")
if not (CLOUD_NAME and API_KEY and API_SECRET):
    raise SystemExit("Cloudinary credentials not found in .env")

cloudinary.config(
    cloud_name=CLOUD_NAME,
    api_key=API_KEY,
    api_secret=API_SECRET,
    secure=True,
)

# Change this if your photos table has a different name
TABLE = "aookly_register_employees"
UPLOAD_DIR = "employee_photos"
PHOTO_LABELS = ["left_side", "right_side", "front_face"]

# Run with --dry-run to only see what would be uploaded
DRY_RUN = "--dry-run" in sys.argv


def find_local_file(employee_id: str, db_path: str, pose_name: str):
    """Find the local photo file for a '/photos/<emp>/<file>' path."""
    rel = db_path[len("/photos/"):] if db_path.startswith("/photos/") else db_path
    candidate = os.path.join(UPLOAD_DIR, *rel.split("/"))
    if os.path.isfile(candidate):
        return candidate

    # Fallback: same pose name with any extension in the employee folder
    matches = glob.glob(os.path.join(UPLOAD_DIR, employee_id, f"{pose_name}.*"))
    return matches[0] if matches else None


def upload_file(file_path: str, employee_id: str, pose_name: str):
    timestamp = int(datetime.now().timestamp())
    res = cloudinary.uploader.upload(
        file_path,
        folder=f"emp_register/{employee_id}",
        public_id=f"{pose_name}_{timestamp}",
        overwrite=True,
        resource_type="image",
    )
    return res.get("secure_url")


async def main():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        rows = await conn.fetch(
            f"SELECT employee_id, photos FROM {TABLE} ORDER BY id"
        )
        print(f"Found {len(rows)} employees. Dry run: {DRY_RUN}\n")

        migrated_emps = 0
        uploaded = 0
        failed = 0

        for row in rows:
            employee_id = row["employee_id"]
            photos = list(row["photos"] or [])
            changed = False

            for idx, url in enumerate(photos):
                # Already on Cloudinary (or any http URL) -> skip
                if not url or url.startswith("http"):
                    continue

                pose_name = PHOTO_LABELS[idx] if idx < len(PHOTO_LABELS) else f"photo_{idx + 1}"
                local_file = find_local_file(employee_id, url, pose_name)

                if not local_file:
                    print(f"[MISSING] {employee_id} {pose_name}: local file not found for {url}")
                    failed += 1
                    continue

                if DRY_RUN:
                    print(f"[DRY-RUN] {employee_id} {pose_name}: would upload {local_file}")
                    continue

                try:
                    new_url = await asyncio.to_thread(
                        upload_file, local_file, employee_id, pose_name
                    )
                    if new_url:
                        photos[idx] = new_url
                        changed = True
                        uploaded += 1
                        print(f"[OK] {employee_id} {pose_name} -> {new_url}")
                    else:
                        print(f"[FAILED] {employee_id} {pose_name}: no URL returned")
                        failed += 1
                except Exception as e:
                    print(f"[FAILED] {employee_id} {pose_name}: {e}")
                    failed += 1

            if changed:
                await conn.execute(
                    f"UPDATE {TABLE} SET photos = $1 WHERE employee_id = $2",
                    photos,
                    employee_id,
                )
                migrated_emps += 1

        print("\n----- Summary -----")
        print(f"Employees updated : {migrated_emps}")
        print(f"Photos uploaded   : {uploaded}")
        print(f"Failed / missing  : {failed}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
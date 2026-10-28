# Alphabet Employee & Attendance (PostgreSQL + pgvector)

## Run everything with Docker
    docker compose up --build
Open http://localhost:3000
- Register: /register-alphabet
- Attendance: /attendance-alphabet

The first build installs dlib/face_recognition and can take a few minutes.

## Database (PostgreSQL + pgvector) - tables are created automatically on startup
- employees(id, employee_id UNIQUE, name, email, photos TEXT[], created_at)
- face_embeddings(id, employee_id -> employees, photo_index, embedding vector(128))  <- face embeddings
- attendance(id, employee_id -> employees, date, time, status, UNIQUE(employee_id, date))

## API
- POST /api/register-employee   (form: name, email, employeeId, photo_1..3) - stores 3 embeddings
- POST /api/mark-attendance     ({"employeeId": "..."})
- POST /api/identify-face       (form: photo) - nearest employee via pgvector (extra, not used by UI)
- GET  /api/health

## Inspect embeddings
    docker compose exec postgres psql -U postgres -d alphabet -c "SELECT employee_id, photo_index, vector_dims(embedding) FROM face_embeddings;"

## Run locally without Docker
Needs PostgreSQL with the pgvector extension.
    cd backend && pip install -r requirements.txt && pip install --no-deps face_recognition==1.3.0
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/alphabet python backend_app.py
    cd frontend && npm install && npm run dev



backend ----python backend_app.py

frontend --npm run dev



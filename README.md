# JobSphere: Distributed Job Scheduler

JobSphere is a production-inspired, highly concurrent distributed job scheduling platform capable of executing asynchronous background tasks across multiple workers with reliability, transactional safety, and observability.

---

## System Architecture

JobSphere divides concerns across three modular boundaries:
1.  **API Gateway (Flask REST API):** Coordinates project setup, JWT authentication, queue configurations, and real-time dashboard analytics.
2.  **Worker Daemon Engine (Background Workers):** Concurrent worker nodes polling queues atomically, running tasks, tracking heartbeats, managing retry backoffs, and writing execution logs.
3.  **Real-Time Monitoring Dashboard (Vite + React + Tailwind CSS):** Glassmorphic interface offering deep visibility into queues, worker process health, and job terminal logs.

```mermaid
graph TD
    User([User / API Client]) -->|REST API / JWT| API[Flask API Server]
    API -->|Read/Write| DB[(Cloud PostgreSQL)]
    Worker1[Worker Node 1] -->|Atomic Claim & Run / Heartbeat| DB
    Worker2[Worker Node 2] -->|Atomic Claim & Run / Heartbeat| DB
    Dashboard[React Dashboard] -->|Telemetry / Control APIs| API
```

---

## Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    organizations ||--o{ users : "has"
    organizations ||--o{ projects : "owns"
    projects ||--o{ queues : "contains"
    projects ||--o{ retry_policies : "defines"
    queues }|--|| retry_policies : "references"
    queues ||--o{ jobs : "enqueues"
    queues ||--o{ recurring_jobs : "schedules"
    jobs ||--o{ job_executions : "runs"
    workers ||--o{ jobs : "claims"
    job_executions ||--o{ job_logs : "records"
    dead_letter_queue ||--|| jobs : "DLQ logs"
```

---

## Setup & Running Instructions

### Prerequisites
*   Python 3.8+
*   Node.js v18+ & npm
*   A Cloud PostgreSQL instance (e.g., free database URL from [Neon.tech](https://neon.tech/) or [Supabase](https://supabase.com/))

### 1. Backend Setup
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create a `.env` file from the example:
    ```bash
    cp .env.example .env
    ```
3.  Open `.env` and paste your PostgreSQL connection string in `DATABASE_URL`:
    ```env
    DATABASE_URL=postgresql://neondb_owner:YOUR_KEY@ep-cool-water-a5.us-east-2.aws.neon.tech/neondb?sslmode=require
    ```
4.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
5.  Run the API server and worker daemon concurrently in developer mode:
    ```bash
    python run.py
    ```
    *(To run them separately, use `python run.py api` or `python run.py worker`)*

### 2. Frontend Setup
1.  Navigate to the frontend directory:
    ```bash
    cd ../frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run the Vite development server:
    ```bash
    npm run dev
    ```
4.  Open the URL shown in your terminal (usually `http://localhost:5173`) in your browser.

### 3. Running Automated Tests
To run the automated test suite verifying backoff algorithms and cron schedule calculation:
```bash
cd backend
python -m unittest tests/test_scheduler.py
```

---

## API Documentation

All request bodies must be JSON, and protected routes require the header `Authorization: Bearer <jwt-token>`.

### Authentication
*   `POST /api/auth/register` - Create account. Automatically provisions an organization and default project.
    *   *Request:* `{ "email": "user@example.com", "password": "securepassword", "organization_name": "My Org" }`
*   `POST /api/auth/login` - Authenticate user. Returns JWT and project details.

### Queues & Policies
*   `GET /api/queues/` - Retrieve all queues and their real-time job metrics.
*   `POST /api/queues/` - Initialize a new queue.
    *   *Request:* `{ "name": "email-queue", "priority": 8, "max_concurrency": 10, "retry_policy_id": "uuid" }`
*   `PATCH /api/queues/<queue_id>` - Update configuration or pause/resume a queue.
    *   *Request:* `{ "is_paused": true }`
*   `POST /api/queues/retry-policies` - Add custom retry backoff rules.
    *   *Request:* `{ "name": "exponential-3x", "strategy": "EXPONENTIAL", "backoff_interval": 5, "max_retries": 3 }`

### Job Management
*   `POST /api/jobs/` - Enqueue immediate or delayed job.
    *   *Request:* `{ "queue_id": "uuid", "priority": 5, "payload": { "type": "HTTP", "url": "https://webhook.site/..." }, "delay_seconds": 30 }`
*   `POST /api/jobs/batch` - Dispatch multiple jobs sharing a single transaction.
    *   *Request:* `{ "queue_id": "uuid", "payloads": [ { "type": "GENERIC" }, { "type": "GENERIC" } ] }`
*   `POST /api/jobs/recurring` - Define a recurring cron schedule.
    *   *Request:* `{ "name": "nightly-backup", "queue_id": "uuid", "cron_expression": "0 0 * * *", "payload": { "action": "backup" } }`
*   `GET /api/jobs/` - Fetch paginated job history. Supports filtering by `status`, `queue_id`, and `batch_id`.
*   `GET /api/jobs/<job_id>` - Get execution attempt history, logs, and errors.
*   `POST /api/jobs/<job_id>/retry` - Force-retry a failed job.

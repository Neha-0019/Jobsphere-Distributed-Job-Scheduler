# 🔌 JobSphere: API Documentation

All request bodies must be JSON, and protected routes require the header `Authorization: Bearer <jwt-token>`.

---

## 🔐 Authentication

### 1. Register Account
Create a new user account, which automatically provisions a default organization and project workspace.
*   **Method & Route:** `POST /api/auth/register`
*   **Request Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "securepassword",
      "organization_name": "My Operations Org"
    }
    ```
*   **Response:** Success status and user UUID.

### 2. User Login
Authenticate credentials and retrieve JWT and project credentials.
*   **Method & Route:** `POST /api/auth/login`
*   **Request Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "securepassword"
    }
    ```
*   **Response:** JWT token, project ID, and project API key.

---

## 🚦 Queues & Policies

### 1. Retrieve Queues
Fetch all active queues and their current real-time job processing metrics.
*   **Method & Route:** `GET /api/queues/`
*   **Headers:** `Authorization: Bearer <jwt-token>`

### 2. Initialize Queue
Create a new queue routing channel.
*   **Method & Route:** `POST /api/queues/`
*   **Headers:** `Authorization: Bearer <jwt-token>`
*   **Request Body:**
    ```json
    {
      "name": "email-queue",
      "priority": 8,
      "max_concurrency": 10,
      "retry_policy_id": "optional-retry-policy-uuid"
    }
    ```

### 3. Update/Pause Queue
Update queue states dynamically (e.g., pausing queue ingestion).
*   **Method & Route:** `PATCH /api/queues/<queue_id>`
*   **Headers:** `Authorization: Bearer <jwt-token>`
*   **Request Body:**
    ```json
    {
      "is_paused": true
    }
    ```

### 4. Create Retry Policy
Define customized backoff strategies.
*   **Method & Route:** `POST /api/queues/retry-policies`
*   **Headers:** `Authorization: Bearer <jwt-token>`
*   **Request Body:**
    ```json
    {
      "name": "exponential-3x",
      "strategy": "EXPONENTIAL",
      "backoff_interval": 5,
      "max_retries": 3
    }
    ```

---

## ⚙️ Job Management

### 1. Enqueue Job
Submit a task for immediate or delayed execution.
*   **Method & Route:** `POST /api/jobs/`
*   **Headers:** `Authorization: Bearer <jwt-token>`
*   **Request Body:**
    ```json
    {
      "queue_id": "uuid",
      "priority": 5,
      "payload": {
        "type": "HTTP",
        "url": "https://webhook.site/target-url",
        "method": "POST",
        "body": "{}"
      },
      "delay_seconds": 30,
      "idempotency_key": "optional-unique-key"
    }
    ```

### 2. Batch Enqueue Jobs
Dispatch multiple jobs atomically sharing a single transaction.
*   **Method & Route:** `POST /api/jobs/batch`
*   **Headers:** `Authorization: Bearer <jwt-token>`
*   **Request Body:**
    ```json
    {
      "queue_id": "uuid",
      "payloads": [
        { "type": "GENERIC", "duration": 5 },
        { "type": "GENERIC", "duration": 10 }
      ]
    }
    ```

### 3. Register Recurring Job (Cron Schedule)
Define a recurring background schedule.
*   **Method & Route:** `POST /api/jobs/recurring`
*   **Headers:** `Authorization: Bearer <jwt-token>`
*   **Request Body:**
    ```json
    {
      "name": "nightly-cleanup",
      "queue_id": "uuid",
      "cron_expression": "0 0 * * *",
      "payload": {
        "action": "prune_logs"
      }
    }
    ```

### 4. Fetch Job History
Retrieve paginated execution history with status filters.
*   **Method & Route:** `GET /api/jobs/`
*   **Headers:** `Authorization: Bearer <jwt-token>`
*   **Query Parameters:** `status=FAILED`, `queue_id=uuid`, `batch_id=uuid`

### 5. Fetch Single Job Details
Retrieve detailed attempt history, exceptions, and execution logs.
*   **Method & Route:** `GET /api/jobs/<job_id>`
*   **Headers:** `Authorization: Bearer <jwt-token>`

### 6. Force-Retry Failed Job
Trigger manual re-execution of a failed or DLQ task.
*   **Method & Route:** `POST /api/jobs/<job_id>/retry`
*   **Headers:** `Authorization: Bearer <jwt-token>`

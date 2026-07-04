<h1 align="center">🖥️ JobSphere: Distributed Job Scheduler</h1>

<p align="center">
  <strong>A scalable, database-backed task coordinator with automatic retry policies, dead-letter queue routing, worker cluster heartbeat checks, and real-time dashboard telemetrics.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11" />
  <img src="https://img.shields.io/badge/Flask-Backend-000000?style=flat-square&logo=flask&logoColor=white" alt="Flask Backend" />
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React Frontend" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License MIT" />
</p>

---

## 📖 Project Overview

The **Distributed Job Scheduler** is a full-stack, production-ready orchestrator designed to manage background task workloads across distributed worker clusters. Built on a clean, stateless architecture, the system coordinates task delivery from prioritized channels to active computing nodes. The project demonstrates core scheduling paradigms, including **JWT-based authentication**, **multi-tenant organizational contexts**, **pipeline project grouping**, **prioritized queue management**, **job-lifecycle transitions**, **worker capacity routing**, **retry policies**, **dead-letter routing**, and a **real-time administration dashboard** featuring live health diagnostics and CSV logs export.

---

## ✨ Features

*   🔓 **Secure Session Access:** State-backed JWT authentication with secure password encryption.
*   🏢 **Multi-Tenant Contexts:** Organization workspaces containing isolated project environments.
*   🚦 **Active Priority Queuing:** Prioritized routing channels with dynamic activity switches.
*   ⚙️ **Job State Machine:** Stateful transitions (`QUEUED` ➔ `RUNNING` ➔ `SUCCESS` / `FAILED` / `RETRY` ➔ `DEAD_LETTER`).
*   🔄 **Automatic Retry Policies:** Limit-based retries featuring configurable delays (`retry_delay_seconds`).
*   ☣️ **Dead Letter Quarantine:** Automated capture of permanently failed jobs in a dedicated Dead Letter Queue (DLQ).
*   ⏱️ **SRE Observability Telemetry:** Real-time tracking of queue depths and system latency percentiles ($P_{50}$, $P_{95}$, $P_{99}$) plotted on clean charts.
*   🛡️ **Rate Limiter Guard:** Thread-safe token-bucket decorator to prevent API endpoints from spamming.

---

## 📸 Screenshots & Showcase

### 🖥️ Real-Time Telemetry Dashboard
A premium dark-themed SRE administration console showing active worker daemons, throughput rates, latency percentiles, and live logs.
![JobSphere Dashboard](dashboard_mockup.png)

---

## 📐 System Architecture

JobSphere divides concerns across three modular boundaries:
1.  **API Gateway (Flask REST API):** Coordinates project setup, JWT authentication, queue configurations, and real-time dashboard analytics.
2.  **Worker Daemon Engine (Background Workers):** Concurrent worker nodes polling queues atomically, running tasks, tracking heartbeats, managing retry backoffs, and writing execution logs.
3.  **Real-Time Monitoring Dashboard (Vite + React):** Observability frontend displaying execution latency metrics, queue metrics, and logs.

```mermaid
graph TB
    subgraph Client Plane
        ReactConsole["React Dashboard Console (Vite)"]
        BrowserSock["WebSocket Client (Browser)"]
    end

    subgraph Control Plane (API Gateway)
        FlaskAPI["Flask HTTP API Server"]
        WSServer["Flask-Sock Gateway (WebSockets)"]
    end

    subgraph Data Plane
        PostgresDB["PostgreSQL Database"]
    end

    subgraph Execution Plane (Worker Pool)
        WorkerNode1["Worker Daemon Thread Pool (Node 1)"]
        WorkerNode2["Worker Daemon Thread Pool (Node 2)"]
    end

    %% Client Communication
    ReactConsole -->|REST HTTP requests / JSON| FlaskAPI
    BrowserSock <-->|Persistent WebSocket connection| WSServer

    %% Control Plane DB Actions
    FlaskAPI -->|SQL Read/Write / ACID Transactions| PostgresDB
    WSServer -->|Queries Active Telemetry| PostgresDB

    %% Worker Daemon Operations
    WorkerNode1 -->|Atomically claims jobs via SKIP LOCKED| PostgresDB
    WorkerNode2 -->|Atomically claims jobs via SKIP LOCKED| PostgresDB
    WorkerNode1 -->|Periodically updates heartbeats / pings| PostgresDB
    WorkerNode2 -->|Periodically updates heartbeats / pings| PostgresDB
    WorkerNode1 -->|Writes execution results & logs| PostgresDB
    WorkerNode2 -->|Writes execution results & logs| PostgresDB

    %% Real-time Socket Event Broadcasting
    FlaskAPI -.->|Broadcast events upon mutations| WSServer
    WorkerNode1 -.->|Broadcast events upon execution status change| WSServer
    WorkerNode2 -.->|Broadcast events upon execution status change| WSServer
```

---

## 💾 Database Schema (ER Diagram)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : "contains"
    ORGANIZATIONS ||--o{ PROJECTS : "has"
    PROJECTS ||--o{ QUEUES : "defines"
    PROJECTS ||--o{ RETRY_POLICIES : "defines"
    QUEUES ||--o{ JOBS : "enqueues"
    QUEUES ||--o{ RECURRING_JOBS : "registers"
    QUEUES ||--o{ QUEUE_DEPTH_SNAPSHOTS : "snapshots"
    QUEUES }o--|| RETRY_POLICIES : "references"
    JOBS ||--o{ JOB_EXECUTIONS : "logs"
    JOBS }o--o{ JOBS : "depends_on (job_dependencies)"
    JOBS }o--|| WORKERS : "executed_by"
    JOB_EXECUTIONS ||--o{ JOB_LOGS : "emits"
```

---

## 🛠️ Setup & Running Instructions

### Prerequisites
*   Python 3.8+
*   Node.js v18+ & npm
*   A Cloud PostgreSQL instance (e.g., free database URL from [Neon.tech](https://neon.tech/))

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
4.  Open `http://localhost:5173` in your browser.

### 3. Running Automated Tests
To run the automated test suite verifying backoff algorithms and cron schedule calculation:
```bash
cd backend
python -m unittest tests/test_scheduler.py
```

---

## 🔌 API Documentation

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
*   `POST /api/queues/retry-policies` - Add custom retry backoff rules.
    *   *Request:* `{ "name": "exponential-3x", "strategy": "EXPONENTIAL", "backoff_interval": 5, "max_retries": 3 }`

### Job Management
*   `POST /api/jobs/` - Enqueue immediate or delayed job.
    *   *Request:* `{ "queue_id": "uuid", "priority": 5, "payload": { "type": "HTTP", "url": "https://webhook.site/..." }, "delay_seconds": 30 }`
*   `POST /api/jobs/batch` - Dispatch multiple jobs sharing a single transaction.
*   `POST /api/jobs/recurring` - Define a recurring cron schedule.
    *   *Request:* `{ "name": "nightly-backup", "queue_id": "uuid", "cron_expression": "0 0 * * *", "payload": { "action": "backup" } }`
*   `GET /api/jobs/` - Fetch paginated job history. Supports filtering by `status`, `queue_id`, and `batch_id`.
*   `GET /api/jobs/<job_id>` - Get execution attempt history, logs, and errors.
*   `POST /api/jobs/<job_id>/retry` - Force-retry a failed job.

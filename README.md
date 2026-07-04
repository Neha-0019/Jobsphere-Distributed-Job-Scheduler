<h1 align="center">🖥️ JobSphere: Distributed Job Scheduler</h1>

<p align="center">
  <strong>A scalable, database-backed task coordinator with automatic retry policies, dead-letter queue routing, worker cluster heartbeat checks, and real-time dashboard telemetrics.</strong>
</p>

---

## 📖 Project Overview

The **Distributed Job Scheduler** is a full-stack, production-ready orchestrator designed to manage background task workloads across distributed worker clusters. Built on a clean, database-backed architecture, the system coordinates task delivery from prioritized channels to active computing nodes. The project demonstrates core scheduling paradigms, including **JWT-based authentication**, **multi-tenant organizational contexts**, **pipeline project grouping**, **prioritized queue management**, **job-lifecycle transitions**, **worker capacity routing**, **retry policies**, **dead-letter routing**, and a **real-time administration dashboard** featuring live health diagnostics and CSV logs export.

---

## 📐 System Architecture

JobSphere divides concerns across three modular boundaries:
1.  **API Gateway (Flask REST API):** Coordinates project setup, JWT authentication, queue configurations, and real-time dashboard analytics.
2.  **Worker Daemon Engine (Background Workers):** Concurrent worker nodes polling queues atomically, running tasks, tracking heartbeats, managing retry backoffs, and writing execution logs.
3.  **Real-Time Monitoring Dashboard (Vite + React):** Observability frontend displaying execution latency metrics, queue metrics, and logs.

```mermaid
graph TB
    subgraph "Client Plane"
        ReactConsole["React Dashboard Console (Vite)"]
        BrowserSock["WebSocket Client (Browser)"]
    end

    subgraph "Control Plane (API Gateway)"
        FlaskAPI["Flask HTTP API Server"]
        WSServer["Flask-Sock Gateway (WebSockets)"]
    end

    subgraph "Data Plane"
        PostgresDB["PostgreSQL Database"]
    end

    subgraph "Execution Plane (Worker Pool)"
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

For the detailed entity relationships and key constraints, refer to the [Database ER Diagram](docs/ER_DIAGRAM.md).

---

## 🛠️ Technology Stack

<p align="left">
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11" />
  <img src="https://img.shields.io/badge/Flask-Backend-000000?style=flat-square&logo=flask&logoColor=white" alt="Flask Backend" />
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React Frontend" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License MIT" />
</p>

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

### Dashboard
A premium dark-themed SRE administration console showing active worker daemons, throughput rates, latency percentiles, and live logs.
![Dashboard](screenshots/dashboard.png)

### Queue Management
Create, edit, pause, and configure queues and custom retry policies dynamically.
![Queues](screenshots/queues.png)

### Job Explorer
Inspect execution states, batching transactions, individual attempt durations, stack traces, and job logs.
![Jobs](screenshots/jobs.png)

### Worker Management
View status, host mappings, and active worker daemon threads polling and claiming tasks.
![Workers](screenshots/workers.png)

### Metrics
Detailed charts for queue throughput rates, dispatch volumes, failure rates, queue depths, and latencies.
![Metrics Top](screenshots/metrics.png)
![Metrics Bottom](screenshots/metrics_bottom.png)

---

## 📂 Project Structure

```text
JobSphere/
├── backend/                  # Flask REST API & Worker Daemon Engine
├── frontend/                 # React Observability Dashboard (Vite)
├── docs/                     # Detailed Architectural & SRE Specifications
│   ├── ARCHITECTURE_DIAGRAM.md
│   ├── ER_DIAGRAM.md
│   ├── API_DOCUMENTATION.md
│   └── DESIGN_DECISIONS.md
├── screenshots/              # UI Showcase assets
└── README.md                 # Project root portal
```

---

## 📥 Installation & Running Instructions

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

---

## 🔌 API Documentation

Detailed route parameters, payload schemas, and headers for all client connections are documented in the [API Documentation](docs/API_DOCUMENTATION.md).

---

## 🧪 Testing

To run the automated test suite verifying backoff algorithms, cron schedule calculations, rates limits, and claiming operations:
```bash
cd backend
python -m unittest tests/test_scheduler.py
```

---

## 🔮 Future Improvements

*   **Distributed Rate Limiting:** Migrate the in-memory token-bucket limiter to Redis to synchronize rate constraints across load-balanced worker clusters.
*   **Workflow DAG Orchestration:** Support task chaining and dependency graph resolution to execute jobs in strict sequential DAG steps.
*   **Worker Auto-scaling:** Dynamically scale worker threads based on active queue depth metrics.

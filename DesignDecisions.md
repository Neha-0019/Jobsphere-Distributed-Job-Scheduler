# JobSphere: Design Decisions & Trade-Offs

This document details the architectural choices, database schema design, and concurrency mechanisms implemented in JobSphere.

---

## 1. Relational Schema Normalization & Indexing

### Normalization (3NF)
The database schema is normalized to the **Third Normal Form (3NF)** to avoid update anomalies and data redundancy:
*   `User` credentials are decoupled from `Organization` structures to allow multi-tenant setups.
*   `Queue` properties (like `priority` and `max_concurrency`) are isolated from individual `Jobs`.
*   Job attempt history is logged in a separate child table (`JobExecution`) rather than overwriting fields on `Job`, enabling full retry logs and metrics tracking.

### Performance Indexing Strategy
To support highly frequent polling under high workloads, the following indexes are implemented:
1.  **Composite index on `jobs(status, run_at)`:** Polling workers query this composite key constantly to fetch eligible jobs. Indexing it reduces the query overhead from \(O(N)\) full table scans to \(O(\log N)\) b-tree seeks.
2.  **Foreign Key indexes (`jobs.queue_id`, `job_executions.job_id`):** Facilitates fast joins for fetching dashboard metrics and execution histories.
3.  **Heartbeat index on `workers.last_heartbeat`:** Speeds up recovery scans identifying stale workers.

---

## 2. Concurrency Control: Atomic Claiming

### The Race Condition Problem
In a distributed environment with multiple workers polling a shared database, two workers might run a `SELECT` statement and obtain the same candidate job. If they both proceed to update its status to `RUNNING`, the job will execute twice.

### The Solution: `SKIP LOCKED`
JobSphere uses PostgreSQL's row-level lock modifier `FOR UPDATE SKIP LOCKED` inside a transaction.
1.  **`FOR UPDATE`** locks the candidate rows returned by the subquery, preventing other transactions from writing or locking them.
2.  **`SKIP LOCKED`** instructs concurrent transactions that try to lock the same rows to skip them and immediately look for the next available rows.
This ensures **exactly-once execution** semantics with zero polling lock contention.

---

## 3. Queue-Level Concurrency Limit Checking

To enforce the `max_concurrency` limit of each queue:
1.  The worker polls and counts the number of jobs currently in `CLAIMED` or `RUNNING` status grouped by `queue_id`.
2.  Any queue whose active job count meets or exceeds its configured `max_concurrency` is excluded from the active polling query.
3.  This dynamically balances workers across eligible queues and prevents resource starvation.

---

## 4. Reliability & Fault Tolerance

### Heartbeats & Stale Worker Recovery
If a worker crashes mid-execution, its active jobs would be trapped in a `RUNNING` status indefinitely. To solve this:
*   Workers send a heartbeat query updating `workers.last_heartbeat` every 5 seconds.
*   Active workers periodically scan for instances whose last heartbeat is older than 30 seconds.
*   If a stale worker is found, its status is marked `INACTIVE`, and its active/claimed jobs are automatically rescheduled to `QUEUED` (incrementing the retry count and logging the recovery reason) to be picked up by healthy workers.

### Configurable Retry Backoffs
Failed executions calculate the next run time using one of three policies:
*   **Fixed:** \(\text{interval}\)
*   **Linear:** \(\text{interval} \times \text{attempt}\)
*   **Exponential:** \(\text{interval} \times 2^{\text{attempt} - 1}\)
This prevents overloaded downstream webhooks/services from being overwhelmed by failing retries (thundering herd problem).

### Dead Letter Queue (DLQ)
When a job's attempts exceed `max_retries`, it transitions to `FAILED_DLQ` status, and its metadata is copied to the `dead_letter_queue` audit log. This isolates permanent failures, preventing them from clogging active worker loops.

---

## 5. UI Architecture: Pure SVG Charting

Instead of introducing bulky graphing libraries, the dashboard uses a **custom React SVG chart generator**:
*   Transforms database metrics directly into SVG lines, area fills, and grid lines.
*   Eliminates chart render lag, package size bloat, and version conflicts.
*   Ensures 100% responsive resizing using standard SVG `viewBox` settings.

---

## 6. Live Updates: HTML5 WebSockets & Flask-Sock
*   Instead of periodic HTTP polling loops, the dashboard initiates a native `WebSocket` connection to the backend `/ws` route on load.
*   The backend manages active socket connections in memory.
*   Whenever a job state changes (e.g. `CLAIMED`, `RUNNING`, `COMPLETED`, `FAILED`), or a dependency unlocks a child job, the backend broadcasts a JSON payload.
*   Receiving this signal triggers an instant visual sync on all open client dashboards, achieving real-time responsiveness with zero polling overhead.

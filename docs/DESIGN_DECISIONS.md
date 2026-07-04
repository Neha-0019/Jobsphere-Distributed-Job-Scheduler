# 📑 JobSphere: Design Decisions & Trade-Offs

This document details the architectural choices, database schema design, concurrency mechanisms, SRE trade-offs, and UI implementation details behind JobSphere's job scheduling and execution engine.

---

## 1. Core Scheduling & Execution Engine

### 1.1 Database-Native Claiming (`SELECT FOR UPDATE SKIP LOCKED`) vs. External Message Broker

**Decision:** Jobs are claimed atomically using row-level locking directly on the `jobs` table, rather than routing job dispatch through an external broker like Redis, RabbitMQ, or SQS.

**Why:**
*   **Single Source of Truth:** Keeps job state, execution history, and claiming logic transactionally consistent in one database. A job's status can never disagree with what's in the queue.
*   **Prevents Dual-Write Bugs:** Removes an entire class of dual-write bugs (e.g., job marked claimed in Redis but the database write fails).
*   **Infrastructure Simplicity:** Simplifies deployment and maintenance. No additional message queue cluster is required to run, monitor, or failover.

**Trade-off accepted:**
*   **Throughput Limits:** Lower theoretical claim throughput than a purpose-built in-memory broker, since every claim involves a disk/transaction write.
*   **Connection Scaling:** At high worker counts, row-level lock contention on hot queues could become a bottleneck. This is an acceptable scale limit for JobSphere's target workloads. A production enterprise system would graduate to a broker-backed design once connection contention becomes measurable.

---

### 1.2 Polling Workers vs. Push-Based Dispatch

**Decision:** Workers poll for available jobs on a set interval rather than having jobs pushed to them by a central coordinator process.

**Why:**
*   **Stateless Scaling:** No central dispatcher is needed. Workers are stateless and interchangeable; adding or removing workers requires zero coordination.
*   **Dynamic Load Balancing:** Naturally load-balances itself. Any idle worker picks up the next available job, rather than requiring a central dispatcher to track worker CPU/memory loads.

**Trade-off accepted:**
*   **Pickup Latency:** Job pickup latency is bounded by the polling interval rather than being instantaneous. For background task execution, this slight latency is fully acceptable.
*   **Baseline DB Load:** Constant polling generates a minor baseline database query load even when queues are empty.

---

### 1.3 Concurrency Control: Atomic Claiming Details

**The Race Condition Problem:** In a distributed environment with multiple workers polling a shared database, two workers might run a `SELECT` statement and obtain the same candidate job. If they both proceed to update its status to `RUNNING`, the job will execute twice.

**The Solution: `SKIP LOCKED`**
JobSphere uses PostgreSQL's row-level lock modifier `FOR UPDATE SKIP LOCKED` inside a transaction:
1.  `FOR UPDATE` locks the candidate rows returned by the subquery, preventing other transactions from writing or locking them.
2.  `SKIP LOCKED` instructs concurrent transactions that try to lock the same rows to skip them and immediately look for the next available rows.
This ensures **exactly-once execution** semantics with zero polling lock contention.

---

## 2. Database Schema Design & Indexing

### 2.1 Relational Schema Normalization (3NF)

The database schema is normalized to the **Third Normal Form (3NF)** to avoid update anomalies and data redundancy:
*   `User` credentials are decoupled from `Organization` structures to allow multi-tenant setups.
*   `Queue` properties (like `priority` and `max_concurrency`) are isolated from individual `Jobs`.
*   Job attempt history is logged in a separate child table (`JobExecution`) rather than overwriting fields on `Job`, enabling full retry logs and metrics tracking.

### 2.2 Performance Indexing Strategy

To support highly frequent polling under high workloads, the following indexes are implemented:
1.  **Composite index on `jobs(status, run_at)`:** Polling workers query this composite key constantly to fetch eligible jobs. Indexing it reduces the query overhead from $O(N)$ full table scans to $O(\log N)$ b-tree seeks.
2.  **Foreign Key indexes (`jobs.queue_id`, `job_executions.job_id`):** Facilitates fast joins for fetching dashboard metrics and execution histories.
3.  **Heartbeat index on `workers.last_heartbeat`:** Speeds up recovery scans identifying stale workers.

---

## 3. Reliability, Concurrency & Fault Tolerance

### 3.1 Heartbeat Timeout & Recovery of Stale Workers

**Decision:** A worker is considered dead, and its in-flight jobs are recovered, if no heartbeat is received for 30 seconds.

**Why 30 seconds specifically:**
*   Short enough that a genuinely crashed worker's job doesn't sit abandoned for long before recovery.
*   Long enough to absorb normal transient delays (GC pauses, brief network blips, database latency) without falsely declaring a healthy worker dead.

**Recovery Mechanism:**
*   Workers update `workers.last_heartbeat` every 5 seconds.
*   Active workers periodically scan for instances whose last heartbeat is older than 30 seconds.
*   If a stale worker is found, its status is marked `INACTIVE`, and its active/claimed jobs are automatically rescheduled to `QUEUED` (incrementing the retry count and logging the recovery reason) to be picked up by healthy workers.

**Trade-off accepted:**
*   **False Positives:** Too short a timeout risks false-positive recovery: a slow-but-alive worker gets its job reclaimed and potentially re-run by another worker while it's still working. 30 seconds was chosen as a reasonable middle ground for our expected job runtimes.

---

### 3.2 Queue-Level Concurrency Limit Checking

To enforce the `max_concurrency` limit of each queue:
1.  The worker polls and counts the number of jobs currently in `CLAIMED` or `RUNNING` status grouped by `queue_id`.
2.  Any queue whose active job count meets or exceeds its configured `max_concurrency` is excluded from the active polling query.
3.  This dynamically balances workers across eligible queues and prevents resource starvation.

---

### 3.3 Idempotency: At-Least-Once Execution & Protection Keys

**Decision:** JobSphere provides **at-least-once** execution semantics, not exactly-once. An optional `idempotency_key` can be attached to a job at creation time; if present, the worker checks for a prior `COMPLETED` execution with the same key before re-running side-effecting work, and skips duplicate execution if found.

**Why this design, not true exactly-once:**
*   Exactly-once execution across a crash (e.g., worker dies after doing the side-effecting work but before committing status) is a distributed systems problem that generally requires the job's side effects themselves to be transactional with the status update.
*   Instead, the system makes an honest, achievable guarantee: jobs may be executed more than once in rare crash scenarios, but callers who provide an idempotency key get duplicate-execution protection at the application layer.

---

### 3.4 Configurable Retry Backoffs & Dead Letter Queue (DLQ)

**Configurable Retry Backoffs:**
Failed executions calculate the next run time using one of three policies:
*   **Fixed:** $\text{interval}$
*   **Linear:** $\text{interval} \times \text{attempt}$
*   **Exponential:** $\text{interval} \times 2^{\text{attempt} - 1}$
This prevents overloaded downstream webhooks/services from being overwhelmed by failing retries (thundering herd problem).

**Dead Letter Queue (DLQ):**
When a job's attempts exceed `max_retries`, it transitions to `FAILED_DLQ` status, and its metadata is copied to the `dead_letter_queue` audit log. This isolates permanent failures, preventing them from clogging active worker loops.

---

## 4. Security & API Protection

### 4.1 Token-Bucket Rate Limiting (Single-Process Scope)

**Decision:** Job-submission endpoints are protected by a token-bucket rate limiter, implemented as an in-memory, thread-safe counter per project.

**Trade-off / known limitation:**
*   This limiter is **not distributed-safe**. If the backend runs as multiple processes or instances behind a load balancer, each instance enforces its own independent limit, so the effective rate limit is `configured_limit × number_of_instances`.
*   For a single-instance deployment (as in this project), this is correct and sufficient. A production multi-instance deployment would need a shared store (like Redis) to enforce one consistent limit.

---

## 5. UI Architecture & Real-Time Sync

### 5.1 Telemetry Display & Charting

To represent real-time observability telemetry, the dashboard includes Recharts area, line, and bar chart components. 
*   **High-Visibility SRE styling:** Ticks, legend items, and values are styled in monospace `JetBrains Mono` and `Space Grotesk` fonts with `tabular-nums` formatting to mirror telemetry tools like Datadog/Grafana.
*   **Desaturated statuses:** Success runs use `#5fb87a` green, while failed/error paths use a bright red `#e15456` to ensure immediately visible indicators.

### 5.2 Real-Time Updates: HTML5 WebSockets & Flask-Sock

*   Instead of periodic HTTP polling loops, the dashboard initiates a native `WebSocket` connection to the backend `/ws` route on load.
*   The backend manages active socket connections in memory.
*   Whenever a job state changes (e.g. `CLAIMED`, `RUNNING`, `COMPLETED`, `FAILED`), or a dependency unlocks a child job, the backend broadcasts a JSON payload.
*   Receiving this signal triggers an instant visual sync on all open client dashboards, achieving real-time responsiveness with zero polling overhead.

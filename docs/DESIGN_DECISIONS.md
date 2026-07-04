# JobSphere: Distributed Job Scheduler

## Design Decisions & Trade-offs

This document explains the key architectural choices behind JobSphere's job 
scheduling and execution engine, and the trade-offs accepted for each.

---

## 1. Database-native claiming (`SELECT FOR UPDATE SKIP LOCKED`) vs. external message broker

**Decision:** Jobs are claimed atomically using row-level locking directly on the 
`jobs` table, rather than routing job dispatch through an external broker like 
Redis, RabbitMQ, or SQS.

**Why:**
- Keeps job state, execution history, and claiming logic transactionally 
  consistent in one system — a job's status can never disagree with what's in 
  the queue, because there is only one source of truth.
- Removes an entire class of dual-write bugs (e.g. job marked claimed in Redis 
  but the DB write fails, or vice versa).
- Simpler to deploy and reason about for a project this size — one database, 
  no additional infrastructure to run, monitor, or fail over.

**Trade-off accepted:**
- Lower theoretical claim throughput than a purpose-built broker, since every 
  claim is a database transaction rather than an in-memory queue pop.
- No built-in pub/sub fan-out — broadcasting to many consumers is more natural 
  in Redis/RabbitMQ.
- At high worker counts, row-level lock contention on hot queues could become 
  a bottleneck. This is an acceptable limit for the scale this project targets; 
  a production system with very high job volume would likely graduate to a 
  broker-backed design once this becomes measurable.

---

## 2. Polling workers vs. push-based dispatch

**Decision:** Workers poll for available jobs on an interval rather than having 
jobs pushed to them by a central dispatcher.

**Why:**
- No dispatcher process needed — workers are stateless and interchangeable; 
  adding or removing workers requires no coordination.
- Naturally load-balances: any idle worker picks up the next available job, 
  rather than requiring the dispatcher to track worker load.

**Trade-off accepted:**
- Job pickup latency is bounded by the polling interval rather than being 
  instant. For this system's use case (background job processing, not 
  sub-second real-time dispatch), this latency is acceptable.
- Constant polling generates some baseline DB load even when queues are empty, 
  which a push model would avoid.

---

## 3. Heartbeat timeout value (30 seconds)

**Decision:** A worker is considered dead, and its in-flight job is recovered, 
if no heartbeat is received for 30 seconds.

**Why 30 seconds specifically:**
- Short enough that a genuinely crashed worker's job doesn't sit abandoned for 
  long before recovery.
- Long enough to absorb normal transient delays (GC pauses, brief network 
  blips, momentary DB slowness) without falsely declaring a healthy worker dead.

**Trade-off:**
- **Too short** a timeout risks false-positive recovery: a slow-but-alive 
  worker gets its job reclaimed and potentially re-run by another worker while 
  it's still working — a correctness risk if the job isn't idempotent.
- **Too long** a timeout means genuine crashes take longer to recover from, 
  increasing job latency during real failures.
- 30 seconds was chosen as a reasonable middle ground for this project's 
  expected job durations; a production system would likely make this 
  configurable per-queue based on typical job runtime.

---

## 4. Idempotency: at-least-once execution, not exactly-once

**Decision:** JobSphere provides **at-least-once** execution semantics, not 
exactly-once. An optional `idempotency_key` can be attached to a job at 
creation time; if present, the worker checks for a prior `COMPLETED` execution 
with the same key before re-running side-effecting work, and skips duplicate 
execution if found.

**Why this design, not true exactly-once:**
- Exactly-once execution across a crash (e.g. worker dies after doing the 
  side-effecting work but before the status commit) is a distributed systems 
  problem that generally requires the job's side effects themselves to be 
  transactional with the status update — not feasible in general for 
  arbitrary job payloads.
- Instead, the system makes the **honest, achievable guarantee**: jobs may be 
  executed more than once in rare crash scenarios, but callers who provide an 
  idempotency key get duplicate-execution protection at the application layer.

**Trade-off accepted:**
- Jobs without an idempotency key have no duplicate-execution protection — 
  this is documented as the caller's responsibility for non-idempotent work 
  (e.g. sending an email, charging a payment).
- This mirrors how most real-world job systems (e.g. Sidekiq, Celery, SQS) 
  actually behave: at-least-once by default, exactly-once only with explicit 
  application-level support.

---

## 5. Rate limiting: in-memory token bucket, single-process scope

**Decision:** Job-submission endpoints are protected by a token-bucket rate 
limiter, implemented as an in-memory, thread-safe counter per project.

**Trade-off / known limitation:**
- This limiter is **not distributed-safe** — if the backend runs as multiple 
  processes or instances behind a load balancer, each instance enforces its 
  own independent limit, so the effective rate limit is 
  `configured_limit × number_of_instances`.
- For a single-instance deployment (as in this project), this is correct and 
  sufficient.
- A production multi-instance deployment would need a shared store (Redis 
  `INCR` with TTL, or a Redis-backed token bucket) so all instances enforce 
  one consistent limit. This is called out here as a deliberate scope 
  boundary, not an oversight.

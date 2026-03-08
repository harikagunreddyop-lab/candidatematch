# Resume Worker — Elite Pipeline

Production-grade resume generation with ATS 95%+ targeting, elite templates, and caching.

## Features

- **Elite templates:** Tech Elite, Executive, Creative, Finance, General Professional (auto-selected by job title).
- **Fast pipeline:** In-memory cache (100 entries), parallel section prep; sub-2s when cached; first-time generation is LLM-bound.
- **ATS optimization:** Keyword density 8–12%, standard section headers, no tables/columns/graphics; ATS score reported in response and health.
- **Health metrics:** `/health` returns generation count, success rate, last duration, cache size.

## Env (worker)

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server key |
| `ANTHROPIC_API_KEY` | Yes | For STAR bullets/summary (Claude) |
| `WORKER_SECRET` | Recommended | Set same value in Next.js app; worker checks `X-Worker-Secret` |
| `WORKER_PORT` | No | Default 3001 |
| `REDIS_URL` | No | If set, health reports `queue: bullmq` (queue wiring optional) |

## Env (Next.js app)

Set `WORKER_SECRET` in Amplify (same as worker) so `tailor-resume` can call the worker with `X-Worker-Secret`.

## Endpoints

- `GET /health` — Returns `status`, `metrics` (totalGenerations, successRate, lastDurationMs, cacheSize), `queue: inline|bullmq`.
- `POST /generate` — Body: `resume_version_id`, `candidate`, `job`, `file_path` (or `pdf_path`), optional `templateType`. Returns `status`, `resume_version_id`, `duration`, `atsScore`, `cached`, `resumeUrl`, `optimizations`.  
  - **Streaming:** Add `?stream=1` to get the DOCX as chunked response (64KB chunks) with `Content-Disposition: attachment; filename="resume.docx"`.
  - **Queue:** When `REDIS_URL` is set, the request is queued (BullMQ) and the handler waits for job completion (up to 30s); progress is reported via `job.updateProgress({ stage })` (generating, uploading, completed).
- `POST /render` — V3: `artifact_id`, `candidate_id`, `content_json` → DOCX upload (no LLM).

## Verification

```bash
# Health (includes metrics)
curl -s https://YOUR_WORKER_URL/health | jq .

# Generation (requires X-Worker-Secret if WORKER_SECRET is set)
curl -X POST https://YOUR_WORKER_URL/generate \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: YOUR_WORKER_SECRET" \
  -d '{"resume_version_id":"...","candidate":{...},"job":{...},"file_path":"path/to.docx"}'
```

## Structure

- `index.js` — Fastify server, `/generate` (uses FastResumeGenerator), `/render`, `/health` with metrics.
- `lib/fast-generator.js` — Cache, LLM bullets, ATS assembly, template selection.
- `lib/docx-formatter.js` — Elite DOCX from ATS data + template.
- `lib/llm-bullets.js` — Claude STAR bullets + summary (95+ ATS prompt).
- `templates/elite-ats-template.js` — Five template configs (margins, fonts, sections).
- `ats-resume-builder.js` — `toAtsCandidate()` (existing).
- `ats-docx-builder.js` — Legacy ATS DOCX (still used by fast-generator via docx-formatter).

## Performance

- **Cached:** &lt;100 ms (cache hit).
- **Uncached:** Dominated by Claude API (~2–8 s); DOCX build and upload add &lt;500 ms.
- **Target:** Sub-2s achievable with cache or faster model; 95%+ ATS score via prompt + heuristic.

# ArXiv Sieve

Sort papers before they rot in your inbox.

ArXiv Sieve is a small research desk for turning Scholar Inbox emails and arXiv links into a searchable paper library. It queues papers, summarizes them with Gemini, sends one email report per paper, and keeps the whole triage loop visible in a clean ops view.

![ArXiv Sieve screenshot](public/screenshot.webp)

## What It Does

- Accepts manual arXiv URLs and Scholar Inbox links.
- Ingests Scholar Inbox digest emails through Google Apps Script.
- Resolves Scholar Inbox links without leaking private `sha_key` values.
- Queues papers in Supabase and processes ready jobs with retry/backoff.
- Summarizes papers with Gemini: overview, contributions, prior-work delta, and project ideas.
- Sends one Resend report email per paper with signed verdict links.
- Lets the curator rate papers, save project ideas, delete/reprocess/retry papers, and resend failed report emails.
- Keeps `/api/papers` public while all write actions require the curator passphrase cookie.
- Includes Activity/Ops views for ingested emails, queued jobs, failures, audit events, report email status, and retry schedule.
- Adds paper, project, author, and model views with search, filters, grid/list modes, and lightweight ranking.

## Stack

- Next.js App Router
- Supabase Postgres
- Gemini via `@google/genai`
- Resend for report emails
- Vercel for hosting
- Google Apps Script for Gmail polling

## Product Shape

- **Public library:** anyone can browse papers.
- **Curator mode:** one passphrase unlocks write operations.
- **Queue runner:** manual Summarize clears all ready jobs; automatic post-ingest processing stays intentionally small.
- **Activity/Ops:** clickable issue tiles explain what is blocked and provide actions like opening papers or resending report emails.
- **Email loop:** report emails include signed verdict links, so ratings can be changed from email without logging in.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment

Create `.env.local` with the values from `.env.example`. The important split is:

- public visitors can read `/api/papers`
- admin-only routes require `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`
- Apps Script uses `EMAIL_INGEST_SECRET`
- signed email verdict buttons use `EMAIL_ACTION_SECRET`
- queue processing can be triggered by admin actions, email ingest, or cron-style calls
- `APP_BASE_URL` must be the deployed URL in production so email links point to the right app
- Resend requires a verified sender domain for `REPORT_EMAIL_FROM`

## Database

Run `supabase/schema.sql` in your Supabase project. It defines:

- `papers`
- `paper_processing_jobs`
- `gmail_ingested_messages`
- `saved_project_ideas`
- login rate-limit/audit tables

## Gmail Ingest

Copy `scripts/google_apps_script.gs` into Google Apps Script, set:

- `PAPER_LIBRARY_WEBHOOK` to `https://your-domain/api/ingest/scholar-email`
- `PAPER_LIBRARY_SECRET` to the same value as `EMAIL_INGEST_SECRET`

The script logs sanitized diagnostics and labels processed threads so failed webhook calls can be retried.

## Quality Checks

```bash
npm run lint
npm run build
npm test
```

The tests are HTTP smoke tests against the real Next API routes. They intentionally run without Supabase credentials to verify auth boundaries and configuration failures.

## Why It Exists

Scholar alerts are easy to ignore because each email is a tiny decision tax. ArXiv Sieve turns that stream into a queue, extracts the useful parts, and makes triage fast enough that reading actually happens.

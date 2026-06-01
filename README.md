# ArXiv Sieve

Sort papers before they rot in your inbox.

ArXiv Sieve is a small research desk for turning Scholar Inbox emails and arXiv links into a searchable paper library. It queues papers, summarizes them with Gemini, sends one email report per paper, and lets the curator rate what is worth reading.

![ArXiv Sieve screenshot](public/screenshot.webp)

## What It Does

- Ingests Scholar Inbox digest emails through a Google Apps Script webhook.
- Resolves Scholar Inbox links into arXiv PDFs without exposing private `sha_key` values.
- Queues papers in Supabase and processes them with retry/backoff.
- Generates structured summaries: overview, contributions, prior-work delta, and project ideas.
- Sends report emails with rating actions.
- Keeps the public library read-only while curator actions stay behind a passphrase cookie.
- Adds author/model views with search, grid/list display, and lightweight ranking.

## Stack

- Next.js App Router
- Supabase Postgres
- Gemini via `@google/genai`
- Resend for report emails
- Vercel for hosting
- Google Apps Script for Gmail polling

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
- queue processing can be triggered by admin actions, email ingest, or cron-style calls

## Database

Run `supabase/schema.sql` in your Supabase project. It defines:

- `papers`
- `paper_processing_jobs`
- `gmail_ingested_messages`
- login rate-limit/audit tables

## Quality Checks

```bash
npm run lint
npm run build
npm test
```

The tests are HTTP smoke tests against the real Next API routes. They intentionally run without Supabase credentials to verify auth boundaries and configuration failures.

## Why It Exists

Scholar alerts are easy to ignore because each email is a tiny decision tax. ArXiv Sieve turns that stream into a queue, extracts the useful parts, and makes triage fast enough that reading actually happens.

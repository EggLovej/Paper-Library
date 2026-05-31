import { extractScholarInboxPaperUrls } from "@/lib/scholar-email";
import { processPaperProcessingJobs } from "@/lib/jobs/paper-processing-jobs";
import { submitPaperUrl } from "@/lib/papers/submit-paper";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ScholarEmailRequestBody = {
  messageId?: unknown;
  subject?: unknown;
  date?: unknown;
  body?: unknown;
};

type IngestedMessageRow = {
  id: string;
  gmail_message_id: string;
  status: string;
};

function missingSupabaseResponse() {
  return Response.json(
    {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase key to .env.local.",
    },
    { status: 500 },
  );
}

function isAuthorized(request: Request) {
  const secret = process.env.EMAIL_INGEST_SECRET ?? process.env.CRON_SECRET;

  if (!secret && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!secret) {
    return false;
  }

  const bearerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  return bearerToken === secret;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getAutoProcessLimit() {
  const rawLimit = process.env.EMAIL_INGEST_AUTO_PROCESS_LIMIT ?? "1";
  const parsedLimit = Number(rawLimit);

  if (!Number.isInteger(parsedLimit)) {
    return 1;
  }

  return Math.min(Math.max(parsedLimit, 0), 3);
}

async function updateMessageStatus({
  rowId,
  status,
  paperUrls,
  error,
}: {
  rowId: string;
  status: "completed" | "failed";
  paperUrls?: string[];
  error?: unknown;
}) {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from("gmail_ingested_messages")
    .update({
      status,
      ...(paperUrls ? { paper_urls: paperUrls } : {}),
      error:
        status === "failed"
          ? error instanceof Error
            ? error.message
            : "Unknown ingest error."
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
  }

  let body: ScholarEmailRequestBody;

  try {
    body = (await request.json()) as ScholarEmailRequestBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const messageId = getString(body.messageId);
  const emailBody = getString(body.body);

  if (!messageId || !emailBody) {
    return Response.json(
      { error: "Please provide messageId and body." },
      { status: 400 },
    );
  }

  const { data: existingMessage, error: existingError } = await supabase
    .from("gmail_ingested_messages")
    .select("id, gmail_message_id, status")
    .eq("gmail_message_id", messageId)
    .maybeSingle<IngestedMessageRow>();

  if (existingError) {
    return Response.json(
      { error: "The message could not be checked.", details: existingError.message },
      { status: 500 },
    );
  }

  if (existingMessage?.status === "completed") {
    return Response.json({
      status: "already_ingested",
      messageId,
      papersQueued: 0,
      paperUrlsFound: 0,
    });
  }

  let messageRow = existingMessage;

  if (!messageRow) {
    const { data: insertedMessage, error: insertError } = await supabase
      .from("gmail_ingested_messages")
      .insert({
        gmail_message_id: messageId,
        subject: getString(body.subject),
        received_at: parseDate(getString(body.date)),
        status: "processing",
      })
      .select("id, gmail_message_id, status")
      .single<IngestedMessageRow>();

    if (insertError) {
      return Response.json(
        { error: "The message could not be recorded.", details: insertError.message },
        { status: 500 },
      );
    }

    messageRow = insertedMessage;
  }

  const paperUrls = extractScholarInboxPaperUrls(emailBody);

  try {
    const results = [];

    for (const paperUrl of paperUrls) {
      results.push(
        await submitPaperUrl(supabase, paperUrl, {
          sourceMessageId: messageId,
        }),
      );
    }

    await updateMessageStatus({
      rowId: messageRow.id,
      status: "completed",
      paperUrls,
    });

    const queuedCount = results.filter(
      (result) =>
        result.status === "accepted" || result.status === "already_exists",
    ).length;
    const autoProcessLimit = getAutoProcessLimit();
    let processingResults: Awaited<
      ReturnType<typeof processPaperProcessingJobs>
    > = [];
    let processingError: string | null = null;

    if (autoProcessLimit > 0) {
      try {
        processingResults = await processPaperProcessingJobs(
          supabase,
          autoProcessLimit,
        );
      } catch (error) {
        processingError =
          error instanceof Error
            ? error.message
            : "The queued papers could not be summarized automatically.";
      }
    }

    return Response.json({
      status: "completed",
      messageId,
      paperUrlsFound: paperUrls.length,
      papersQueued: queuedCount,
      autoProcessLimit,
      papersProcessed: processingResults.length,
      processingResults,
      processingError,
      results,
    });
  } catch (error) {
    await updateMessageStatus({
      rowId: messageRow.id,
      status: "failed",
      error,
    });

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "The email could not be ingested.",
        messageId,
        paperUrlsFound: paperUrls.length,
      },
      { status: 500 },
    );
  }
}

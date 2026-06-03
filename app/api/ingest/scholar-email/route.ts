import { extractScholarInboxPaperUrls } from "@/lib/scholar-email";
import { processPaperProcessingJobs } from "@/lib/jobs/paper-processing-jobs";
import { submitPaperUrl } from "@/lib/papers/submit-paper";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import {
  getNonEmptyString,
  invalidJsonResponse,
  missingSupabaseResponse,
} from "@/lib/api/responses";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ScholarEmailRequestBody = {
  messageId?: unknown;
  threadId?: unknown;
  subject?: unknown;
  date?: unknown;
  body?: unknown;
};

type IngestedMessageRow = {
  id: string;
  gmail_message_id: string;
  thread_id: string | null;
  status: string;
};

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
    return invalidJsonResponse();
  }

  const messageId = getNonEmptyString(body.messageId);
  const threadId = getNonEmptyString(body.threadId);
  const emailBody = getNonEmptyString(body.body);

  if (!messageId || !emailBody) {
    return Response.json(
      { error: "Please provide messageId and body." },
      { status: 400 },
    );
  }

  const { data: existingMessage, error: existingError } = await supabase
    .from("gmail_ingested_messages")
    .select("id, gmail_message_id, thread_id, status")
    .eq("gmail_message_id", messageId)
    .maybeSingle<IngestedMessageRow>();

  if (existingError) {
    return Response.json(
      { error: "The message could not be checked.", details: existingError.message },
      { status: 500 },
    );
  }

  if (existingMessage?.status === "completed") {
    if (threadId && !existingMessage.thread_id) {
      await supabase
        .from("gmail_ingested_messages")
        .update({ thread_id: threadId, updated_at: new Date().toISOString() })
        .eq("id", existingMessage.id);
    }

    return Response.json({
      status: "already_ingested",
      messageId,
      threadId,
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
        thread_id: threadId,
        subject: getNonEmptyString(body.subject),
        received_at: parseDate(getNonEmptyString(body.date)),
        status: "processing",
      })
      .select("id, gmail_message_id, thread_id, status")
      .single<IngestedMessageRow>();

    if (insertError) {
      return Response.json(
        { error: "The message could not be recorded.", details: insertError.message },
        { status: 500 },
      );
    }

    messageRow = insertedMessage;
  } else if (threadId && !messageRow.thread_id) {
    await supabase
      .from("gmail_ingested_messages")
      .update({ thread_id: threadId, updated_at: new Date().toISOString() })
      .eq("id", messageRow.id);
    messageRow = { ...messageRow, thread_id: threadId };
  }

  const paperUrls = extractScholarInboxPaperUrls(emailBody);

  await logAdminAuditEvent(supabase, request, {
    action: "gmail_ingest_received",
    resourceType: "gmail_message",
    resourceId: messageRow.id,
    metadata: {
      source: "gmail_app_script",
      messageId,
      threadId,
      subject: getNonEmptyString(body.subject),
      paperUrlsFound: paperUrls.length,
    },
  });

  try {
    const results = [];

    for (const paperUrl of paperUrls) {
      results.push(
        await submitPaperUrl(supabase, paperUrl, {
          auditSource: "gmail_app_script",
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
          { source: "gmail_app_script" },
        );
      } catch (error) {
        processingError =
          error instanceof Error
            ? error.message
            : "The queued papers could not be summarized automatically.";
      }
    }

    await logAdminAuditEvent(supabase, request, {
      action: "gmail_ingest_completed",
      resourceType: "gmail_message",
      resourceId: messageRow.id,
      metadata: {
        source: "gmail_app_script",
        messageId,
        threadId,
        paperUrlsFound: paperUrls.length,
        papersQueued: queuedCount,
        autoProcessLimit,
        papersProcessed: processingResults.length,
        processingError,
      },
    });

    return Response.json({
      status: "completed",
      messageId,
      threadId,
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

    await logAdminAuditEvent(supabase, request, {
      action: "gmail_ingest_failed",
      resourceType: "gmail_message",
      resourceId: messageRow.id,
      metadata: {
        source: "gmail_app_script",
        messageId,
        threadId,
        paperUrlsFound: paperUrls.length,
        error:
          error instanceof Error ? error.message : "The email could not be ingested.",
      },
    });

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "The email could not be ingested.",
        messageId,
        threadId,
        paperUrlsFound: paperUrls.length,
      },
      { status: 500 },
    );
  }
}

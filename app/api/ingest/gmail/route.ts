import { extractScholarInboxPaperUrls } from "@/lib/scholar-email";
import {
  getGmailAccessToken,
  getGmailHeader,
  getGmailMessage,
  getGmailMessageBody,
  getGmailReceivedAt,
  listScholarInboxMessages,
} from "@/lib/gmail";
import { submitPaperUrl } from "@/lib/papers/submit-paper";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  if (process.env.NODE_ENV !== "production" && !process.env.CRON_SECRET) {
    return true;
  }

  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const bearerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  return querySecret === secret || bearerToken === secret;
}

async function markMessageCompleted({
  supabase,
  rowId,
  paperUrls,
}: {
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>;
  rowId: string;
  paperUrls: string[];
}) {
  await supabase
    .from("gmail_ingested_messages")
    .update({
      status: "completed",
      paper_urls: paperUrls,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);
}

async function markMessageFailed({
  supabase,
  rowId,
  error,
}: {
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>;
  rowId: string;
  error: unknown;
}) {
  await supabase
    .from("gmail_ingested_messages")
    .update({
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown ingest error.",
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

  let access: { accessToken: string; userId: string };

  try {
    access = await getGmailAccessToken();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gmail access token could not be loaded.",
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.max(
    1,
    Math.min(25, Number(url.searchParams.get("limit") ?? 10)),
  );
  const messages = await listScholarInboxMessages({
    ...access,
    maxResults: limit,
  });
  const results: Array<{
    gmailMessageId: string;
    status: string;
    paperUrlsFound?: number;
    papersQueued?: number;
    skipped?: boolean;
    error?: string;
  }> = [];

  for (const messageSummary of messages) {
    const { data: existingMessage, error: existingError } = await supabase
      .from("gmail_ingested_messages")
      .select("id, gmail_message_id, status")
      .eq("gmail_message_id", messageSummary.id)
      .maybeSingle<IngestedMessageRow>();

    if (existingError) {
      results.push({
        gmailMessageId: messageSummary.id,
        status: "failed",
        error: existingError.message,
      });
      continue;
    }

    if (existingMessage?.status === "completed") {
      results.push({
        gmailMessageId: messageSummary.id,
        status: "already_ingested",
        skipped: true,
      });
      continue;
    }

    const message = await getGmailMessage({
      ...access,
      messageId: messageSummary.id,
    });
    const subject = getGmailHeader(message, "subject");
    const sender = getGmailHeader(message, "from");
    const receivedAt = getGmailReceivedAt(message);
    const messageBody = getGmailMessageBody(message);
    const paperUrls = extractScholarInboxPaperUrls(messageBody);
    let row = existingMessage;

    if (!row) {
      const { data: insertedMessage, error: insertError } = await supabase
        .from("gmail_ingested_messages")
        .insert({
          gmail_message_id: message.id,
          thread_id: message.threadId,
          subject,
          sender,
          received_at: receivedAt,
          status: "processing",
        })
        .select("id, gmail_message_id, status")
        .single<IngestedMessageRow>();

      if (insertError) {
        results.push({
          gmailMessageId: message.id,
          status: "failed",
          error: insertError.message,
        });
        continue;
      }

      row = insertedMessage;
    }

    try {
      let papersQueued = 0;

      for (const paperUrl of paperUrls) {
        const submitResult = await submitPaperUrl(supabase, paperUrl, {
          sourceMessageId: message.id,
        });

        if (
          submitResult.status === "accepted" ||
          submitResult.status === "already_exists"
        ) {
          papersQueued += 1;
        }
      }

      await markMessageCompleted({
        supabase,
        rowId: row.id,
        paperUrls,
      });

      results.push({
        gmailMessageId: message.id,
        status: "completed",
        paperUrlsFound: paperUrls.length,
        papersQueued,
      });
    } catch (error) {
      await markMessageFailed({
        supabase,
        rowId: row.id,
        error,
      });
      results.push({
        gmailMessageId: message.id,
        status: "failed",
        paperUrlsFound: paperUrls.length,
        error: error instanceof Error ? error.message : "Unknown ingest error.",
      });
    }
  }

  return Response.json({
    scanned: messages.length,
    ingested: results.filter((result) => result.status === "completed").length,
    results,
  });
}

export async function GET(request: Request) {
  return POST(request);
}

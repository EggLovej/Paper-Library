import { createHmac, timingSafeEqual } from "crypto";

import { isPaperRating, type PaperRating } from "@/lib/paper-ratings";

function getRatingActionSecret() {
  return (
    process.env.EMAIL_ACTION_SECRET ??
    process.env.CRON_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    null
  );
}

function getPayload(paperId: string, rating: PaperRating) {
  return `${paperId}:${rating}`;
}

export function signRatingAction(paperId: string, rating: PaperRating) {
  const secret = getRatingActionSecret();

  if (!secret) {
    throw new Error(
      "Rating actions are not configured. Add EMAIL_ACTION_SECRET to .env.local.",
    );
  }

  return createHmac("sha256", secret)
    .update(getPayload(paperId, rating))
    .digest("base64url");
}

export function verifyRatingActionToken({
  paperId,
  rating,
  token,
}: {
  paperId: string;
  rating: unknown;
  token: string | null;
}) {
  if (!token || !isPaperRating(rating)) {
    return false;
  }

  let expectedToken: string;

  try {
    expectedToken = signRatingAction(paperId, rating);
  } catch {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const actualBuffer = Buffer.from(token);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

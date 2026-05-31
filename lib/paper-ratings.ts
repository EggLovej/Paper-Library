export const PAPER_RATINGS = [
  "interested",
  "maybe",
  "not_interested",
  "read_later",
] as const;

export type PaperRating = (typeof PAPER_RATINGS)[number];

export const PAPER_RATING_LABELS: Record<PaperRating, string> = {
  interested: "Save",
  maybe: "Maybe pile",
  not_interested: "Toss",
  read_later: "Reading stack",
};

export function isPaperRating(value: unknown): value is PaperRating {
  return (
    typeof value === "string" &&
    PAPER_RATINGS.includes(value as PaperRating)
  );
}

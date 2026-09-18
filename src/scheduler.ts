import type { CardRecord, PluginSettings, Rating, SchedulePreview } from "./types";

const MINUTE = 60 * 1000;

export function intervalLabel(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  if (minutes < 24 * 60) return `${Math.max(1, Math.round(minutes / 60))}h`;
  if (minutes < 30 * 24 * 60) return `${Math.max(1, Math.round(minutes / (24 * 60)))}d`;
  if (minutes < 365 * 24 * 60) return `${Math.max(1, Math.round(minutes / (30 * 24 * 60)))}mo`;
  return `${Math.max(1, Math.round(minutes / (365 * 24 * 60)))}y`;
}

export function schedulePreview(card: CardRecord, settings: PluginSettings): Record<Rating, SchedulePreview> {
  return {
    again: previewFor(card, "again", settings),
    hard: previewFor(card, "hard", settings),
    good: previewFor(card, "good", settings),
    easy: previewFor(card, "easy", settings),
  };
}

export function scheduleCard(card: CardRecord, rating: Rating, now: number, settings: PluginSettings): CardRecord {
  const next = nextInterval(card, rating, settings);
  const isAgain = rating === "again";
  const easeDelta = rating === "hard" ? -0.15 : rating === "easy" ? 0.15 : 0;

  return {
    ...card,
    dueAt: now + next * MINUTE,
    intervalMinutes: next,
    easeFactor: clamp(card.easeFactor + easeDelta, 1.3, 4),
    repetitions: isAgain ? 0 : card.repetitions + 1,
    lapses: isAgain ? card.lapses + (card.repetitions > 0 ? 1 : 0) : card.lapses,
    lastReviewedAt: now,
    lastRating: rating,
    updatedAt: now,
  };
}

function previewFor(card: CardRecord, rating: Rating, settings: PluginSettings): SchedulePreview {
  const intervalMinutes = nextInterval(card, rating, settings);
  return { intervalMinutes, label: intervalLabel(intervalMinutes) };
}

function nextInterval(card: CardRecord, rating: Rating, settings: PluginSettings): number {
  const current = Math.max(card.intervalMinutes, 1);

  if (card.repetitions === 0 && !card.lastReviewedAt) {
    if (rating === "again") return 1;
    if (rating === "hard") return 6 * 60;
    if (rating === "good") return settings.newGoodIntervalMinutes;
    return settings.newEasyIntervalMinutes;
  }

  switch (rating) {
    case "again":
      return Math.min(10, Math.max(1, Math.round(current * 0.1)));
    case "hard":
      return Math.max(10, Math.round(current * 1.2));
    case "good":
      return Math.max(24 * 60, Math.round(current * card.easeFactor));
    case "easy":
      return Math.max(24 * 60, Math.round(current * card.easeFactor * 1.3));
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
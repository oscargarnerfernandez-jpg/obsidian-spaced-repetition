export type Rating = "again" | "hard" | "good" | "easy";

export interface CardRecord {
  path: string;
  title: string;
  excluded: boolean;
  deletedAt?: number;
  dueAt: number;
  intervalMinutes: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt?: number;
  lastRating?: Rating;
  createdAt: number;
  updatedAt: number;
}

export interface PluginSettings {
  maxNewCardsPerSession: number;
  maxReviewCardsPerSession: number;
  dailyReviewLimit: number;
  includeNotDue: boolean;
  newGoodIntervalMinutes: number;
  newEasyIntervalMinutes: number;
  startingEaseFactor: number;
}

export interface PersistedData {
  version: 1;
  cards: Record<string, CardRecord>;
  settings: PluginSettings;
  lastSyncAt?: number;
  reviewDay?: string;
  reviewedToday?: number;
}

export interface NoteSnapshot {
  path: string;
  title: string;
  excluded: boolean;
}

export interface SchedulePreview {
  intervalMinutes: number;
  label: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  maxNewCardsPerSession: 20,
  maxReviewCardsPerSession: 100,
  dailyReviewLimit: 200,
  includeNotDue: false,
  newGoodIntervalMinutes: 24 * 60,
  newEasyIntervalMinutes: 4 * 24 * 60,
  startingEaseFactor: 2.5,
};

export function isRating(value: unknown): value is Rating {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
}

export function mergeSettings(value: unknown): PluginSettings {
  const candidate = typeof value === "object" && value !== null ? value as Partial<PluginSettings> : {};
  return {
    maxNewCardsPerSession: positiveInt(candidate.maxNewCardsPerSession, DEFAULT_SETTINGS.maxNewCardsPerSession),
    maxReviewCardsPerSession: positiveInt(candidate.maxReviewCardsPerSession, DEFAULT_SETTINGS.maxReviewCardsPerSession),
    dailyReviewLimit: positiveInt(candidate.dailyReviewLimit, DEFAULT_SETTINGS.dailyReviewLimit),
    includeNotDue: candidate.includeNotDue === true,
    newGoodIntervalMinutes: positiveInt(candidate.newGoodIntervalMinutes, DEFAULT_SETTINGS.newGoodIntervalMinutes),
    newEasyIntervalMinutes: positiveInt(candidate.newEasyIntervalMinutes, DEFAULT_SETTINGS.newEasyIntervalMinutes),
    startingEaseFactor: positiveNumber(candidate.startingEaseFactor, DEFAULT_SETTINGS.startingEaseFactor, 1.3, 4),
  };
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function positiveNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}
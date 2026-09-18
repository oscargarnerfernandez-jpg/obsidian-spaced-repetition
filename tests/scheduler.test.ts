import assert from "node:assert/strict";
import test from "node:test";
import { scheduleCard } from "../src/scheduler";
import type { CardRecord, PluginSettings } from "../src/types";

const settings: PluginSettings = {
  maxNewCardsPerSession: 20,
  maxReviewCardsPerSession: 100,
  dailyReviewLimit: 200,
  includeNotDue: false,
  newGoodIntervalMinutes: 1440,
  newEasyIntervalMinutes: 5760,
  startingEaseFactor: 2.5,
};

const fresh = (): CardRecord => ({
  path: "note.md",
  title: "Note",
  excluded: false,
  dueAt: 0,
  intervalMinutes: 0,
  easeFactor: 2.5,
  repetitions: 0,
  lapses: 0,
  createdAt: 0,
  updatedAt: 0,
});

test("new cards use deterministic Again and Good intervals", () => {
  assert.equal(scheduleCard(fresh(), "again", 1000, settings).intervalMinutes, 1);
  assert.equal(scheduleCard(fresh(), "good", 1000, settings).intervalMinutes, 1440);
});

test("review ratings adjust interval and ease predictably", () => {
  const card = { ...fresh(), intervalMinutes: 1440, repetitions: 2, lastReviewedAt: 10 };
  const hard = scheduleCard(card, "hard", 1000, settings);
  const good = scheduleCard(card, "good", 1000, settings);
  const easy = scheduleCard(card, "easy", 1000, settings);
  assert.equal(hard.intervalMinutes, 1728);
  assert.equal(good.intervalMinutes, 3600);
  assert.equal(easy.intervalMinutes, 4680);
  assert.equal(hard.easeFactor, 2.35);
  assert.equal(easy.easeFactor, 2.65);
});

test("Again resets repetitions and records a lapse for learned cards", () => {
  const card = { ...fresh(), intervalMinutes: 1440, repetitions: 3, lastReviewedAt: 10 };
  const updated = scheduleCard(card, "again", 1000, settings);
  assert.equal(updated.repetitions, 0);
  assert.equal(updated.lapses, 1);
  assert.equal(updated.lastRating, "again");
});
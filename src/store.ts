import { MetadataCache, TFile, Vault } from "obsidian";
import type { CardRecord, NoteSnapshot, PersistedData, PluginSettings, Rating } from "./types";
import { DEFAULT_SETTINGS, isRating, mergeSettings } from "./types";
import { scheduleCard } from "./scheduler";

const CURRENT_VERSION = 1;
const EXCLUDE_TAG = "#exclude";
const BODY_EXCLUDE_RE = /(^|\s)#exclude(?=$|[\s.,;:!?()[\]{}])/i;

export class CardStore {
  private data: PersistedData = {
    version: CURRENT_VERSION,
    cards: {},
    settings: DEFAULT_SETTINGS,
  };
  private saveQueue: Promise<void> = Promise.resolve();
  private syncTimer?: number;

  constructor(
    private readonly vault: Vault,
    private readonly metadataCache: MetadataCache,
    private readonly loadData: () => Promise<unknown>,
    private readonly saveData: (data: PersistedData) => Promise<void>,
  ) {}

  async load(): Promise<void> {
    const stored = await this.loadData();
    const candidate = typeof stored === "object" && stored !== null ? stored as Partial<PersistedData> : {};
    const rawCards = candidate.cards && typeof candidate.cards === "object" ? candidate.cards : {};

    this.data = {
      version: CURRENT_VERSION,
      cards: {},
      settings: mergeSettings(candidate.settings),
      lastSyncAt: typeof candidate.lastSyncAt === "number" ? candidate.lastSyncAt : undefined,
      reviewDay: typeof candidate.reviewDay === "string" ? candidate.reviewDay : undefined,
      reviewedToday: numberOr(candidate.reviewedToday, 0),
    };
    this.resetDailyCountIfNeeded();

    for (const [path, rawCard] of Object.entries(rawCards)) {
      const card = this.normalizeCard(path, rawCard);
      if (card) this.data.cards[path] = card;
    }
  }

  get settings(): PluginSettings {
    return this.data.settings;
  }

  async updateSettings(settings: Partial<PluginSettings>): Promise<void> {
    this.data.settings = mergeSettings({ ...this.data.settings, ...settings });
    await this.persist();
  }

  get cards(): CardRecord[] {
    return Object.values(this.data.cards);
  }

  get reviewedToday(): number {
    this.resetDailyCountIfNeeded();
    return this.data.reviewedToday ?? 0;
  }

  getCard(path: string): CardRecord | undefined {
    return this.data.cards[path];
  }

  requestSync(): void {
    if (this.syncTimer !== undefined) window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = undefined;
      void this.sync();
    }, 350);
  }

  async sync(): Promise<void> {
    const files = this.vault.getMarkdownFiles();
    const seen = new Set<string>();

    for (const file of files) {
      seen.add(file.path);
      const excluded = await this.isExcluded(file);
      const existing = this.data.cards[file.path];
      const now = Date.now();

      if (existing) {
        existing.title = file.basename;
        existing.excluded = excluded;
        existing.deletedAt = undefined;
        existing.updatedAt = now;
      } else {
        this.data.cards[file.path] = this.createCard(file.path, file.basename, excluded, now);
      }
    }

    for (const card of Object.values(this.data.cards)) {
      if (!seen.has(card.path) && !card.deletedAt) {
        card.deletedAt = Date.now();
        card.excluded = true;
        card.updatedAt = Date.now();
      }
    }

    this.data.lastSyncAt = Date.now();
    await this.persist();
  }

  async handleRename(file: TFile, oldPath: string): Promise<void> {
    const oldCard = this.data.cards[oldPath];
    if (oldCard) {
      delete this.data.cards[oldPath];
      oldCard.path = file.path;
      oldCard.title = file.basename;
      oldCard.deletedAt = undefined;
      oldCard.updatedAt = Date.now();
      this.data.cards[file.path] = oldCard;
    }
    await this.sync();
  }

  async removeDeletedPath(path: string): Promise<void> {
    const card = this.data.cards[path];
    if (!card) return;
    card.deletedAt = Date.now();
    card.excluded = true;
    card.updatedAt = Date.now();
    await this.persist();
  }

  async review(path: string, rating: Rating, now = Date.now()): Promise<CardRecord | undefined> {
    const card = this.data.cards[path];
    if (!card || card.deletedAt || card.excluded || !isRating(rating)) return undefined;
    this.resetDailyCountIfNeeded(now);
    const updated = scheduleCard(card, rating, now, this.data.settings);
    this.data.cards[path] = updated;
    this.data.reviewedToday = (this.data.reviewedToday ?? 0) + 1;
    await this.persist();
    return updated;
  }

  async persist(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.data)) as PersistedData;
    this.saveQueue = this.saveQueue
      .catch(() => undefined)
      .then(() => this.saveData(snapshot));
    await this.saveQueue;
  }

  private createCard(path: string, title: string, excluded: boolean, now: number): CardRecord {
    return {
      path,
      title,
      excluded,
      dueAt: now,
      intervalMinutes: 0,
      easeFactor: this.data.settings.startingEaseFactor,
      repetitions: 0,
      lapses: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  private normalizeCard(path: string, value: unknown): CardRecord | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const card = value as Partial<CardRecord>;
    if (typeof card.title !== "string" || typeof card.dueAt !== "number") return undefined;
    const now = Date.now();
    return {
      path,
      title: card.title,
      excluded: card.excluded === true,
      deletedAt: typeof card.deletedAt === "number" ? card.deletedAt : undefined,
      dueAt: card.dueAt,
      intervalMinutes: numberOr(card.intervalMinutes, 0),
      easeFactor: numberOr(card.easeFactor, this.data.settings.startingEaseFactor),
      repetitions: numberOr(card.repetitions, 0),
      lapses: numberOr(card.lapses, 0),
      lastReviewedAt: typeof card.lastReviewedAt === "number" ? card.lastReviewedAt : undefined,
      lastRating: isRating(card.lastRating) ? card.lastRating : undefined,
      createdAt: numberOr(card.createdAt, now),
      updatedAt: numberOr(card.updatedAt, now),
    };
  }

  private async isExcluded(file: TFile): Promise<boolean> {
    const cache = this.metadataCache.getFileCache(file);
    const frontmatterTags = cache?.frontmatter?.tags;
    if (hasExcludeTag(frontmatterTags)) return true;

    const content = await this.vault.read(file);
    return BODY_EXCLUDE_RE.test(content);
  }

  private resetDailyCountIfNeeded(now = Date.now()): void {
    const day = dayKey(now);
    if (this.data.reviewDay !== day) {
      this.data.reviewDay = day;
      this.data.reviewedToday = 0;
    }
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hasExcludeTag(value: unknown): boolean {
  const tags = Array.isArray(value) ? value : [value];
  return tags.some((tag) => typeof tag === "string" && normalizeTag(tag) === EXCLUDE_TAG);
}

function normalizeTag(tag: string): string {
  const trimmed = tag.trim().toLowerCase();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
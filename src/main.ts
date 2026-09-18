import { MarkdownView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { CardRecord, PluginSettings } from "./types";
import { CardStore } from "./store";
import { ReviewView, ReviewMode, VIEW_TYPE_REVIEW } from "./review-view";
import { SpacedRepetitionSettingTab } from "./settings-tab";

export default class SpacedRepetitionPlugin extends Plugin {
  readonly store = new CardStore(
    this.app.vault,
    this.app.metadataCache,
    () => this.loadData(),
    (data) => this.saveData(data),
  );

  async onload(): Promise<void> {
    await this.store.load();
    this.registerView(VIEW_TYPE_REVIEW, (leaf) => new ReviewView(leaf, this));
    this.addSettingTab(new SpacedRepetitionSettingTab(this.app, this));

    this.addCommand({
      id: "start-review",
      name: "Start spaced repetition review",
      callback: () => void this.openReview("start"),
    });
    this.addCommand({
      id: "review-due",
      name: "Review due cards",
      callback: () => void this.openReview("due"),
    });
    this.addCommand({
      id: "review-all",
      name: "Review all cards",
      callback: () => void this.openReview("all"),
    });
    this.addCommand({
      id: "review-current-note",
      name: "Review current note",
      checkCallback: (checking) => {
        const file = this.currentMarkdownFile();
        if (!file) return false;
        if (!checking) void this.openReview("all", file.path);
        return true;
      },
    });

    this.registerEvent(this.app.vault.on("create", () => this.store.requestSync()));
    this.registerEvent(this.app.vault.on("modify", () => this.store.requestSync()));
    this.registerEvent(this.app.vault.on("delete", (file) => void this.store.removeDeletedPath(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") void this.store.handleRename(file, oldPath);
    }));
    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) {
        void this.store.sync();
      }
    });

    await this.store.sync();
  }

  onunload(): void {
    // Obsidian disposes registered events and views. The store only uses plugin data APIs.
  }

  getSessionCards(mode: ReviewMode, onlyPath?: string): CardRecord[] {
    const now = Date.now();
    const settings = this.store.settings;
    const eligible = this.store.cards
      .filter((card) => !card.deletedAt && !card.excluded)
      .filter((card) => !onlyPath || card.path === onlyPath)
      .filter((card) => mode === "all" || card.dueAt <= now || (mode === "start" && settings.includeNotDue))
      .sort((a, b) => a.dueAt - b.dueAt || a.title.localeCompare(b.title));

    const newCards = eligible.filter((card) => !card.lastReviewedAt).slice(0, settings.maxNewCardsPerSession);
    const reviewed = eligible
      .filter((card) => card.lastReviewedAt)
      .slice(0, Math.min(
        settings.maxReviewCardsPerSession,
        Math.max(0, settings.dailyReviewLimit - this.store.reviewedToday),
      ));
    return [...newCards, ...reviewed];
  }

  getDueTodayCount(now = Date.now()): number {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return this.store.cards.filter((card) =>
      !card.deletedAt
      && !card.excluded
      && card.dueAt <= endOfDay.getTime()
    ).length;
  }

  async openReview(mode: ReviewMode, onlyPath?: string): Promise<void> {
    await this.ensureView();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    const leaf = leaves[0];
    if (!leaf) return;
    const view = leaf.view;
    if (view instanceof ReviewView) {
      await view.start(mode, onlyPath);
    }
  }

  async updateSettings(settings: Partial<PluginSettings>): Promise<void> {
    await this.store.updateSettings(settings);
  }

  private async ensureView(): Promise<WorkspaceLeaf> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return existing;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_REVIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  private currentMarkdownFile(): TFile | undefined {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file ?? undefined;
  }
}
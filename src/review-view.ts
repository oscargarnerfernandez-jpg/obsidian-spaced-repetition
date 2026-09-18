import {
  ItemView,
  MarkdownRenderer,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
  Component,
} from "obsidian";
import type { CardRecord, Rating } from "./types";
import { intervalLabel, schedulePreview } from "./scheduler";
import type SpacedRepetitionPlugin from "./main";

export const VIEW_TYPE_REVIEW = "spaced-repetition-review";

export type ReviewMode = "start" | "due" | "all";

export class ReviewView extends ItemView {
  private component?: Component;
  private session: CardRecord[] = [];
  private position = 0;
  private revealed = false;
  private mode: ReviewMode = "due";
  private keyHandler?: (event: KeyboardEvent) => void;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SpacedRepetitionPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_REVIEW;
  }

  getDisplayText(): string {
    return "Spaced repetition";
  }

  async onOpen(): Promise<void> {
    this.keyHandler = (event) => this.handleKey(event);
    this.containerEl.addEventListener("keydown", this.keyHandler);
    this.containerEl.tabIndex = -1;
    this.containerEl.addClass("sr-view");
    await this.render();
  }

  async onClose(): Promise<void> {
    if (this.keyHandler) this.containerEl.removeEventListener("keydown", this.keyHandler);
    this.component?.unload();
  }

  async start(mode: ReviewMode, onlyPath?: string): Promise<void> {
    this.mode = mode;
    await this.plugin.store.sync();
    this.session = this.plugin.getSessionCards(mode, onlyPath);
    this.position = 0;
    this.revealed = false;
    await this.render();
    this.containerEl.focus();
  }

  private async render(): Promise<void> {
    this.component?.unload();
    this.component = undefined;
    this.contentEl.empty();

    if (this.session.length === 0) {
      this.renderEmpty();
      return;
    }

    const card = this.session[this.position];
    if (!card) {
      this.renderFinished();
      return;
    }

    const header = this.contentEl.createDiv({ cls: "sr-header" });
    const title = header.createDiv({ cls: "sr-product" });
    const logo = title.createSpan({ cls: "sr-logo" });
    setIcon(logo, "layers");
    title.createSpan({ text: "Recall" });
    const stats = header.createDiv({ cls: "sr-stats" });
    stats.createSpan({ cls: "sr-due-count", text: `${this.plugin.getDueTodayCount()} due today` });
    stats.createSpan({ cls: "sr-progress", text: `${this.position + 1} / ${this.session.length}` });

    const main = this.contentEl.createDiv({ cls: "sr-main" });
    const eyebrow = main.createDiv({ cls: "sr-eyebrow", text: card.excluded ? "Excluded" : "Review prompt" });
    eyebrow.setAttr("aria-live", "polite");
    const front = main.createDiv({ cls: "sr-front" });
    front.createEl("h1", { text: card.title });
    front.createDiv({ cls: "sr-path", text: card.path });

    if (!this.revealed) {
      const reveal = main.createEl("button", { cls: "sr-reveal sr-primary", text: "Reveal answer" });
      reveal.setAttr("aria-label", "Reveal answer");
      reveal.addEventListener("click", () => {
        this.revealed = true;
        void this.render();
      });
      const hint = main.createDiv({ cls: "sr-hint", text: "Press Space or Enter to reveal" });
      hint.setAttr("aria-hidden", "true");
      return;
    }

    const divider = main.createDiv({ cls: "sr-divider" });
    divider.createSpan({ text: "Answer" });
    const back = main.createDiv({ cls: "sr-back markdown-rendered" });
    const file = this.plugin.app.vault.getAbstractFileByPath(card.path);
    if (file instanceof TFile) {
      this.component = new Component();
      const content = await this.plugin.app.vault.read(file);
      await MarkdownRenderer.renderMarkdown(content, back, file.path, this.component);
    } else {
      back.createDiv({ cls: "sr-deleted", text: "This note is no longer in the vault." });
    }

    const actions = main.createDiv({ cls: "sr-actions" });
    const previews = schedulePreview(card, this.plugin.store.settings);
    for (const rating of ["again", "hard", "good", "easy"] as Rating[]) {
      const button = actions.createEl("button", { cls: `sr-rating sr-${rating}` });
      button.createSpan({ cls: "sr-rating-name", text: rating[0].toUpperCase() + rating.slice(1) });
      button.createSpan({ cls: "sr-rating-interval", text: intervalLabel(previews[rating].intervalMinutes) });
      button.setAttr("aria-label", `${rating}, next review in ${previews[rating].label}`);
      button.addEventListener("click", () => void this.rate(rating));
    }

    const footer = main.createDiv({ cls: "sr-footer" });
    const open = footer.createEl("button", { cls: "sr-open-note" });
    setIcon(open, "external-link");
    open.createSpan({ text: "Open underlying note" });
    open.addEventListener("click", () => void this.openNote(card));
  }

  private async rate(rating: Rating): Promise<void> {
    const card = this.session[this.position];
    if (!card) return;
    await this.plugin.store.review(card.path, rating);
    this.position += 1;
    this.revealed = false;
    await this.render();
  }

  private async openNote(card: CardRecord): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(card.path);
    if (!(file instanceof TFile)) {
      new Notice("The original note is no longer in the vault.");
      return;
    }
    const leaf = this.plugin.app.workspace.getLeaf(true);
    await leaf.openFile(file);
  }

  private renderEmpty(): void {
    const shell = this.contentEl.createDiv({ cls: "sr-empty" });
    const icon = shell.createDiv({ cls: "sr-empty-icon" });
    setIcon(icon, "check-circle-2");
    shell.createEl("h2", { text: this.mode === "all" ? "No notes to review" : "You’re all caught up" });
    shell.createDiv({
      cls: "sr-empty-copy",
      text: this.mode === "all"
        ? "No eligible Markdown notes were found in this vault."
        : "There are no cards due right now. Come back later or review all cards ahead of schedule.",
    });
    const actions = shell.createDiv({ cls: "sr-empty-actions" });
    if (this.mode !== "all") {
      const all = actions.createEl("button", { cls: "sr-primary", text: "Review all cards" });
      all.addEventListener("click", () => void this.start("all"));
    }
  }

  private renderFinished(): void {
    const shell = this.contentEl.createDiv({ cls: "sr-empty" });
    const icon = shell.createDiv({ cls: "sr-empty-icon" });
    setIcon(icon, "sparkles");
    shell.createEl("h2", { text: "Session complete" });
    shell.createDiv({ cls: "sr-empty-copy", text: `You reviewed ${this.session.length} ${this.session.length === 1 ? "card" : "cards"}.` });
    const again = shell.createEl("button", { cls: "sr-primary", text: "Review due cards again" });
    again.addEventListener("click", () => void this.start("due"));
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === " " || event.key === "Enter") {
      if (!this.revealed && this.session[this.position]) {
        event.preventDefault();
        this.revealed = true;
        void this.render();
      }
      return;
    }
    if (!this.revealed) return;
    const ratingByKey: Record<string, Rating> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
    const rating = ratingByKey[event.key];
    if (rating) {
      event.preventDefault();
      void this.rate(rating);
    }
  }
}
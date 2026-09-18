import { App, PluginSettingTab, Setting } from "obsidian";
import type SpacedRepetitionPlugin from "./main";

export class SpacedRepetitionSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SpacedRepetitionPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Spaced repetition" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Every eligible Markdown note becomes one flashcard. Scheduling data stays in this plugin’s local data file and never changes your notes.",
    });

    this.numberSetting(
      "New cards per session",
      "How many never-reviewed cards can enter a session.",
      this.plugin.store.settings.maxNewCardsPerSession,
      (value) => this.plugin.store.updateSettings({ maxNewCardsPerSession: value }),
    );
    this.numberSetting(
      "Review cards per session",
      "Maximum number of already-reviewed cards in a session.",
      this.plugin.store.settings.maxReviewCardsPerSession,
      (value) => this.plugin.store.updateSettings({ maxReviewCardsPerSession: value }),
    );
    this.numberSetting(
      "Daily review limit",
      "A safety limit for cards that have already been reviewed today.",
      this.plugin.store.settings.dailyReviewLimit,
      (value) => this.plugin.store.updateSettings({ dailyReviewLimit: value }),
    );

    new Setting(containerEl)
      .setName("Include cards that are not due")
      .setDesc("Include future cards in the standard Start review command.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.store.settings.includeNotDue)
        .onChange((value) => void this.plugin.store.updateSettings({ includeNotDue: value })));

    this.numberSetting(
      "Good interval for new cards (days)",
      "The first Good rating interval.",
      Math.round(this.plugin.store.settings.newGoodIntervalMinutes / (24 * 60)),
      (value) => this.plugin.store.updateSettings({ newGoodIntervalMinutes: value * 24 * 60 }),
    );
    this.numberSetting(
      "Easy interval for new cards (days)",
      "The first Easy rating interval.",
      Math.round(this.plugin.store.settings.newEasyIntervalMinutes / (24 * 60)),
      (value) => this.plugin.store.updateSettings({ newEasyIntervalMinutes: value * 24 * 60 }),
    );

    new Setting(containerEl)
      .setName("Scheduling algorithm")
      .setDesc("Deterministic SM-2-style scheduling with Again, Hard, Good, and Easy ratings.")
      .addText((text) => text.setValue("SM-2 style").setDisabled(true));
  }

  private numberSetting(name: string, desc: string, value: number, onChange: (value: number) => Promise<void>): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => text
        .setPlaceholder(String(value))
        .setValue(String(value))
        .onChange(async (raw) => {
          const next = Math.max(1, Math.round(Number(raw) || value));
          await onChange(next);
        }));
  }
}
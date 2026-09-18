# Spaced Repetition for Obsidian

An offline Obsidian plugin that turns each eligible Markdown note into exactly one Anki-style flashcard:

- **Front:** the note title (the filename without `.md`)
- **Back:** the complete Markdown note content

It works on Obsidian Desktop and Obsidian Mobile. It does not use a server, network requests, Node.js APIs, filesystem APIs, or external services at runtime.

## Architecture

The plugin has four small layers:

1. `CardStore` scans Markdown files through Obsidian’s `Vault` and `MetadataCache`, retains one scheduling record per path, and saves the index through the plugin data API.
2. `scheduler.ts` implements a deterministic SM-2-style scheduler with four ratings.
3. `ReviewView` is an Obsidian `ItemView`. It renders answers through Obsidian’s `MarkdownRenderer`, so links, formatting, embeds, and code blocks use normal vault rendering.
4. `SpacedRepetitionSettingTab` exposes session and scheduling settings through native Obsidian settings controls.

The runtime bundle has no production dependencies. `obsidian`, TypeScript, and esbuild are development/build dependencies only.

## Scheduling algorithm

This version uses a deliberately documented SM-2-style algorithm rather than an opaque or network-backed service.

| Rating | New card | Existing card |
| --- | --- | --- |
| Again | 1 minute, repetitions reset | 10% of the current interval, capped at 10 minutes |
| Hard | 6 hours | 1.2× current interval |
| Good | Configured default: 1 day | Current interval × ease factor |
| Easy | Configured default: 4 days | Current interval × ease factor × 1.3 |

The ease factor starts at `2.5`, decreases by `0.15` for Hard, increases by `0.15` for Easy, and stays between `1.3` and `4`. Intervals are stored in minutes and due timestamps are stored as Unix milliseconds. The algorithm is deterministic for a given card, rating, and timestamp.

## Card identity and synchronization

- Every `.md` file in the vault is indexed.
- A note is excluded when `#exclude` appears as a tag in frontmatter or as a standalone tag in the note body. Frontmatter accepts `tags: [exclude]`, `tags: [#exclude]`, or a string value.
- Excluded notes disappear from review but their scheduling records remain.
- Note content changes update eligibility without resetting scheduling.
- A vault rename event moves the existing scheduling record to the new path.
- Deleted notes are retained as excluded historical records. This avoids losing review history if a synced vault restores the file later.
- New notes start due immediately.

The scan is debounced after create/modify events. It reads notes one at a time to determine body tags and does not keep every note body in the index. The answer body is read only when its card is revealed.

## Persistence and sync safety

All scheduling data is stored in Obsidian’s plugin data store (`data.json` inside the plugin folder). The plugin never writes frontmatter, tags, or any other metadata to user notes.

Writes are serialized through a queue and snapshots are cloned before saving. Obsidian’s plugin data API is used instead of direct filesystem APIs, which keeps the plugin compatible with iOS and Android and lets Obsidian’s vault synchronization carry the data file with the plugin.

## Commands

- **Start spaced repetition review** — due cards, or future cards too when enabled in settings
- **Review due cards** — due cards only
- **Review all cards** — all eligible cards, including future cards
- **Review current note** — review the active Markdown note when it has been indexed

During review, reveal the answer, see the next interval for every rating, and choose Again, Hard, Good, or Easy. The view advances automatically. Keyboard shortcuts are Space/Enter to reveal and `1`–`4` for the four ratings. All controls are touch-sized and work without hover.

## Build

From the repository root:

```bash
pnpm install
pnpm --filter @workspace/obsidian-spaced-repetition run typecheck
pnpm --filter @workspace/obsidian-spaced-repetition run test
pnpm --filter @workspace/obsidian-spaced-repetition run build
```

The production build creates `main.js` in this directory. The installable plugin folder must contain:

```text
manifest.json
main.js
styles.css
```

## Install on Desktop

1. Build the plugin.
2. Create `.obsidian/plugins/spaced-repetition/` in the target vault.
3. Copy `manifest.json`, `main.js`, and `styles.css` into that folder.
4. In Obsidian, open **Settings → Community plugins**, enable community plugins if necessary, and enable **Spaced Repetition**.
5. Run **Start spaced repetition review** from the command palette.

## Install on Mobile

Copy the same three built files into the vault’s `.obsidian/plugins/spaced-repetition/` folder using a vault sync workflow that supports hidden files, or install the folder through the same plugin distribution method used for your vault. Enable the plugin in **Settings → Community plugins**.

No desktop-only APIs are used. The view uses safe-area padding, responsive controls, touch-friendly buttons, natural scrolling, and Obsidian’s own vault/workspace/data APIs. The plugin does not need a local server or an internet connection.

## Desktop and Mobile checklist

- [ ] Build succeeds with the commands above.
- [ ] The plugin loads without console errors on Desktop.
- [ ] The plugin loads without console errors on iOS and Android.
- [ ] A realistic vault indexes without blocking the UI for a noticeable period.
- [ ] A note with a body `#exclude` tag is omitted.
- [ ] A note with frontmatter `tags: [exclude]` is omitted.
- [ ] Removing `#exclude` makes the note eligible again without losing history.
- [ ] Renaming a note retains its interval and review count.
- [ ] Deleting a note removes it from review without throwing.
- [ ] A complete touch-only review session works in portrait and landscape.
- [ ] The data file persists after Obsidian is closed and reopened.
- [ ] Desktop/mobile vault synchronization retains scheduling data.
- [ ] Future cards can be reviewed through **Review all cards**.
- [ ] Markdown answers render links, embeds, formatting, and code blocks.
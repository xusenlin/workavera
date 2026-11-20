# Discover Product Requirements Document

[简体中文](./discover-prd.zh-CN.md)

> Implementation baseline: Workavera `0.2.0`, verified against commit `7d8d88d` on 2026-10-29. Discover shipped in `0.1.1`.

## 1. Purpose

Discover is a panel inside [Reading](./reading-prd.md) that fetches what the user's subscriptions are showing right now—RSS and Atom feeds and GitHub trending lists—so new links can be reviewed, summarized, and kept without leaving the workspace. It feeds the reading list rather than replacing any part of it: a candidate the user keeps becomes an ordinary reading item.

## 2. Goals

- Let each user keep private subscriptions to RSS or Atom feeds and to GitHub trending lists for a language and period.
- Start every new account with a few useful subscriptions.
- Fetch the selected subscriptions on demand and show their entries as candidates in one list.
- Show which candidates are already in the reading list.
- Summarize any candidate in a chosen language before deciding to keep it.
- Add a candidate to the reading list, with its summary, in one step.

## 3. Non-goals

- Background or scheduled fetching; Discover fetches only when the user asks. The [scheduled tasks proposal](../planned/scheduled-tasks-prd.md) covers that direction.
- Storing candidates on the server, or keeping a history of what was fetched.
- Notifications about new entries.
- Feeds behind authentication, and sources other than RSS, Atom, and GitHub trending.
- Assistant tools for Discover.

## 4. Data model

### `reading_sources`

| Field | Rule |
| --- | --- |
| `owner` | Required relation to the user; never changed. |
| `name` | Required display name, up to 100 characters. |
| `kind` | `rss` (an RSS or Atom feed) or `github_trending`. |
| `url` | Required for `rss`: an `http` or `https` feed URL. |
| `params` | For `github_trending`: a required `language` and a `since` period of `daily`, `weekly`, or `monthly`. |
| `enabled` | Disabled subscriptions are kept but not fetched. |
| `last_fetched_at`, `last_error` | Outcome of the most recent fetch. |

Subscriptions use PocketBase's own CRUD, with rules that limit every operation to the owner; a hook refuses an RSS subscription without a valid feed URL and a GitHub trending subscription without a language.

Every new account starts with four enabled subscriptions: weekly GitHub trending for Go, Rust, and TypeScript, and the Hacker News front page. Seeding is a convenience; if it fails, the account is still created.

## 5. Fetching and candidates

- Fetching reads the selected enabled subscriptions in parallel, with a 60-second limit for the whole request.
- A feed contributes up to 30 entries; trending lists contribute the repositories on the page with their description, language, total stars, and stars gained in the period.
- The panel shows at most 200 candidates, de-duplicated by URL.
- A subscription that fails does not empty the panel: its error is shown next to the candidates from the others and stored as `last_error`. A successful fetch clears it and records `last_fetched_at`.
- Trending repositories are ranked by the stars they gained in the period and listed above feed entries, which keep their own order.
- A candidate whose URL is already in the user's reading list is marked as such.
- Summarizing a candidate fetches its page and calls the user's default model, exactly like summarizing a reading item, in the language the user picks.
- Adding a candidate creates a reading item from its title and URL, with the summary and key points when they were generated.

## 6. User experience

- Discover opens from the sparkle button in the Reading sidebar, as a dialog with two tabs: **Candidates** and **Subscriptions**.
- **Candidates** shows the enabled subscriptions as chips to select, a **Fetch** button, and the resulting cards with their source, description, and date or star gain. Each card can be summarized and added to the reading list.
- **Subscriptions** lists every subscription with its kind and last result, and lets the user add, edit, enable, disable, and remove them. An RSS subscription asks for a feed URL; a GitHub trending subscription asks for a language and a period.

## 7. Permissions

- Subscriptions are private: only their owner can list, view, create, update, or delete them, and the owner cannot be changed.
- Fetching and summarizing go through authenticated routes and only read the caller's own subscriptions.
- Pages are fetched by the server with a `Workavera/1.0` user agent and size limits.

## 8. Acceptance criteria

1. A new account sees the four preset subscriptions.
2. A user can add, edit, disable, and remove their own subscriptions, and an invalid RSS or trending subscription is refused.
3. Fetching several subscriptions returns de-duplicated candidates, marks those already saved, and reports a broken feed without hiding the rest.
4. A candidate can be summarized and added, after which it is marked as in the reading list.
5. No other user can see or fetch someone else's subscriptions.

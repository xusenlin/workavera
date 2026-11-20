# Contacts Product Requirements Document

[简体中文](./contacts-prd.zh-CN.md)

> Implementation baseline: Workavera `0.2.0`, verified against commit `7d8d88d` on 2026-10-29.

## 1. Purpose

Contacts is Workavera's team directory. Every application user of an instance appears in it with the profile they maintain themselves—name, title, status, avatar, and contact details—so teammates can find each other, and the assistant can resolve a name to a person when assigning work or adding project members.

## 2. Goals

- List every user of the workspace, newest members first.
- Search by name, email, or title, and filter by status.
- Let each user keep a private list of favorite contacts shown above everyone else.
- Show a contact's full profile in a detail sheet.
- Let Chat search contacts with a projection that leaves out personal contact details.

## 3. Non-goals

- External contacts, companies, or a CRM; Contacts lists only users of the instance.
- Creating, editing, or removing other users from Contacts; accounts are managed by a superuser in the PocketBase dashboard, and each user edits their own profile.
- Groups, teams, or an organization chart.
- Messaging or calling from Contacts.
- Importing or exporting contacts.

## 4. Data model

### `users` (the fields Contacts reads)

| Field | Use |
| --- | --- |
| `name`, `title`, `bio` | Shown in the list and the detail sheet; edited by the user in Profile. |
| `email` | Shown when PocketBase exposes it to other users. |
| `phone` | Shown in the detail sheet only. |
| `status` | `online`, `away`, `busy`, or `offline` (the default). |
| `avatar` | Profile picture. |

Any signed-in user can list and view users; only a user can update their own record.

### `contact_favorites`

| Field | Rule |
| --- | --- |
| `owner` | The user who keeps the favorite; must be the signed-in user. |
| `contact` | The user marked as a favorite; cannot be the owner. |

Favorites are private to their owner, who can list, create, and delete them. They have no update rule: a favorite is added or removed, never edited.

## 5. User experience

- Contacts lives at `/contacts`. A search box filters by name, email, and title, and status chips narrow the list to one status.
- The list has two sections: **Favorites** and **All contacts**. Within each, the newest members come first.
- Each row shows the avatar, name, title, status, and email, with a star on favorites; its menu opens the profile and adds or removes the favorite.
- Selecting a contact opens a detail sheet with the full profile, including phone and bio.

## 6. Permissions and privacy

- Contacts shows only what users chose to put in their own profile.
- Favorites are visible only to the user who created them.
- The assistant's projection contains the ID, name, title, status, and avatar, never email, phone, or bio, because tool results are sent to the selected model provider.

## 7. Assistant tools

### `contacts_search`

Searches users by name or title and returns up to 20 matches with the non-sensitive projection above. Chat uses it to find a person before assigning a task, adding a project member, or answering who someone is.

The tool is also available to MCP clients through API keys; see the [MCP access PRD](./mcp-server-prd.md).

## 8. Known gaps

- Deactivated accounts still appear in Contacts and in `contacts_search` results. They should be hidden or marked once deactivation is surfaced in the product.

## 9. Acceptance criteria

1. A signed-in user sees every user of the instance in Contacts, newest members first.
2. Searching by name, email, or title, and filtering by status, narrow the list as expected.
3. A user can favorite and unfavorite another user, cannot favorite themselves, and never sees anyone else's favorites.
4. The detail sheet shows the contact's full profile.
5. `contacts_search` finds users by name or title and never returns email, phone, or bio.

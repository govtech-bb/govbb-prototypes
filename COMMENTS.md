# Review comments widget (`assets/govbb-comments.js`)

A drop-in select-to-comment tool for the alpha prototypes. Reviewers highlight text on a page and leave threaded comments; a side panel lists every thread with replies, resolve/reopen, and a "show resolved" toggle.

Ported from [`govtech-bb/self-employed-nis`](https://github.com/govtech-bb/self-employed-nis), where it runs on static content pages. It shares that deployment's Supabase project, so threads left here appear alongside those, keyed per page.

## Install

Add this before `</body>`, after the `GovBB.init(...)` script:

```html
<script src="../assets/govbb-comments.js" defer></script>
```

Currently enabled on: `prototypes/nhc-state-land.html`.

`defer` matters — the widget needs `GovBB.init()` to have run so it can read the current step.

## Step-form prototypes

The prototypes in this repo are single-URL, JS-rendered forms: `GovBB.render()` replaces the contents of `#app` on each step and the URL never changes. The widget accounts for this:

- **Comments are scoped per step.** The page key is `{path}#{stepId}` — for example `/govbb-prototypes/prototypes/nhc-state-land.html#land-use`. A comment left on "Land use" only appears on that step. Without this every step would share one thread list.
- **Highlights are rebuilt after each render.** `GovBB.render` is wrapped so the comment layer re-anchors once the new step is in the DOM, since `render()` discards the `<mark>` elements.

Both behaviours are inert on a plain static page with no `window.GovBB`, so the file stays usable as a general drop-in.

Debug from the console with `GovBBComments.pageId()` and `GovBBComments.refresh()`.

## Storage modes

Set these at the top of `assets/govbb-comments.js` in `COMMENTS_CONFIG`:

| Mode | Config | Shared between reviewers? |
|---|---|---|
| Local | both `supabase` and `apiBase` null | No — saved in each reviewer's own browser |
| **Supabase** (current) | `supabase: { url, anonKey }` | **Yes** — central |
| Custom API | `apiBase: "https://…"` | Yes, if you build the API below |

Comments are keyed per page by `pageId` (the URL path), so each page keeps its own set.

### If the server cannot be reached

Every store call reports failures instead of failing silently. If the Supabase
call fails — no connection, a paused project, an RLS policy that denies the anon
key — the panel shows a red banner with a **Try again** button rather than an
empty list, and a failed *write* leaves the reviewer's typed text in the box so
nothing is lost. Without this a blocked network looked identical to "no comments
yet", and the only clue was an uncaught promise rejection in the console.

The Comments button sits at `bottom:76px` so it clears the validation toggle from
`govbb-validation-toggle.js`, which is fixed to the same corner at a higher
`z-index` and otherwise covers it completely.

---

## Set up central storage with Supabase (recommended)

No server to build — Supabase gives you a database with an auto REST API the widget talks to directly.

### 1. Create a project
1. Go to **supabase.com** → sign in → **New project** (use the GovTech org account if you have one).
2. Pick a name, a strong database password, and a region close to Barbados. Wait for it to provision.

### 2. Create the table
Open **SQL Editor → New query**, paste this, and run it:

```sql
create table public.comments (
  id          text primary key,
  "pageId"    text not null,
  quote       text,
  prefix      text,
  suffix      text,
  author      text,
  "text"      text,
  "createdAt" bigint,
  resolved    boolean default false,
  replies     jsonb   default '[]'::jsonb
);

-- Allow the public anon key to read/write (fine for an internal review prototype).
alter table public.comments enable row level security;

create policy "anon read"   on public.comments for select using (true);
create policy "anon insert" on public.comments for insert with check (true);
create policy "anon update" on public.comments for update using (true) with check (true);
```

> The double-quoted column names (`"pageId"`, `"text"`, `"createdAt"`) must be kept exactly — they match the keys the widget sends.

### 3. Get your keys
**Project Settings → API**, copy:
- **Project URL** — e.g. `https://abcdxyz.supabase.co`
- **anon public** key — the long `eyJ…` string (the *anon* key, **not** the service_role key)

### 4. Point the widget at it
In `assets/govbb-comments.js`, set:

```js
var COMMENTS_CONFIG = {
  supabase: {
    url: "https://abcdxyz.supabase.co",
    anonKey: "eyJhbGciOi...your-anon-key..."
  },
  apiBase: null,
  pageId: location.pathname || "/",
  root: "#main"
};
```

Commit, redeploy (GitHub Pages), and comments now save centrally — every reviewer sees the same threads.

### Notes & cautions
- **CORS** works out of the box; Supabase's REST API accepts browser requests from any origin, so GitHub Pages is fine.
- **The anon key is public** (it ships in the page). With the permissive policies above, anyone who has the page can read and write comments. That's acceptable for an internal alpha review; before anything sensitive or public, tighten the policies (e.g. require Supabase Auth) and rotate the key.
- **Replies** use read-modify-write on a JSONB column. If two people reply to the *same* thread at the *exact* same second, one could overwrite the other. Fine at review volumes; if it matters later, move replies to their own table.
- **Anchoring**: a comment re-finds its highlighted quote by text on load. If the page wording changes after a comment is made, that highlight may not re-attach (the comment still shows in the panel). Resolve/close stale comments after big content edits.

---

## Custom REST API (alternative to Supabase)

If you'd rather run your own backend, set `apiBase` and implement:

```
GET    {apiBase}/comments?page={pageId}     -> [thread, ...]
POST   {apiBase}/comments                   body: thread     -> thread
POST   {apiBase}/comments/{id}/replies      body: reply      -> reply
PATCH  {apiBase}/comments/{id}              body: {resolved} -> thread
```

## Data shapes

```jsonc
// thread
{
  "id": "lq3k…",            // string id
  "pageId": "/what-you-get.html",
  "quote": "the highlighted text",
  "prefix": "…32 chars before…",   // for re-anchoring
  "suffix": "…32 chars after…",
  "author": "Amoge",
  "text": "the comment",
  "createdAt": 1716998400000,      // epoch ms (number)
  "resolved": false,
  "replies": [ /* reply objects */ ]
}

// reply
{ "id": "…", "author": "…", "text": "…", "createdAt": 1716998400000 }
```

## Before production
Remove the `<script src="../assets/govbb-comments.js">` tag (and `assets/govbb-comments.js`) from the pages — the comment tool is for the review/alpha stage only. `build-for-production` strips it as part of the alpha-to-beta step.

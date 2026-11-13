# Caught in PJs

A one-page site where friends vote on which partner in each couple catches the other. It also has a catches leaderboard, random suggested matchups, and an "Add person" button that crops a photo into a circle.

Anyone with the link can vote, add people and add matchups. They don't need to sign in. Each browser gets one vote per matchup. Only someone with the organizer code can record who caught who.

## Setup (about 10 minutes)

### 1. Create the database (Supabase, free)

1. Sign up at supabase.com and create a new project. Any name and region works.
2. Open **SQL Editor**, paste in all of `supabase/schema.sql`, and change `change-me-to-a-secret` on the last line to your own organizer code. Then click **Run**.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. Paste both into `config.js` and commit.

The anon key is designed to be public. The rules in `schema.sql` limit what it can do.

### 2. Put it online (Netlify, free)

1. Sign up at netlify.com and choose **Add new site → Import an existing project → GitHub**, then pick this repo.
2. Leave the build command empty and set the publish directory to `/`. Then deploy.
3. Share the `*.netlify.app` link with the group. You can rename it under **Site configuration → Change site name**.

Netlify works with a private repo, so the photos aren't public on GitHub. Vercel works the same way.

## Running the event

- Tap **Organizer** at the bottom of the page and enter your code. Each card then shows "___ caught" buttons. Tap one to record the result, which updates the leaderboard. Tap "Undo result" to fix a mistake.
- Votes refresh every few seconds for everyone.

## Files

- `index.html`: the page and its styles
- `app.js`: voting, leaderboard, matchups, add person, organizer tools
- `config.js`: your Supabase URL and anon key
- `supabase/schema.sql`: tables, access rules, starting players and couples
- `photos/`: starting players' photos, cropped to faces

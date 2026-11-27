# Caught in PJs

A one-page site where friends vote on which partner in each couple catches the other. It also has a catches leaderboard, random girl vs guy suggested matchups, a "Proposed challenge" picker at the bottom for any two open players, and an "Add person" button that crops a photo into a circle.

Anyone with the link can vote, add people and add matchups. They don't need to sign in. Each browser gets one vote per matchup. Only someone with the organizer code can record who caught who.

Live at https://kristinejoy0419.github.io/Caught/ (GitHub Pages, published from `main` by `.github/workflows/pages.yml`).

## Setup (about 5 minutes)

Everything is stored in a Google Sheet through a small Apps Script.

1. Make a new Google Sheet (any name, e.g. "Caught in PJs"). Open **Extensions > Apps Script**, delete what's there, and paste in all of `apps-script/Code.gs`. Click **Save**.
2. Click **Deploy > New deployment**, choose type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, and click **Deploy**. Approve the permissions.
3. Copy the **Web app URL** into `config.js` as `sheetUrl` and commit.

The first time the page loads, the script adds **Players**, **Matchups**, **Votes** and **Settings** tabs and fills in the starting players and couples.

After any change to `Code.gs`: **Deploy > Manage deployments**, click the pencil, set **Version: New version**, and click **Deploy**. The URL stays the same.

## Running the event

- The organizer code is on the Sheet's **Settings** tab. Tap **Organizer** at the bottom of the page and enter it. Each card then shows "___ caught" buttons. Tap one to record the result, which updates the leaderboard. Tap "Undo result" to fix a mistake. You can also type the winner's name in the **Caught by** column on the Matchups tab.
- The **Girl or guy** column on the Players tab sets each person's vote button: girls get "escapes", guys get "catches". The "Add person" form asks for it; the starting five girls (Kristine, Theresa, Jas, Kat, Liz) are already set even if their cell is blank.
- "Add person" has a **One person / A couple** switch. Pick "A couple" to add two people at once. Each gets their own row on the Players tab, and their matchup goes on the Matchups tab. No Apps Script redeploy is needed for this.
- To take someone off the board or remove a matchup, delete its row in the Sheet.
- Votes refresh every few seconds for everyone.

## Files

- `index.html`: the page and its styles
- `app.js`: voting, leaderboard, matchups, add person, organizer tools
- `config.js`: the Apps Script web app URL
- `apps-script/Code.gs`: the Google Sheet backend, with the starting players and couples
- `photos/`: starting players' photos, cropped to faces

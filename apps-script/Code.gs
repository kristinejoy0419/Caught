/**
 * Caught in PJs backend: the Google Apps Script behind https://kristinejoy0419.github.io/Caught/
 *
 * Setup (once):
 *  1. Make a new Google Sheet, open Extensions > Apps Script, and paste in this whole file.
 *  2. Deploy > New deployment > type Web app, Execute as: Me, Who has access: Anyone > Deploy,
 *     and approve the permissions. Copy the Web app URL into config.js as sheetUrl.
 *  After any later change: Deploy > Manage deployments > pencil > Version: New version > Deploy.
 *
 * The first time the page loads, this creates four tabs and fills in the starting players
 * and matchups:
 *  - Players: one row per person. "Open" is Yes or No (open to new matchups). Delete a row to
 *    take someone off the board. "Girl or guy": a girl's vote button says "escapes" instead of
 *    "catches". Photos people upload go to a "Caught in PJs photos" Drive
 *    folder, shared view-only by link so the page can show them.
 *  - Matchups: one row per pair. "Caught by" holds the winner's name. The organizer fills it
 *    from the page, or you can type it here. Delete a row to remove a matchup.
 *  - Votes: one row per phone per matchup.
 *  - Settings: the organizer code that unlocks recording results on the page.
 */
const PHOTO_FOLDER = "Caught in PJs photos";
const PHOTO_BASE = "https://kristinejoy0419.github.io/Caught/photos/";
const MAX_PLAYERS = 150;
const MAX_MATCHUPS = 300;
const TABS = {
  Players: ["Id", "Name", "Photo", "Added", "Open", "Girl or guy"],
  Matchups: ["Id", "A", "B", "Added", "Caught by"],
  Votes: ["Voter", "Matchup", "Pick", "Updated"],
};
// The starting players and couples.
const SEED_PLAYERS = [["daniel", "Daniel"], ["kristine", "Kristine"], ["theresa", "Theresa"], ["jg", "JG"],
  ["jas", "Jas"], ["mike", "Mike"], ["panha", "Panha"], ["kat", "Kat"], ["dan", "Dan"], ["liz", "Liz"], ["adam", "Adam"]];
const SEED_MATCHUPS = [["m1", "daniel", "kristine"], ["m2", "theresa", "jg"], ["m3", "jas", "mike"],
  ["m4", "panha", "kat"], ["m5", "dan", "liz"]];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
const clip_ = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function tab_(name) {
  const cols = TABS[name];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (sheet) {
    if (sheet.getLastColumn() < cols.length) sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight("bold");
    return sheet;
  }
  sheet = ss.insertSheet(name);
  sheet.appendRow(cols);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, cols.length).setFontWeight("bold");
  const now = new Date();
  if (name === "Players") {
    sheet.getRange(2, 1, SEED_PLAYERS.length, 5)
      .setValues(SEED_PLAYERS.map(([id, n]) => [id, n, PHOTO_BASE + id + ".jpg", now, "Yes"]));
  } else if (name === "Matchups") {
    sheet.getRange(2, 1, SEED_MATCHUPS.length, 5).setValues(SEED_MATCHUPS.map(([id, a, b]) => [id, a, b, now, ""]));
  }
  const blank = ss.getSheetByName("Sheet1");
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  return sheet;
}

function rows_(name) {
  const sheet = tab_(name);
  return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, TABS[name].length).getValues();
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** The organizer code: made once, kept in a script property, and shown on the Settings tab. */
function code_() {
  const props = PropertiesService.getScriptProperties();
  let code = props.getProperty("ORGANIZER_CODE");
  if (!code) {
    code = "pjs-" + Utilities.getUuid().slice(0, 6);
    props.setProperty("ORGANIZER_CODE", code);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName("Settings")) {
    const s = ss.insertSheet("Settings");
    s.getRange(1, 1, 2, 2).setValues([["Organizer code", code],
      ["How to use it", "On the Caught in PJs page, tap Organizer at the bottom, enter this code, then use the buttons on each card to record who caught who."]]);
    s.getRange(1, 1, 2, 1).setFontWeight("bold");
  }
  return code;
}
const codeOk_ = c => Boolean(c) && clip_(c, 60) === code_();

// ---------- Web app ----------

function doGet(e) {
  return json_(state_(clip_(e && e.parameter && e.parameter.voter, 60)));
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "Bad request" }); }
  if (body.website) return json_({ ok: true }); // honeypot: quietly ignore bots
  const voter = clip_(body.voter, 60);
  const handlers = { vote: vote_, join: join_, matchup: matchup_, open: open_, result: result_ };
  if (body.action === "check") return json_({ ok: true, valid: codeOk_(body.code) });
  const fn = handlers[body.action];
  if (!fn) return json_({ ok: false, error: "Unknown action" });
  const res = fn(body);
  return json_(res && res.ok === false ? res : state_(voter));
}

function state_(voter) {
  code_();
  const players = rows_("Players").filter(r => r[0] && r[1]).map(r => ({
    id: String(r[0]), name: String(r[1]).slice(0, 30), photo: /^https:\/\//.test(r[2]) ? String(r[2]) : "",
    open: String(r[4]).trim().toLowerCase() !== "no", girl: /^(girl|f|female|woman)$/i.test(String(r[5] || "").trim()),
  }));
  const byName = {};
  players.forEach(p => { byName[p.name.toLowerCase()] = p.id; byName[p.id.toLowerCase()] = p.id; });
  const tally = {}, mine = {};
  rows_("Votes").forEach(([v, m, pick]) => {
    if (pick !== "a" && pick !== "b") return;
    tally[m] = tally[m] || { a: 0, b: 0 };
    tally[m][pick]++;
    if (voter && String(v) === voter) mine[m] = pick;
  });
  const matchups = rows_("Matchups").filter(r => r[0] && r[1] && r[2]).map(r => {
    const id = String(r[0]), a = String(r[1]), b = String(r[2]);
    const said = byName[String(r[4] || "").trim().toLowerCase()] || "";
    return { id, a, b, votes: tally[id] || { a: 0, b: 0 }, catcher: said === a || said === b ? said : "" };
  });
  return { ok: true, players, matchups, mine };
}

function vote_(body) {
  const voter = clip_(body.voter, 60), matchup = clip_(body.matchup, 40);
  const pick = body.pick === "a" || body.pick === "b" ? body.pick : "";
  if (!/^[\w-]{8,60}$/.test(voter) || !matchup) return { ok: false, error: "Bad vote" };
  return withLock_(() => {
    if (!rows_("Matchups").some(r => String(r[0]) === matchup)) return { ok: false, error: "That matchup is gone" };
    const i = rows_("Votes").findIndex(r => String(r[0]) === voter && String(r[1]) === matchup);
    if (i >= 0) tab_("Votes").getRange(i + 2, 3, 1, 2).setValues([[pick, new Date()]]);
    else if (pick) tab_("Votes").appendRow([voter, matchup, pick, new Date()]);
  });
}

function join_(body) {
  const name = clip_(body.name, 30);
  if (body.girl !== true && body.girl !== false) return { ok: false, error: "Pick girl or guy" };
  if (!name) return { ok: false, error: "Enter a name first" };
  if (rows_("Players").some(r => String(r[1]).toLowerCase() === name.toLowerCase())) return { ok: false, error: name + " is already playing" };
  let photo = "";
  if (body.photo && body.photo.data) {
    if (!/^image\/(jpeg|png|webp)$/.test(String(body.photo.type))) return { ok: false, error: "Use a JPG or PNG photo" };
    const bytes = Utilities.base64Decode(body.photo.data);
    if (bytes.length > 3 * 1024 * 1024) return { ok: false, error: "That photo is too big" };
    const found = DriveApp.getFoldersByName(PHOTO_FOLDER);
    const folder = found.hasNext() ? found.next() : DriveApp.createFolder(PHOTO_FOLDER);
    const file = folder.createFile(Utilities.newBlob(bytes, body.photo.type, name + ".jpg"));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) { /* page shows initials instead */ }
    photo = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w400";
  }
  return withLock_(() => {
    const rows = rows_("Players");
    if (rows.length >= MAX_PLAYERS) return { ok: false, error: "The board is full" };
    if (rows.some(r => String(r[1]).toLowerCase() === name.toLowerCase())) return { ok: false, error: name + " is already playing" };
    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "p") + "-" + Utilities.getUuid().slice(0, 6);
    tab_("Players").appendRow([id, name, photo, new Date(), "Yes", body.girl ? "Girl" : "Guy"]);
  });
}

function matchup_(body) {
  const a = clip_(body.a, 40), b = clip_(body.b, 40);
  if (!a || !b || a === b) return { ok: false, error: "Pick two different people" };
  return withLock_(() => {
    const ids = rows_("Players").map(r => String(r[0]));
    if (ids.indexOf(a) < 0 || ids.indexOf(b) < 0) return { ok: false, error: "Someone in that pair isn't playing" };
    const key = [a, b].sort().join("|");
    const rows = rows_("Matchups");
    if (rows.some(r => [String(r[1]), String(r[2])].sort().join("|") === key)) return { ok: false, error: "That matchup is already up" };
    if (rows.length >= MAX_MATCHUPS) return { ok: false, error: "The board is full" };
    tab_("Matchups").appendRow(["m" + Date.now(), a, b, new Date(), ""]);
  });
}

/** Anyone can mark a player open or not open for new matchups. */
function open_(body) {
  const id = clip_(body.id, 40);
  return withLock_(() => {
    const i = rows_("Players").findIndex(r => String(r[0]) === id);
    if (i < 0) return { ok: false, error: "That player is gone" };
    tab_("Players").getRange(i + 2, 5).setValue(body.open === false ? "No" : "Yes");
  });
}

/** Organizer only: record (or clear, with an empty catcher) who caught who. */
function result_(body) {
  if (!codeOk_(body.code)) return { ok: false, error: "That code didn't match" };
  const matchup = clip_(body.matchup, 40), catcher = clip_(body.catcher, 40);
  return withLock_(() => {
    const rows = rows_("Matchups");
    const i = rows.findIndex(r => String(r[0]) === matchup);
    if (i < 0) return { ok: false, error: "That matchup is gone" };
    if (catcher && catcher !== String(rows[i][1]) && catcher !== String(rows[i][2])) return { ok: false, error: "Pick someone in that matchup" };
    const p = catcher ? rows_("Players").find(r => String(r[0]) === catcher) : null;
    tab_("Matchups").getRange(i + 2, 5).setValue(p ? p[1] : "");
  });
}

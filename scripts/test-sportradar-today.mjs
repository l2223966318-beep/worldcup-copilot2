import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const outDir = join(tmpdir(), "worldcup-copilot-sportradar-today-test");
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "lib/sports"), { recursive: true });
mkdirSync(join(outDir, "lib/time"), { recursive: true });

const timeSource = readFileSync(new URL("../lib/time/beijingTime.ts", import.meta.url), "utf8");
writeFileSync(
  join(outDir, "lib/time/beijingTime.mjs"),
  ts.transpileModule(timeSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  "utf8"
);

writeFileSync(
  join(outDir, "lib/sports/normalizers.mjs"),
  "export function createPayload(sourceStatus, data, message) { return { sourceStatus, data, lastUpdated: new Date().toISOString(), ...(message ? { message } : {}) }; }\n",
  "utf8"
);

const clientSource = readFileSync(new URL("../lib/sports/sportradarClient.ts", import.meta.url), "utf8")
  .replaceAll("@/lib/time/beijingTime", "../time/beijingTime.mjs")
  .replaceAll("@/lib/sports/normalizers", "./normalizers.mjs");
writeFileSync(
  join(outDir, "lib/sports/sportradarClient.mjs"),
  ts.transpileModule(clientSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  "utf8"
);

process.env.SPORTRADAR_API_KEY = "test-key";
process.env.SPORTRADAR_ACCESS_LEVEL = "trial";
process.env.SPORTRADAR_LANGUAGE_CODE = "en";
process.env.SPORTRADAR_WORLD_CUP_COMPETITION_ID = "sr:competition:16";
process.env.SPORTRADAR_WORLD_CUP_SEASON_ID = "sr:season:101177";
process.env.SPORTRADAR_REQUEST_INTERVAL_MS = "15";

const requests = [];
globalThis.fetch = async (input) => {
  requests.push(String(input));
  return new Response(JSON.stringify({
    generated_at: "2026-06-29T00:00:00Z",
    schedules: [
      {
        sport_event: {
          id: "sr:sport_event:1",
          start_time: "2026-06-28T19:00:00Z",
          sport_event_context: {
            competition: { id: "sr:competition:16", name: "FIFA World Cup" },
            season: { id: "sr:season:101177", name: "World Cup 2026", year: "2026" }
          },
          competitors: [
            { name: "South Africa", qualifier: "home" },
            { name: "Canada", qualifier: "away" }
          ]
        },
        sport_event_status: {
          status: "closed",
          home_score: 0,
          away_score: 1
        }
      }
    ]
  }), { status: 200, headers: { "content-type": "application/json" } });
};

const client = await import(
  `file:///${join(outDir, "lib/sports/sportradarClient.mjs").replaceAll("\\", "/")}`
);
const payload = await client.getSportradarWorldCupToday("2026-06-29");

assert.equal(requests.length, 1, "today loader should avoid bursting three Sportradar requests");
assert.match(requests[0], /seasons\/sr%3Aseason%3A101177\/schedules\.json/);
assert.equal(payload.sourceStatus, "live");
assert.equal(payload.data.length, 1);
assert.equal(payload.data[0].source.provider, "sportradar");

const event = {
  id: "sr:sport_event:2", start_time: "2026-06-28T19:00:00Z",
  sport_event_context: {
    competition: { id: "sr:competition:16", name: "FIFA World Cup" },
    season: { id: "sr:season:101177", year: "2026" },
  },
  competitors: [{ name: "Argentina", qualifier: "home" }, { name: "France", qualifier: "away" }],
};
let status = { status: "closed", match_status: "after_penalties", home_score: 3, away_score: 3 };
globalThis.fetch = async input => {
  requests.push(String(input));
  return Response.json({
    schedules: [
      { sport_event: event, sport_event_status: status },
      { sport_event: { ...event, id: "sr:sport_event:wrong-season", sport_event_context: { ...event.sport_event_context, season: { id: "sr:season:2022" } } } },
    ],
    sport_event: event, sport_event_status: status,
    timeline: [{ type: "score_change", match_time: 115, team: "home", player: { name: "Messi" } }],
  });
};
let fixtures = await client.getSportradarWorldCupFixtures();
assert.equal(fixtures.data[0].status, "finished", "closed penalty shootout is finished, not live");
assert.equal(fixtures.data.length, 1, "competition match must not admit a different configured season");
status = { status: "postponed" };
fixtures = await client.getSportradarWorldCupFixtures();
assert.equal(fixtures.data[0].status, "postponed");
await client.getSportradarWorldCupMatch(event.id);
assert.ok(requests.some(url => url.includes("/soccer/trial/v4/en/sport_events/") && url.includes("/timeline.json")), "Soccer subscription must use the Soccer timeline, not Soccer Extended");
globalThis.fetch = async () => new Response("secret-test-key", { status: 401 });
await assert.rejects(client.getSportradarWorldCupFixtures(), error => !error.message.includes("secret-test-key"));
const starts = [];
globalThis.fetch = async () => {
  starts.push(Date.now());
  return Response.json({ schedules: [{ sport_event: event }] });
};
await Promise.all([client.getSportradarWorldCupFixtures(), client.getSportradarWorldCupFixtures(), client.getSportradarWorldCupFixtures()]);
assert.ok(starts[1] - starts[0] >= 10 && starts[2] - starts[1] >= 10, "concurrent provider requests must be spaced out");
globalThis.fetch = async () => Response.json({ unexpected: [] });
await assert.rejects(client.getSportradarWorldCupToday("2026-06-29"), /schedule/i, "invalid schema is not a successful empty day");
console.log("Sportradar: schedule schema, Beijing date, closed penalties, postponed, season scope and standard timeline passed.");

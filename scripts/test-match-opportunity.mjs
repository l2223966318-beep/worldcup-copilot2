import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const dashboard = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const detailPath = ["../app/matches/[id]/page.tsx", "../app/matches/page.tsx"]
  .find(path => existsSync(new URL(path, import.meta.url)));
const detail = readFileSync(new URL(detailPath, import.meta.url), "utf8");
assert.doesNotMatch(dashboard, /function getOpportunityProfile\(/, "the list must use the shared rating policy");
assert.doesNotMatch(detail, /taskPriority|const priority = scores\.heat/, "detail must not assign its own grade from topic dimensions");
assert.match(detail, /getFixtureOpportunityProfile\(fixturesPayload\?\.data, fixtureId\)/);
assert.match(detail, /cacheKey: "worldcup\.fixtures\.season"/);
assert.match(detail, /opportunity=\{opportunity\}/);
assert.match(detail, /评分 \{opportunity\.score\}/);
assert.match(detail, /待评分/);

const source = readFileSync(new URL("../lib/services/matchOpportunity.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { getOpportunityProfile, getFixtureOpportunityProfile } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const now = Date.parse("2026-10-04T00:00:00+08:00");
const fixture = {
  id: "france-spain", sportType: "football", competition: "FIFA World Cup", season: 2026,
  round: "semi_final", kickoffTime: "2026-07-14T19:00:00Z", status: "finished", statusText: "Ended",
  homeTeam: { name: "France" }, awayTeam: { name: "Spain" },
  score: { home: 0, away: 2, display: "0-2" }, venue: {}, events: [],
  statistics: [{ team: "France", values: [{ type: "Goals", value: 0 }] }],
  source: { provider: "sportradar", league: 1, season: 2026 }, lastUpdated: "test"
};
const listProfile = getOpportunityProfile(fixture, now);
assert.equal(listProfile.grade, "B");
assert.equal(listProfile.score, 69);
assert.deepEqual(getFixtureOpportunityProfile([fixture], fixture.id, now), listProfile,
  "list and detail must show the exact same profile for the screenshot match");
const detailOnlyData = {
  ...fixture, id: "another-match",
  events: Array.from({ length: 5 }, () => ({ type: "penalty", detail: "goal", minute: 80, team: "Spain" })),
  statistics: [{ team: "France", values: [{ type: "Ball Possession", value: "60%" }] }]
};
assert.deepEqual(getFixtureOpportunityProfile([detailOnlyData, fixture], fixture.id, now), listProfile,
  "detail coverage and other matches must not replace the fixture's rating");
assert.equal(getFixtureOpportunityProfile(undefined, fixture.id, now), undefined);
assert.equal(getFixtureOpportunityProfile([detailOnlyData], fixture.id, now), undefined,
  "missing fixture must not silently use another match's rating");
assert.equal(getOpportunityProfile({ ...fixture, score: { home: 0, away: 1, display: "0-1" } }, now).grade, "A");
assert.equal(getOpportunityProfile({ ...fixture, status: "live" }, now).grade, "S");
assert.equal(getOpportunityProfile({ ...fixture, round: "group" }, now).score, 55);
assert.equal(getOpportunityProfile({ ...fixture, round: "group", status: "scheduled", score: { home: null, away: null, display: "vs" }, kickoffTime: "2026-10-05T12:00:00+08:00" }, now).grade, "C");
assert.ok(getOpportunityProfile({ ...detailOnlyData, status: "live" }, now).score <= 99);
console.log("match opportunity: shared fixture rating, B/69 regression, boundaries and pending state passed");

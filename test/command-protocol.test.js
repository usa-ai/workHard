import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs, normalizeActionName } from "../src/command-protocol.js";

test("normalizeActionName maps open to start and keeps search", () => {
  assert.equal(normalizeActionName("open"), "start");
  assert.equal(normalizeActionName("search"), "search");
});

test("parseCliArgs keeps trailing arguments for search", () => {
  const parsed = parseCliArgs(["node", "work", "search", "天气预报"]);
  assert.deepEqual(parsed, { action: "search", args: ["天气预报"] });
});

test("parseCliArgs maps pause to pause action", () => {
  const parsed = parseCliArgs(["node", "work", "pause"]);
  assert.deepEqual(parsed, { action: "pause", args: [] });
});

test("parseCliArgs maps favorite aliases", () => {
  const parsed1 = parseCliArgs(["node", "work", "favorite"]);
  assert.deepEqual(parsed1, { action: "favorite", args: [] });
  const parsed2 = parseCliArgs(["node", "work", "fav"]);
  assert.deepEqual(parsed2, { action: "favorite", args: [] });
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const mainNavigationClass = appSource.match(
  /<nav\s+className="([^"]+)"\s+aria-label="Main navigation"/,
)?.[1];

test("top-level navigation hides scrollbar chrome without disabling horizontal access", () => {
  assert.ok(mainNavigationClass, "Main navigation class list was not found");
  assert.match(mainNavigationClass, /\boverflow-x-auto\b/);
  assert.match(mainNavigationClass, /\[scrollbar-width:none\]/);
  assert.match(mainNavigationClass, /\[&::-webkit-scrollbar\]:hidden/);
  assert.match(mainNavigationClass, /\blg:overflow-visible\b/);
  assert.doesNotMatch(mainNavigationClass, /\boverflow-x-hidden\b|\boverflow-hidden\b/);
});

test("ShineOn uses the shared typed navigation path and remains forkable", () => {
  assert.match(appSource, /const SHINEON_URL = import\.meta\.env\.VITE_SHINEON_URL \?\?/);
  assert.match(appSource, /href: SHINEON_URL/);
  assert.match(appSource, /return href \? \(/);
  assert.equal(appSource.match(/rounded-xl px-3\.5 py-2\.5 text-left text-sm font-medium/g)?.length, 1);
});

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

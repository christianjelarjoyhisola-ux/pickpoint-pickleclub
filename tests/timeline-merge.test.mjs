import assert from "node:assert/strict";
import test from "node:test";
import {mergeTimelineEntries} from "../app/manage/timeline-merge.ts";

const entry = (item, groupKey, column, start, end) => ({item, groupKey, column, start, end});

test("back-to-back hours on one court become one block", () => {
  const blocks = mergeTimelineEntries([entry("a", "ana", 0, 300, 360), entry("b", "ana", 0, 360, 420)]);
  assert.equal(blocks.length, 1);
  assert.deepEqual({column: blocks[0].column, span: blocks[0].span, start: blocks[0].start, end: blocks[0].end, items: blocks[0].items}, {column: 0, span: 1, start: 300, end: 420, items: ["a", "b"]});
});

test("same hours on neighbouring courts become one wide block", () => {
  const blocks = mergeTimelineEntries([entry("a", "ana", 0, 300, 420), entry("a", "ana", 1, 300, 420)]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].span, 2);
  assert.deepEqual(blocks[0].items, ["a"]);
});

test("different players and non-adjacent courts stay separate", () => {
  const blocks = mergeTimelineEntries([
    entry("a", "ana", 0, 300, 360), entry("b", "ben", 1, 300, 360), entry("c", "ana", 2, 300, 360),
  ]);
  assert.equal(blocks.length, 3);
});

test("uneven ranges across courts are not stretched into one rectangle", () => {
  const blocks = mergeTimelineEntries([entry("a", "ana", 0, 300, 420), entry("a", "ana", 1, 360, 420)]);
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every(block => block.span === 1));
});

test("gaps between hours keep separate blocks", () => {
  const blocks = mergeTimelineEntries([entry("a", "ana", 0, 300, 360), entry("b", "ana", 0, 420, 480)]);
  assert.equal(blocks.length, 2);
});

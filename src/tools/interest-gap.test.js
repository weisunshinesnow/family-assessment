import assert from "node:assert/strict";
import test from "node:test";
import { formatYuan, interestGap, interestGapCopy } from "./interest-gap.js";

test("对比利率更高时，文案为多获得", () => {
  const gap = interestGap("500000", "0.95", "3");
  const copy = interestGapCopy(gap.annualGap);
  assert.equal(gap.status, "ok");
  assert.equal(gap.currentAnnual, 4750);
  assert.equal(gap.compareAnnual, 15000);
  assert.equal(gap.annualGap, 10250);
  assert.equal(gap.cumulativeGap, 51250);
  assert.equal(copy.annual, "每年多获得");
  assert.equal(copy.total, "五年累计多获得");
  assert.equal(formatYuan(gap.annualGap), "10,250.00 元");
  assert.equal(`${copy.annual}${formatYuan(gap.annualGap)}`, "每年多获得10,250.00 元");
});

test("对比利率更低时，文案为少获得", () => {
  const gap = interestGap("500000", "3", "0.95");
  const copy = interestGapCopy(gap.annualGap);
  assert.equal(gap.annualGap, -10250);
  assert.equal(copy.annual, "每年少获得");
  assert.equal(copy.total, "五年累计少获得");
  assert.equal(`${copy.annual}${formatYuan(gap.annualGap)}`, "每年少获得10,250.00 元");
});

test("两种利率相同时，不出现多获得或少获得", () => {
  const gap = interestGap("500000", "0.95", "0.95");
  const copy = interestGapCopy(gap.annualGap);
  assert.equal(gap.annualGap, 0);
  assert.equal(gap.cumulativeGap, 0);
  assert.equal(copy.annual, "每年利息相同");
  assert.equal(copy.total, "五年累计没有差额");
  assert.equal(copy.annual.includes("多获得"), false);
  assert.equal(copy.annual.includes("少获得"), false);
  assert.equal(copy.total.includes("多获得"), false);
  assert.equal(copy.total.includes("少获得"), false);
});

import test from "node:test";
import assert from "node:assert/strict";

import { demoSnapshot, demoSnapshots, demoHistory } from "../assets/js/demo.js";

test("demo snapshots are synthetic and stable", () => {
  const now = 1762483200000;
  const first = demoSnapshot(now);
  assert.equal(first.source, "demo");
  assert.equal(first.ports.length, 5);
  assert.equal(first.device.psn, "CP02-DEMO-0001");
  assert.match(first.host, /demo-1\.local/);
  assert.equal(first.ports[0].name, "A");
  assert.equal(first.ports[1].name, "C1");
  assert.ok(first.totals.powerW > 0);
});

test("demoSnapshots creates N distinct devices", () => {
  const now = 1762483200000;
  const two = demoSnapshots(now, 2);
  assert.equal(two.length, 2);
  assert.notEqual(two[0].host, two[1].host);
  assert.notEqual(two[0].device.psn, two[1].device.psn);
  for (const snap of two) {
    assert.equal(snap.ports.length, 5);
    assert.equal(snap.source, "demo");
  }
});

test("demo history can be generated per device slot", () => {
  const now = 1762483200000;
  const h0 = demoHistory(now, 3, { index: 0 });
  const h1 = demoHistory(now, 3, { index: 1 });
  assert.equal(h0.ports.length, 5);
  assert.equal(h1.ports[0].samples.length, 3);
  assert.match(h1.host, /demo-2\.local/);
  assert.notDeepEqual(
    h0.ports[1].samples.map((s) => s.powerW),
    h1.ports[1].samples.map((s) => s.powerW),
  );
});

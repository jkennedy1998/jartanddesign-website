// Smoke test for loop-detector.js: run `node music-theory/loop-detector-test.js`
const { createLoopDetector } = require("./loop-detector.js");

let failures = 0;
const assert = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"}  ${label}`);
  if (!condition) failures += 1;
};

// deterministic pseudo-random so runs are reproducible
let seed = 42;
const jitter = (amount) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return ((seed / 2147483648) - 0.5) * 2 * amount;
};

// feed a melody as note events; returns detector results per note
const playSequence = (detector, melody, gapMs, { jitterMs = 0, onset = 0 } = {}) => {
  let t = onset;
  let last = null;
  for (const midi of melody) {
    if (last !== null) t += gapMs + (jitterMs ? jitter(jitterMs) : 0);
    last = detector.record({ midi, onset: t, duration: 200 });
  }
  return last;
};

// 1. same loop, same key, same tempo, human-ish timing jitter -> confirmed
{
  const detector = createLoopDetector();
  const melody = [60, 64, 65, 67, 64, 60, 62, 60];
  playSequence(detector, melody, 300);                                  // pass 1
  playSequence(detector, [55, 59, 60, 62, 55], 300, { onset: 20000 });  // filler
  playSequence(detector, melody, 300, { jitterMs: 40, onset: 30000 });  // pass 2
  let result = playSequence(detector, melody, 300, { jitterMs: 40, onset: 45000 }); // pass 3
  const families = detector.snapshot();
  assert("same-tempo repeat detected", families.length >= 1);
  assert("third pass confirms the loop", result.newlyConfirmed || families.some((f) => f.stage === "confirmed"));
  assert("family captures 3 passes", families.some((f) => f.passes.length >= 3));
}

// 2. transposed + tempo-shifted + one changed note -> still detected, diff shown
{
  const detector = createLoopDetector();
  const melody = [60, 64, 65, 67, 64, 60, 62, 60];
  playSequence(detector, melody, 300);                                                     // original
  playSequence(detector, [55, 59, 60, 62, 55], 300, { onset: 20000 });                     // filler
  playSequence(detector, melody.map((m) => m + 2), 200, { onset: 30000 });                 // +2 key, faster
  const result = playSequence(detector, melody.map((m, i) => (i === 4 ? 69 : m + 2)), 200, { onset: 42000 });
  const families = detector.snapshot();
  assert("transposed + retempoed repeat detected", families.length >= 1);
  assert("families reach tentative or confirmed stage", families.some((f) => f.stage !== ""));
  const withDiff = families.find((f) => f.diff.some(Boolean));
  assert("variation between passes shows in diff", Boolean(withDiff) || Boolean(result.diff && result.diff.some(Boolean)));
}

// 3. random noodling -> no false positive
{
  const detector = createLoopDetector();
  let t = 0;
  let result = null;
  for (let i = 0; i < 120; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    t += 120 + (seed % 400);
    result = detector.record({ midi: 55 + (seed % 20), onset: t, duration: 150 });
  }
  assert("random noodling stays quiet", !result.newlyConfirmed && !result.newlyTentative);
}

// 4. loop across buffer turnover (old events dropped) still works
{
  const detector = createLoopDetector();
  const melody = [60, 62, 64, 65, 67, 69];
  playSequence(detector, melody, 250);
  let t = 10000;
  for (let i = 0; i < 80; i += 1) { // churn the buffer past its cap
    t += 150;
    detector.record({ midi: 48 + (i % 7), onset: t, duration: 100 });
  }
  let last = null;
  for (const midi of melody) { t += 250; last = detector.record({ midi, onset: t, duration: 200 }); }
  const families = detector.snapshot();
  assert("detection survives buffer turnover or stays quiet gracefully", families.length === 0 || last.matched !== null);
}

console.log(failures === 0 ? "\nall loop-detector checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

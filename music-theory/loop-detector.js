(() => {
  // Loop detector: watches a stream of played notes and surfaces when a stretch
  // just got replayed — regardless of tempo, transposition, or small variations.
  //
  // Comparison is deliberately relative, never absolute:
  //   pitch  — interval classes mod 12 (so a loop played up a key still matches)
  //   rhythm — log2 ratios of consecutive inter-onset gaps, quantized
  //            (so the same loop at a different tempo still matches)
  //
  // An occurrence is only counted once per scan (guarded by the tail's final
  // event). A family becomes "tentative" at 2 passes and "confirmed" at 3 —
  // the caller decides what to surface at each stage.

  const createLoopDetector = (options = {}) => {
    const {
      minNotes = 6,        // shortest loop worth noticing (events)
      maxWindow = 16,      // longest stretch we try to match (events)
      rhythmBin = 0.5,    // log2 ratio quantization step (~±25% timing slop)
      minSpanMs = 900,     // ignore micro-runs that fit the window
      minGapMs = 40,       // ignore machine-gun tremolo gaps
      maxGapMs = 6000,     // ignore stretches that sprawl into silence
      maxEvents = 512,     // rolling buffer cap
    } = options;

    const events = [];
    const families = new Map();
    let seq = 0;
    let familySeq = 0;

    const pitchChar = (a, b) => String.fromCharCode(65 + (((b - a) % 12 + 12) % 12));
    const gap = (i) => events[i + 1].onset - events[i].onset;
    const rhythmChar = (i) => {
      const g = gap(i);
      const prev = gap(i - 1);
      if (!(g > 0) || !(prev > 0)) return "z";
      const v = Math.max(-4, Math.min(4, Math.round(Math.log2(g / prev) / rhythmBin)));
      return String.fromCharCode(97 + v + 4);
    };

    // pitch signature of events[a..a+len-1] as a string of interval-class chars
    const pitchKeyFor = (a, len) => {
      let out = "";
      for (let i = a; i + 1 < a + len; i += 1) out += pitchChar(events[i].midi, events[i + 1].midi);
      return out;
    };
    // rhythm signature: char per gap-pair (skips the first gap, no prior to ratio against)
    const rhythmKeyFor = (a, len) => {
      let out = "";
      for (let i = a + 1; i + 1 < a + len; i += 1) out += rhythmChar(i);
      return out;
    };
    const rhythmMismatch = (a, b, len) => {
      let count = 0;
      for (let k = 1; k < len - 1; k += 1) if (rhythmChar(a + k) !== rhythmChar(b + k)) count += 1;
      return count;
    };

    let best = null;

    const scan = () => {
      const n = events.length;
      if (n < minNotes * 2) return null;
      for (let len = Math.min(maxWindow, Math.floor(n / 2)); len >= minNotes; len -= 1) {
        const tailStart = n - len;
        const tailPitch = pitchKeyFor(tailStart, len);
        if (!tailPitch) continue;
        const allow = Math.max(1, Math.floor(len * 0.25));
        for (let s = 0; s + len <= tailStart; s += 1) {
          let pitchMiss = 0;
          const candPitch = pitchKeyFor(s, len);
          for (let k = 0; k < tailPitch.length; k += 1) {
            if (candPitch[k] !== tailPitch[k]) {
              pitchMiss += 1;
              if (pitchMiss > allow) break;
            }
          }
          if (pitchMiss > allow) continue;
          if (rhythmMismatch(s, tailStart, len) > allow) continue;
          const span = events[s + len - 1].onset - events[s].onset;
          if (span < minSpanMs) continue;
          const avgGap = (events[s + len - 1].onset - events[s].onset) / (len - 1);
          if (avgGap < minGapMs || avgGap > maxGapMs) continue;
          // prefer clean matches first, then longer ones
          const score = pitchMiss + rhythmMismatch(s, tailStart, len) * 0.5 + (maxWindow - len) * 0.05;
          if (!best || score < best.score) best = { start: s, len, pitchMiss, score };
        }
      }
      return best;
    };

    const cloneNote = (event) => ({ midi: event.midi, onset: event.onset, duration: event.duration });

    const record = ({ midi, onset, duration = 0 }) => {
      seq += 1;
      events.push({ midi, onset, duration, seq });
      if (events.length > maxEvents) events.splice(0, events.length - maxEvents);

      best = null;
      const match = scan();
      let matched = null;
      let newlyTentative = false;
      let newlyConfirmed = false;
      if (match) {
        const key = pitchKeyFor(match.start, match.len);
        let family = families.get(key);
        if (!family) {
          familySeq += 1;
          family = { id: `loop-${familySeq}`, key, passes: [], lastTailSeq: -1, stage: "" };
          families.set(key, family);
          // the earlier stretch that got matched is the original occurrence — record it as pass 1
          family.passes.push({
            start: match.start,
            notes: events.slice(match.start, match.start + match.len).map(cloneNote),
          });
        }
        const tailLast = events[events.length - 1];
        if (family.lastTailSeq !== tailLast.seq) {
          family.lastTailSeq = tailLast.seq;
          family.passes.push({
            start: events.length - match.len,
            notes: events.slice(events.length - match.len).map(cloneNote),
          });
          const passes = family.passes.length;
          if (passes >= 3 && family.stage !== "confirmed") { family.stage = "confirmed"; newlyConfirmed = true; }
          else if (passes === 2 && family.stage !== "tentative") { family.stage = "tentative"; newlyTentative = true; }
          matched = family;
        }
      }

      const diffed = matched && matched.passes.length >= 2 ? diffPasses(matched) : null;
      return { matched, newlyTentative, newlyConfirmed, diff: diffed, snapshot() { return snapshot(); } };
    };

    // position-by-position pitch comparison of the two most recent passes
    const diffPasses = (family) => {
      const a = family.passes[family.passes.length - 2].notes;
      const b = family.passes[family.passes.length - 1].notes;
      return b.map((note, index) => !a[index] || a[index].midi !== note.midi);
    };

    const snapshot = () => Array.from(families.values())
      .filter((family) => family.passes.length >= 2)
      .map((family) => ({
        id: family.id,
        stage: family.stage,
        notes: family.passes[0].notes.length,
        diff: family.passes.length >= 2 ? diffPasses(family) : [],
        passes: family.passes.map((pass) => pass.notes.map(cloneNote)),
      }));

    const reset = () => { events.length = 0; families.clear(); seq = 0; familySeq = 0; };

    return { record, snapshot, reset, minNotes, maxWindow };
  };

  if (typeof window !== "undefined") window.createLoopDetector = createLoopDetector;
  if (typeof module !== "undefined" && module.exports) module.exports = { createLoopDetector };
})();

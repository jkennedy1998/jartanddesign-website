(() => {
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const INTERVAL_COLORS = ["#FEFFE5", "#8BF5C6", "#FFF3B3", "#4DC6E4", "#C4702B", "#F26657", "#A544FF", "#E36325", "#4477FF", "#B21535", "#2749D0", "#81172A"];
  const FRET_MARKERS = new Set([3, 5, 7, 9, 12]);
  const MAX_FRETS = 12;
  const TUNING_LIMIT = 24;
  const SOUND_OPTIONS = ["pluck", "sine", "saw", "square", "bell", "meow"];
  const ATTACK_STEPS = [1, 2, 5, 10, 20, 50, 100];
  const DECAY_STEPS = [0.2, 0.5, 1, 1.5, 2, 3, 4];
  const OCTAVE_BASE_LIMIT = 3;
  const STRINGS = [
    { open: "G", octave: 3, chars: "1234567890-=", codes: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"] },
    { open: "D", octave: 3, chars: "qwertyuiop[]", codes: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"] },
    { open: "A", octave: 2, chars: "asdfghjkl;'", codes: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"] },
    { open: "E", octave: 2, chars: "zxcvbnm,./", codes: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"] },
  ];

  const boardMount = document.querySelector("[data-key-guitar]");
  const octaveMount = document.querySelector("[data-key-guitar-octave]");
  const controlsMount = document.querySelector("[data-key-guitar-controls]");
  const soundMount = document.querySelector("[data-key-guitar-sound]");
  const attackMount = document.querySelector("[data-key-guitar-attack]");
  const decayMount = document.querySelector("[data-key-guitar-decay]");
  const latchMount = document.querySelector("[data-key-guitar-latch]");
  if (!boardMount || !octaveMount || !controlsMount || !soundMount || !attackMount || !decayMount || !latchMount) return;

  const noteIndex = (note) => NOTES.indexOf(note);
  const noteAt = (note, offset) => NOTES[(noteIndex(note) + offset + NOTES.length) % NOTES.length];

  const state = {
    octaveBase: 0,
    octaveHold: 0,
    tuningOffsets: STRINGS.map(() => 0),
    pressed: new Set(),
    sound: "pluck",
    attackIndex: 2,
    decayIndex: 3,
    latch: false,
    latched: new Set(),
  };
  const attackSeconds = () => ATTACK_STEPS[state.attackIndex] / 1000;
  const decaySeconds = () => DECAY_STEPS[state.decayIndex];
  const isSustained = () => state.sound === "sine" || state.sound === "saw" || state.sound === "square";
  let root = document.documentElement.dataset.musicRoot || "C";
  let scaleNotes = new Set((document.documentElement.dataset.musicScaleNotes || "").split(",").filter(Boolean));

  const intervalFor = (note) => (noteIndex(note) - noteIndex(root) + NOTES.length) % NOTES.length;
  const colorFor = (note) => INTERVAL_COLORS[intervalFor(note)];
  const hits = new Map();
  STRINGS.forEach((string, stringIndex) => {
    string.codes.forEach((code, fret) => hits.set(code, { stringIndex, fret, char: string.chars[fret], code }));
  });

  const span = (text, className = "") => Object.assign(document.createElement("span"), { className, textContent: text });

  let audioContext = null;
  const ensureAudio = () => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  };
  ["pointerdown", "touchstart", "keydown"].forEach((type) => {
    window.addEventListener(type, ensureAudio, { once: true, capture: true });
  });

  const frequencyFor = (midi) => 440 * 2 ** ((midi - 69) / 12);

  const voices = new Map();

  const makeOutput = (ctx) => {
    const out = ctx.createGain();
    out.gain.value = 0.2;
    out.connect(ctx.destination);
    return out;
  };

  const startPluck = (ctx, frequency, code) => {
    const now = ctx.currentTime;
    const attack = attackSeconds();
    const length = attack + decaySeconds();
    const out = makeOutput(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(frequency * 7, 7000), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.5, 250), now + length);
    filter.connect(out);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(1, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + length);
    env.connect(filter);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    osc.connect(env);
    osc.start(now);
    osc.stop(now + length + 0.1);
    const sub = ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.value = frequency / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    sub.connect(subGain).connect(filter);
    sub.start(now);
    sub.stop(now + length + 0.1);
    voices.set(code, {});
  };

  const TONE_TYPES = { sine: "sine", saw: "sawtooth", square: "square" };
  const TONE_PEAK = { sine: 0.8, saw: 0.5, square: 0.35 };

  const startTone = (ctx, frequency, code) => {
    const now = ctx.currentTime;
    const out = makeOutput(ctx);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(TONE_PEAK[state.sound] ?? 0.8, now + Math.max(0.002, attackSeconds()));
    env.connect(out);
    const osc = ctx.createOscillator();
    osc.type = TONE_TYPES[state.sound] ?? "sine";
    osc.frequency.value = frequency;
    osc.connect(env);
    osc.start(now);
    voices.set(code, {
      release: (time) => {
        const at = Math.max(time, ctx.currentTime);
        env.gain.setTargetAtTime(0.0001, at, Math.max(0.02, decaySeconds() / 3));
        osc.stop(at + decaySeconds() + 0.3);
      },
    });
  };

  const startBell = (ctx, frequency, code) => {
    const now = ctx.currentTime;
    const attack = Math.max(0.002, attackSeconds());
    const length = attack + decaySeconds();
    const out = makeOutput(ctx);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(1, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + length);
    env.connect(out);
    const partials = [
      { ratio: 1, gain: 0.5 },
      { ratio: 2.41, gain: 0.3 },
      { ratio: 3.9, gain: 0.18 },
    ];
    partials.forEach(({ ratio, gain }) => {
      const partialGain = ctx.createGain();
      partialGain.gain.value = gain;
      partialGain.connect(env);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency * ratio;
      osc.connect(partialGain);
      osc.start(now);
      osc.stop(now + length + 0.1);
    });
    voices.set(code, {});
  };

  const startMeow = (ctx, frequency, code) => {
    const now = ctx.currentTime;
    const attack = Math.max(0.01, attackSeconds());
    const length = Math.max(0.25, attack + decaySeconds() * 0.6);
    const out = makeOutput(ctx);
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = frequency * 2.5;
    formant.Q.value = 6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.9, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + length);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(frequency * 0.85, now);
    osc.frequency.linearRampToValueAtTime(frequency * 1.3, now + length * 0.35);
    osc.frequency.linearRampToValueAtTime(frequency * 0.9, now + length);
    osc.connect(formant).connect(env).connect(out);
    osc.start(now);
    osc.stop(now + length + 0.1);
    voices.set(code, {});
  };

  const LIVE_NOTE_EVENT = "music-theory:live-note";
  const publishLiveNote = (midi) => {
    window.dispatchEvent(new CustomEvent(LIVE_NOTE_EVENT, { detail: { note: NOTES[((midi % 12) + 12) % 12] } }));
  };

  const noteOn = (midi, code) => {
    const ctx = ensureAudio();
    const existing = voices.get(code);
    if (existing?.release) existing.release(ctx.currentTime);
    voices.delete(code);
    const frequency = frequencyFor(midi);
    if (state.sound === "pluck") startPluck(ctx, frequency, code);
    else if (state.sound === "bell") startBell(ctx, frequency, code);
    else if (state.sound === "meow") startMeow(ctx, frequency, code);
    else startTone(ctx, frequency, code);
    publishLiveNote(midi);
  };

  const noteOff = (code) => {
    const voice = voices.get(code);
    if (!voice) return;
    voices.delete(code);
    if (voice.release && audioContext) voice.release(audioContext.currentTime);
  };

  const midiFor = (stringIndex, fret) => {
    const string = STRINGS[stringIndex];
    return (string.octave + 1) * 12 + noteIndex(string.open)
      + state.tuningOffsets[stringIndex] + fret + (state.octaveBase + state.octaveHold) * 12;
  };

  const keyFor = (code) => boardMount.querySelector(`[data-key-guitar-code="${code}"]`);

  const press = (hit) => {
    const cell = keyFor(hit.code);
    if (cell) cell.classList.add("is-pressed");
    noteOn(midiFor(hit.stringIndex, hit.fret), hit.code);
  };
  const release = (hit) => {
    const cell = keyFor(hit.code);
    if (cell) cell.classList.remove("is-pressed");
    noteOff(hit.code);
  };

  const renderOctave = () => {
    const total = state.octaveBase + state.octaveHold;
    const value = octaveMount.querySelector("[data-key-guitar-octave-value]");
    if (value) value.textContent = total > 0 ? `+${total}` : String(total);
  };

  const renderControls = () => {
    const renderSelector = (mount, label, value, direction) => {
      const step = (text, stepDirection) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "music-selector-step";
        button.dataset.kgDirection = direction;
        button.dataset.kgStep = String(stepDirection);
        button.textContent = text;
        button.setAttribute("aria-label", `${stepDirection < 0 ? "previous" : "next"} ${label}`);
        return button;
      };
      mount.replaceChildren(
        span(`${label} :`, "music-selector-label"),
        step("‹", -1),
        span(value, "music-selector-value"),
        step("›", 1),
      );
    };
    renderSelector(soundMount, "sound", state.sound, "sound");
    renderSelector(attackMount, "attack", `${ATTACK_STEPS[state.attackIndex]}ms`, "attack");
    renderSelector(decayMount, "decay", `${DECAY_STEPS[state.decayIndex]}s`, "decay");
    renderSelector(latchMount, "latch", state.latch ? "on" : "off", "latch");
  };

  const setLatch = (value) => {
    state.latch = value;
    if (!value) {
      state.latched.forEach((code) => {
        const hit = hits.get(code);
        if (hit) release(hit);
      });
      state.latched.clear();
    }
  };

  const makeStepButton = (stringIndex, direction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "music-tuning-step";
    button.dataset.kgTuningDirection = String(direction);
    button.dataset.kgStringIndex = String(stringIndex);
    button.textContent = direction < 0 ? "‹" : "›";
    button.setAttribute("aria-label", `${direction < 0 ? "lower" : "raise"} string ${stringIndex + 1} one semitone`);
    return button;
  };

  const render = () => {
    const fragment = document.createDocumentFragment();
    const header = document.createElement("div");
    header.className = "music-fret-row music-fret-labels";
    header.append(span("0"));
    for (let fret = 1; fret < MAX_FRETS; fret += 1) header.append(span(FRET_MARKERS.has(fret) ? String(fret) : "_"));
    header.append(span("│", "music-fret-end"));
    fragment.append(header);

    STRINGS.forEach((string, stringIndex) => {
      const row = document.createElement("div");
      row.className = "music-fret-row";
      const stringTuning = document.createElement("span");
      stringTuning.className = "music-string-tuning";
      const openNote = noteAt(string.open, state.tuningOffsets[stringIndex]);
      const openInScale = scaleNotes.size === 0 || scaleNotes.has(openNote);
      const openLabel = document.createElement("button");
      openLabel.type = "button";
      openLabel.className = `music-string-label is-on key-guitar-open${openInScale ? "" : " is-scale-dim"}`;
      openLabel.dataset.kgOpen = String(stringIndex);
      openLabel.textContent = openNote;
      openLabel.style.setProperty("--music-note-color", colorFor(openNote));
      openLabel.setAttribute("aria-label", `string ${stringIndex + 1} open ${openNote}`);
      stringTuning.append(makeStepButton(stringIndex, -1), openLabel, makeStepButton(stringIndex, 1));
      row.append(stringTuning);
      for (let fret = 0; fret < MAX_FRETS; fret += 1) {
        if (fret >= string.chars.length) {
          row.append(span("", "music-fret-note is-off"));
          continue;
        }
        const note = noteAt(openNote, fret);
        const inScale = scaleNotes.size === 0 || scaleNotes.has(note);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `music-fret-note is-on key-guitar-key${state.pressed.has(string.codes[fret]) ? " is-pressed" : ""}${inScale ? "" : " is-scale-dim"}`;
        cell.dataset.keyGuitarCode = string.codes[fret];
        cell.textContent = string.chars[fret];
        cell.style.setProperty("--music-note-color", colorFor(note));
        cell.setAttribute("aria-label", `string ${stringIndex + 1} fret ${fret} ${note}`);
        row.append(cell);
      }
      row.append(span("│", "music-fret-end"));
      fragment.append(row);
    });
    boardMount.replaceChildren(fragment);
  };

  const flashCell = (cell) => {
    cell.classList.add("is-pressed");
    window.setTimeout(() => cell.classList.remove("is-pressed"), 180);
  };

  window.addEventListener("music-theory:root", (event) => {
    root = event.detail?.root || root;
    scaleNotes = new Set(event.detail?.notes || []);
    render();
  });

  controlsMount.addEventListener("click", (event) => {
    const step = event.target.closest("[data-kg-direction]");
    if (!step) return;
    const stepDirection = Number(step.dataset.kgStep);
    if (step.dataset.kgDirection === "sound") {
      state.sound = SOUND_OPTIONS[(SOUND_OPTIONS.indexOf(state.sound) + stepDirection + SOUND_OPTIONS.length) % SOUND_OPTIONS.length];
    } else if (step.dataset.kgDirection === "attack") {
      state.attackIndex = Math.max(0, Math.min(ATTACK_STEPS.length - 1, state.attackIndex + stepDirection));
    } else if (step.dataset.kgDirection === "decay") {
      state.decayIndex = Math.max(0, Math.min(DECAY_STEPS.length - 1, state.decayIndex + stepDirection));
    } else if (step.dataset.kgDirection === "octave") {
      state.octaveBase = Math.max(-OCTAVE_BASE_LIMIT, Math.min(OCTAVE_BASE_LIMIT, state.octaveBase + stepDirection));
      renderOctave();
    } else if (step.dataset.kgDirection === "latch") {
      setLatch(!state.latch);
    }
    renderControls();
  });

  boardMount.addEventListener("click", (event) => {
    const step = event.target.closest("[data-kg-tuning-direction]");
    if (!step) return;
    const stringIndex = Number(step.dataset.kgStringIndex);
    state.tuningOffsets[stringIndex] = Math.max(-TUNING_LIMIT, Math.min(TUNING_LIMIT,
      state.tuningOffsets[stringIndex] + Number(step.dataset.kgTuningDirection)));
    render();
  });

  const triggerOpenString = (stringIndex) => {
    const open = boardMount.querySelector(`[data-kg-open="${stringIndex}"]`);
    if (!open) return;
    const code = `open-${stringIndex}`;
    noteOn(midiFor(stringIndex, 0), code);
    flashCell(open);
    if (isSustained()) window.setTimeout(() => noteOff(code), 250);
  };

  const triggerFretCell = (cell) => {
    const hit = hits.get(cell.dataset.keyGuitarCode);
    if (!hit) return;
    noteOn(midiFor(hit.stringIndex, hit.fret), `click-${hit.code}`);
    flashCell(cell);
    if (isSustained()) window.setTimeout(() => noteOff(`click-${hit.code}`), 250);
  };

  let isDragStrumming = false;
  window.addEventListener("pointerup", () => { isDragStrumming = false; });
  window.addEventListener("pointercancel", () => { isDragStrumming = false; });

  boardMount.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-kg-tuning-direction]")) return;
    isDragStrumming = true;
    const open = event.target.closest("[data-kg-open]");
    if (open) { triggerOpenString(Number(open.dataset.kgOpen)); return; }
    const cell = event.target.closest("[data-key-guitar-code]");
    if (cell) triggerFretCell(cell);
  });

  boardMount.addEventListener("pointerover", (event) => {
    if (!isDragStrumming) return;
    const open = event.target.closest("[data-kg-open]");
    if (open) { triggerOpenString(Number(open.dataset.kgOpen)); return; }
    const cell = event.target.closest("[data-key-guitar-code]");
    if (cell) triggerFretCell(cell);
  });

  const isTypingTarget = (target) => target instanceof HTMLElement
    && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift") {
      state.octaveHold = 1;
      renderOctave();
      return;
    }
    if (event.key === "Control") {
      state.octaveHold = -1;
      renderOctave();
      return;
    }
    if (event.repeat || isTypingTarget(event.target)) return;
    const hit = hits.get(event.code);
    if (!hit) return;
    event.preventDefault();
    if (state.pressed.has(event.code)) return;
    state.pressed.add(event.code);
    if (state.latch && state.latched.has(event.code)) {
      state.latched.delete(event.code);
      release(hit);
    } else {
      press(hit);
      if (state.latch) state.latched.add(event.code);
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.key === "Shift" || event.key === "Control") {
      state.octaveHold = 0;
      renderOctave();
      return;
    }
    const hit = hits.get(event.code);
    if (!hit) return;
    state.pressed.delete(event.code);
    if (!(state.latch && state.latched.has(event.code))) release(hit);
  });

  window.addEventListener("blur", () => {
    state.pressed.forEach((code) => {
      if (!(state.latch && state.latched.has(code))) release(hits.get(code));
    });
    state.pressed.clear();
    state.octaveHold = 0;
    renderOctave();
  });

  render();
  renderOctave();
  renderControls();
})();

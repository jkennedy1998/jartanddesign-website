(() => {
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const INTERVAL_COLORS = ["#FEFFE5", "#8BF5C6", "#FFF3B3", "#4DC6E4", "#C4702B", "#F26657", "#A544FF", "#E36325", "#4477FF", "#B21535", "#2749D0", "#81172A"];
  const FRET_MARKERS = new Set([3, 5, 7, 9]);
  const MAX_FRETS = 12;
  const TUNING_LIMIT = 6;
  const STRINGS = [
    { open: "G", octave: 3, chars: "1234567890-=", codes: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"] },
    { open: "D", octave: 3, chars: "qwertyuiop[]", codes: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"] },
    { open: "A", octave: 2, chars: "asdfghjkl;'", codes: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"] },
    { open: "E", octave: 2, chars: "zxcvbnm,./", codes: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"] },
  ];

  const boardMount = document.querySelector("[data-key-guitar]");
  const octaveMount = document.querySelector("[data-key-guitar-octave]");
  if (!boardMount || !octaveMount) return;

  const noteIndex = (note) => NOTES.indexOf(note);
  const noteAt = (note, offset) => NOTES[(noteIndex(note) + offset + NOTES.length) % NOTES.length];

  const state = {
    octaveShift: 0,
    tuningOffsets: STRINGS.map(() => 0),
    pressed: new Set(),
  };
  let root = document.documentElement.dataset.musicRoot || "C";

  const intervalFor = (note) => (noteIndex(note) - noteIndex(root) + NOTES.length) % NOTES.length;
  const colorFor = (note) => INTERVAL_COLORS[intervalFor(note)];
  const hits = new Map();
  STRINGS.forEach((string, stringIndex) => {
    string.codes.forEach((code, fret) => hits.set(code, { stringIndex, fret, char: string.chars[fret] }));
  });

  const span = (text, className = "") => Object.assign(document.createElement("span"), { className, textContent: text });

  let audioContext = null;
  const ensureAudio = () => {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  };

  const pluck = (midi) => {
    const ctx = ensureAudio();
    const now = ctx.currentTime;
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const out = ctx.createGain();
    out.gain.value = 0.2;
    out.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(frequency * 7, 7000), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.5, 250), now + 1);
    filter.connect(out);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.exponentialRampToValueAtTime(1, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    env.connect(filter);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    osc.connect(env);
    const sub = ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.value = frequency / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    sub.connect(subGain).connect(filter);
    osc.start(now);
    sub.start(now);
    osc.stop(now + 1.6);
    sub.stop(now + 1.6);
  };

  const midiFor = (stringIndex, fret) => {
    const string = STRINGS[stringIndex];
    return (string.octave + 1) * 12 + noteIndex(string.open)
      + state.tuningOffsets[stringIndex] + fret + state.octaveShift * 12;
  };

  const keyFor = (code) => boardMount.querySelector(`[data-key-guitar-code="${code}"]`);

  const press = (hit) => {
    const cell = keyFor(hit.code);
    if (cell) cell.classList.add("is-pressed");
    pluck(midiFor(hit.stringIndex, hit.fret));
  };
  const release = (hit) => {
    const cell = keyFor(hit.code);
    if (cell) cell.classList.remove("is-pressed");
  };

  const renderOctave = () => {
    const value = octaveMount.querySelector("[data-key-guitar-octave-value]");
    if (value) value.textContent = state.octaveShift > 0 ? `+${state.octaveShift}` : String(state.octaveShift);
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
      const openLabel = document.createElement("button");
      openLabel.type = "button";
      openLabel.className = "music-string-label is-off key-guitar-open";
      openLabel.dataset.kgOpen = String(stringIndex);
      openLabel.textContent = openNote;
      openLabel.style.setProperty("--music-note-color", colorFor(openNote));
      openLabel.setAttribute("aria-label", `string ${stringIndex + 1} open ${openNote}`);
      stringTuning.append(makeStepButton(stringIndex, -1), openLabel, makeStepButton(stringIndex, 1));
      row.append(stringTuning);
      for (let fret = 0; fret < MAX_FRETS; fret += 1) {
        if (fret >= string.chars.length) {
          row.append(span("", "music-fret-end"));
          continue;
        }
        const note = noteAt(openNote, fret);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `key-guitar-key${state.pressed.has(string.codes[fret]) ? " is-pressed" : ""}`;
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
    render();
  });

  boardMount.addEventListener("click", (event) => {
    const step = event.target.closest("[data-kg-tuning-direction]");
    if (step) {
      const stringIndex = Number(step.dataset.kgStringIndex);
      state.tuningOffsets[stringIndex] = Math.max(-TUNING_LIMIT, Math.min(TUNING_LIMIT,
        state.tuningOffsets[stringIndex] + Number(step.dataset.kgTuningDirection)));
      render();
      return;
    }
    const open = event.target.closest("[data-kg-open]");
    if (open) {
      pluck(midiFor(Number(open.dataset.kgOpen), 0));
      flashCell(open);
      return;
    }
    const cell = event.target.closest("[data-key-guitar-code]");
    if (cell) {
      const hit = hits.get(cell.dataset.keyGuitarCode);
      if (hit) pluck(midiFor(hit.stringIndex, hit.fret));
      flashCell(cell);
    }
  });

  const isTypingTarget = (target) => target instanceof HTMLElement
    && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift") {
      state.octaveShift = 1;
      renderOctave();
      return;
    }
    if (event.key === "Control") {
      state.octaveShift = -1;
      renderOctave();
      return;
    }
    if (event.repeat || isTypingTarget(event.target)) return;
    const hit = hits.get(event.code);
    if (!hit) return;
    event.preventDefault();
    if (state.pressed.has(event.code)) return;
    state.pressed.add(event.code);
    press(hit);
  });

  window.addEventListener("keyup", (event) => {
    if (event.key === "Shift" || event.key === "Control") {
      state.octaveShift = 0;
      renderOctave();
    }
    const hit = hits.get(event.code);
    if (hit && state.pressed.delete(event.code)) release(hit);
  });

  window.addEventListener("blur", () => {
    state.pressed.forEach(release);
    state.pressed.clear();
    state.octaveShift = 0;
    renderOctave();
  });

  render();
  renderOctave();
})();

(() => {
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const INTERVAL_COLORS = ["#FEFFE5", "#8BF5C6", "#FFF3B3", "#4DC6E4", "#C4702B", "#F26657", "#A544FF", "#E36325", "#4477FF", "#B21535", "#2749D0", "#81172A"];
  const FRET_MARKERS = new Set([3, 5, 7, 9, 12]);
  const MAX_FRETS = 12;
  const TUNING_LIMIT = 24;
  const SOUND_OPTIONS = ["pluck", "sine", "saw", "square", "bell", "organ", "ep", "pad", "meow"];
  const ONE_SHOT_SOUNDS = new Set(["pluck", "bell", "meow"]);
  const ENV_COLS = 32;
  const ENV_ROWS = 9;
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
  const envMount = document.querySelector("[data-key-guitar-env]");
  const envStepsMount = document.querySelector("[data-key-guitar-env-steps]");
  if (!boardMount || !octaveMount || !controlsMount || !soundMount || !envMount) return;
  // meow sample: "Meow.ogg" by Dcrosby, Wikimedia Commons, CC BY-SA 3.0
  const sampleUrl = new URL("samples/meow.ogg", document.currentScript?.src ?? new URL("music-theory/", location.href));

  const noteIndex = (note) => NOTES.indexOf(note);
  const noteAt = (note, offset) => NOTES[(noteIndex(note) + offset + NOTES.length) % NOTES.length];

  const state = {
    octaveBase: 0,
    octaveHold: 0,
    tuningOffsets: STRINGS.map(() => 0),
    pressed: new Set(),
    sound: "pluck",
    env: { pa: 0.005, pd: 0.25, pr: 0.745, s: 0.3, total: 0.8 },
    pedal: false,
  };
  const pedalVoices = new Map();
  const envStages = () => {
    const { pa, pd, pr, s, total } = state.env;
    return {
      a: Math.max(0.001, pa * total),
      d: Math.max(0.01, pd * total),
      r: Math.max(0.01, pr * total),
      s,
    };
  };
  const envFormat = (seconds) => (seconds >= 1 ? `${seconds.toFixed(2)}s` : `${Math.round(seconds * 1000)}ms`);
  const isSustained = () => !ONE_SHOT_SOUNDS.has(state.sound);
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
  let masterOut = null;
  const ensureAudio = () => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
      // one shared bus into destination instead of every voice fanning out on its own
      masterOut = audioContext.createGain();
      masterOut.gain.value = 0.2;
      masterOut.connect(audioContext.destination);
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  };
  ["pointerdown", "touchstart", "keydown"].forEach((type) => {
    window.addEventListener(type, () => {
      ensureAudio();
      loadMeow(audioContext).catch(() => { /* meow falls back to synth on first miss */ });
    }, { once: true, capture: true });
  });

  const frequencyFor = (midi) => 440 * 2 ** ((midi - 69) / 12);

  const voices = new Map();

  // voice cap: steal the oldest voice when polyphony gets out of hand so the
  // audio callback never drowns during strums and pedal at once
  const MAX_VOICES = 16;
  const retireOldestVoice = () => {
    while (voices.size >= MAX_VOICES) {
      const [oldestCode, oldest] = voices.entries().next().value;
      voices.delete(oldestCode);
      pedalVoices.delete(oldestCode);
      if (oldest.cancel) oldest.cancel(audioContext.currentTime);
      else if (oldest.release) oldest.release(audioContext.currentTime);
    }
  };

  // one-shot voice shape: a→peak, d→sustain floor, hold, then fade over the full release
  const oneShotFloor = (s, peak) => Math.max(0.0002, peak * Math.max(0.02, s));
  const cancelVoice = (ctx, env, sources) => {
    let stopped = false;
    return (time) => {
      if (stopped) return;
      stopped = true;
      const at = Math.max(time, ctx.currentTime);
      env.gain.cancelScheduledValues(at);
      env.gain.setTargetAtTime(0.0001, at, 0.012);
      sources.forEach((source) => {
        try { source.stop(at + 0.1); } catch { /* already stopped */ }
      });
    };
  };

  const makeOutput = (ctx, frequency) => {
    const out = ctx.createGain();
    if (!masterOut) {
      ensureAudio();
    }
    if (ctx.createStereoPanner && frequency) {
      // subtle keyboard-style spread: low notes left, high notes right
      const midi = 69 + 12 * Math.log2(frequency / 440);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-0.4, Math.min(0.4, ((midi - 60) / 24) * 0.4));
      out.connect(pan).connect(masterOut);
      return out;
    }
    out.connect(masterOut);
    return out;
  };

  // shared short noise buffer for pick-style transients
  let noiseBuffer = null;
  const noiseFor = (ctx) => {
    if (!noiseBuffer) {
      const length = Math.ceil(ctx.sampleRate * 0.05);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  };

  const startPluck = (ctx, frequency, code) => {
    const now = ctx.currentTime;
    const { a, d, r, s } = envStages();
    const floor = oneShotFloor(s, 1);
    const length = a + d + r;
    const out = makeOutput(ctx, frequency);
    // string body: lowpass that darkens like a real pick, with a body-resonance bump
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(frequency * 9, 9000), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.2, 220), now + a + d);
    filter.Q.value = 0.7;
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 220;
    body.gain.value = 3;
    body.Q.value = 1.2;
    filter.connect(body).connect(out);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(1, now + Math.max(0.002, a));
    env.gain.exponentialRampToValueAtTime(floor, now + a + d);
    env.gain.exponentialRampToValueAtTime(0.0001, now + length);
    env.connect(filter);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    // picked strings start slightly sharp and settle
    osc.frequency.setValueAtTime(frequency * 1.03, now);
    osc.frequency.exponentialRampToValueAtTime(frequency, now + 0.03);
    osc.connect(env);
    osc.start(now);
    osc.stop(now + length + 0.05);
    const sub = ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.value = frequency / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    sub.connect(subGain).connect(filter);
    sub.start(now);
    sub.stop(now + length + 0.05);
    // pick transient: a tight noise click, brighter on higher strings
    const pick = ctx.createBufferSource();
    pick.buffer = noiseFor(ctx);
    const pickFilter = ctx.createBiquadFilter();
    pickFilter.type = "highpass";
    pickFilter.frequency.value = Math.max(frequency * 3, 1800);
    const pickEnv = ctx.createGain();
    pickEnv.gain.setValueAtTime(0.5, now);
    pickEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
    pick.connect(pickFilter).connect(pickEnv).connect(out);
    pick.start(now);
    pick.stop(now + 0.03);
    voices.set(code, { cancel: cancelVoice(ctx, env, [osc, sub, pick]) });
  };

  // sustained-voice helpers: shared a/d envelope shape and release for held sounds
  const sustainEnvelope = (ctx, stages, peak) => {
    const { a, d, s } = stages;
    const env = ctx.createGain();
    const now = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + Math.max(0.002, a));
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * Math.max(0.02, s)), now + a + d);
    return env;
  };

  const releaseVoice = (ctx, env, sources, r) => (time) => {
    const at = Math.max(time, ctx.currentTime);
    env.gain.setTargetAtTime(0.0001, at, Math.max(0.02, r / 3));
    sources.forEach((osc) => {
      try { osc.stop(at + r + 0.3); } catch { /* already stopped */ }
    });
  };

  // sine = flute: soft unison shimmer with vibrato that fades in like air settling
  const startSine = (ctx, frequency, code) => {
    const stages = envStages();
    const { a, d, r } = stages;
    const now = ctx.currentTime;
    const out = makeOutput(ctx, frequency);
    const env = sustainEnvelope(ctx, stages, 0.7);
    env.connect(out);
    const vibrato = ctx.createOscillator();
    vibrato.type = "sine";
    vibrato.frequency.value = 5.2;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.setValueAtTime(0, now);
    vibratoDepth.gain.linearRampToValueAtTime(frequency * 0.006, now + a + d * 0.6 + 0.15);
    vibrato.connect(vibratoDepth);
    const sources = [-4, 4].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency * 2 ** (cents / 1200);
      vibratoDepth.connect(osc.frequency);
      osc.connect(env);
      osc.start(now);
      return osc;
    });
    vibrato.start(now);
    sources.push(vibrato);
    voices.set(code, { release: releaseVoice(ctx, env, sources, r) });
  };

  // saw = lead: two detuned saws through a keytracked lowpass that settles into warmth
  const startSaw = (ctx, frequency, code) => {
    const stages = envStages();
    const { a, d, r } = stages;
    const now = ctx.currentTime;
    const out = makeOutput(ctx, frequency);
    const env = sustainEnvelope(ctx, stages, 0.45);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(frequency * 8, 8000), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 3, 900), now + a + d);
    filter.Q.value = 0.6;
    env.connect(filter).connect(out);
    const sources = [-7, 7].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency * 2 ** (cents / 1200);
      osc.connect(env);
      osc.start(now);
      return osc;
    });
    voices.set(code, { release: releaseVoice(ctx, env, sources, r) });
  };

  // square = chip: hollow detuned pair with a sub-octave for weight
  const startSquare = (ctx, frequency, code) => {
    const stages = envStages();
    const { a, d, r } = stages;
    const now = ctx.currentTime;
    const out = makeOutput(ctx, frequency);
    const env = sustainEnvelope(ctx, stages, 0.3);
    env.connect(out);
    const sources = [-3, 3].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = frequency * 2 ** (cents / 1200);
      osc.connect(env);
      osc.start(now);
      return osc;
    });
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = frequency / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    sub.connect(subGain).connect(env);
    sub.start(now);
    sources.push(sub);
    voices.set(code, { release: releaseVoice(ctx, env, sources, r) });
  };

  const startBell = (ctx, frequency, code) => {
    const now = ctx.currentTime;
    const { a, d, r, s } = envStages();
    const floor = oneShotFloor(s, 1);
    const out = makeOutput(ctx, frequency);
    const bus = ctx.createGain();
    bus.connect(out);
    // each partial rings with its own decay: high partials die fast, low ones carry
    const partials = [
      { ratio: 1, gain: 0.5, decay: 1 },
      { ratio: 2.41, gain: 0.3, decay: 0.55 },
      { ratio: 3.9, gain: 0.18, decay: 0.32 },
      { ratio: 6.3, gain: 0.08, decay: 0.18 },
    ];
    const sources = [];
    partials.forEach(({ ratio, gain, decay }) => {
      const penv = ctx.createGain();
      penv.gain.setValueAtTime(0.0001, now);
      penv.gain.exponentialRampToValueAtTime(gain, now + Math.max(0.002, a));
      penv.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * floor), now + a + d);
      penv.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(a + d + 0.05, a + d + r * decay));
      penv.connect(bus);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency * ratio;
      osc.connect(penv);
      osc.start(now);
      osc.stop(now + a + d + r + 0.05);
      sources.push(osc);
    });
    voices.set(code, { cancel: cancelVoice(ctx, bus, sources) });
  };

  const startOrgan = (ctx, frequency, code) => {
    const stages = envStages();
    const out = makeOutput(ctx, frequency);
    const env = sustainEnvelope(ctx, stages, 0.4);
    env.connect(out);
    const drawbars = [[1, 0.5], [2, 0.35], [3, 0.22], [4, 0.12]];
    const sources = drawbars.map(([ratio, gain]) => {
      const partialGain = ctx.createGain();
      partialGain.gain.value = gain;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency * ratio;
      osc.connect(partialGain).connect(env);
      osc.start(ctx.currentTime);
      return osc;
    });
    voices.set(code, { release: releaseVoice(ctx, env, sources, stages.r) });
  };

  // electric piano: FM body (decaying bark) plus a fast tine sparkle on top
  const startEp = (ctx, frequency, code) => {
    const stages = envStages();
    const { a, d, r } = stages;
    const out = makeOutput(ctx, frequency);
    const env = sustainEnvelope(ctx, stages, 0.5);
    env.connect(out);
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = frequency;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = frequency * 2;
    const modIndex = ctx.createGain();
    modIndex.gain.setValueAtTime(frequency * 3, ctx.currentTime);
    modIndex.gain.exponentialRampToValueAtTime(Math.max(frequency * 0.4, 20), ctx.currentTime + a + d);
    mod.connect(modIndex).connect(carrier.frequency);
    const tine = ctx.createOscillator();
    tine.type = "sine";
    tine.frequency.value = frequency * 14.01;
    const tineEnv = ctx.createGain();
    tineEnv.gain.setValueAtTime(0.12, ctx.currentTime);
    tineEnv.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + Math.max(0.08, a + d * 0.5));
    tine.connect(tineEnv).connect(env);
    carrier.connect(env);
    const sources = [carrier, mod, tine];
    sources.forEach((osc) => osc.start(ctx.currentTime));
    voices.set(code, { release: releaseVoice(ctx, env, sources, r) });
  };

  // warm pad: three detuned saws through a filter that opens with the attack
  const startPad = (ctx, frequency, code) => {
    const stages = envStages();
    const { a, d, r } = stages;
    const now = ctx.currentTime;
    const out = makeOutput(ctx, frequency);
    const env = sustainEnvelope(ctx, stages, 0.28);
    env.connect(out);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.max(frequency, 200), now);
    filter.frequency.linearRampToValueAtTime(Math.min(frequency * 6, 6000), now + a + d);
    filter.Q.value = 0.8;
    filter.connect(env);
    const sources = [-8, 0, 8].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency * 2 ** (cents / 1200);
      osc.connect(filter);
      osc.start(now);
      return osc;
    });
    voices.set(code, { release: releaseVoice(ctx, env, sources, r) });
  };

  // sampled meow: sample's voiced body sits near 620 Hz, keyboard pitch maps to playback rate
  const MEOW_BASE_HZ = 620;
  let meowAudio = null;
  const loadMeow = (ctx) => {
    if (!meowAudio) {
      meowAudio = fetch(sampleUrl)
        .then((response) => response.arrayBuffer())
        .then((buffer) => ctx.decodeAudioData(buffer));
    }
    return meowAudio;
  };

  const startMeow = (ctx, frequency, code) => {
    const now = ctx.currentTime;
    const { a, d, r, s } = envStages();
    const floor = oneShotFloor(s, 0.9);
    const length = Math.max(0.25, a + d + r);
    const out = makeOutput(ctx, frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.9, now + Math.max(0.01, a));
    env.gain.exponentialRampToValueAtTime(floor, now + Math.max(0.01, a) + d);
    env.gain.exponentialRampToValueAtTime(0.0001, now + length);
    env.connect(out);
    const sources = [];
    const voice = { cancel: cancelVoice(ctx, env, sources) };
    voices.set(code, voice);
    loadMeow(ctx).then((buffer) => {
      if (voices.get(code) !== voice) return;
      const sample = ctx.createBufferSource();
      sample.buffer = buffer;
      sample.playbackRate.value = Math.min(3.5, Math.max(0.4, frequency / MEOW_BASE_HZ));
      sample.connect(env);
      sample.start();
      sources.push(sample);
    }).catch(() => {
      if (voices.get(code) !== voice) return;
      const formant = ctx.createBiquadFilter();
      formant.type = "bandpass";
      formant.frequency.value = frequency * 2.5;
      formant.Q.value = 6;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(frequency * 0.85, now);
      osc.frequency.linearRampToValueAtTime(frequency * 1.3, now + length * 0.35);
      osc.frequency.linearRampToValueAtTime(frequency * 0.9, now + length);
      osc.connect(formant).connect(env);
      osc.start(now);
      osc.stop(now + length + 0.05);
      sources.push(osc);
    });
  };

  const LIVE_NOTE_EVENT = "music-theory:live-note";
  const publishLiveNote = (midi) => {
    window.dispatchEvent(new CustomEvent(LIVE_NOTE_EVENT, { detail: { note: NOTES[((midi % 12) + 12) % 12] } }));
  };

  const noteOn = (midi, code) => {
    const ctx = ensureAudio();
    retireOldestVoice();
    const existing = voices.get(code);
    if (existing?.cancel) existing.cancel(ctx.currentTime);
    else if (existing?.release) existing.release(ctx.currentTime);
    voices.delete(code);
    pedalVoices.delete(code);
    const frequency = frequencyFor(midi);
    if (state.sound === "pluck") startPluck(ctx, frequency, code);
    else if (state.sound === "bell") startBell(ctx, frequency, code);
    else if (state.sound === "organ") startOrgan(ctx, frequency, code);
    else if (state.sound === "ep") startEp(ctx, frequency, code);
    else if (state.sound === "pad") startPad(ctx, frequency, code);
    else if (state.sound === "meow") startMeow(ctx, frequency, code);
    else if (state.sound === "sine") startSine(ctx, frequency, code);
    else if (state.sound === "saw") startSaw(ctx, frequency, code);
    else startSquare(ctx, frequency, code);
    publishLiveNote(midi);
  };

  const noteOff = (code) => {
    const voice = voices.get(code);
    if (!voice) return;
    voices.delete(code);
    if (!voice.release) return;
    if (state.pedal) {
      pedalVoices.set(code, voice);
      return;
    }
    voice.release(audioContext.currentTime);
  };

  const setPedal = (down) => {
    if (state.pedal === down) return;
    state.pedal = down;
    if (!down) {
      pedalVoices.forEach((voice, code) => {
        pedalVoices.delete(code);
        if (audioContext) voice.release(audioContext.currentTime);
      });
    }
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
    const randomButton = document.createElement("button");
    randomButton.type = "button";
    randomButton.className = "music-random-button";
    randomButton.dataset.kgDirection = "random";
    randomButton.textContent = "randomize";
    randomButton.setAttribute("aria-label", "randomize sound, octave, and envelope");
    controlsMount.append(randomButton);
  };

  // one roll of the dice: sound, octave, and a valid envelope shape
  const randomizeGuitar = () => {
    state.octaveBase = Math.floor(Math.random() * (OCTAVE_BASE_LIMIT * 2 + 1)) - OCTAVE_BASE_LIMIT;
    state.sound = SOUND_OPTIONS[Math.floor(Math.random() * SOUND_OPTIONS.length)];
    const env = state.env;
    env.pa = 0.004 + Math.random() * 0.35;
    env.pd = 0.01 + Math.random() * (0.9 - env.pa);
    env.pr = 0.02 + Math.random() * 0.9;
    env.s = Math.random();
    renderOctave();
    renderEnv();
  };

  const envHandles = () => {
    const span = ENV_COLS - 1;
    const xa = Math.round(state.env.pa * span);
    const xd = Math.round((state.env.pa + state.env.pd) * span);
    const xr = span;
    return { xa, xd, xs: Math.round((xd + xr) / 2), xr };
  };

  const envLevelRow = (x) => {
    const span = ENV_COLS - 1;
    const { pa, pd, pr, s } = state.env;
    const top = ENV_ROWS - 1;
    const fa = pa * span;
    const fd = (pa + pd) * span;
    const fr = pr * span;
    if (x <= fa && fa > 0) return Math.round(top - (x / fa) * top);
    if (x <= fd && fd > fa) return Math.round(top - (1 + (s - 1) * ((x - fa) / (fd - fa))) * top);
    if (x < span && fr > 0) return Math.round(top - Math.max(0, s * (1 - (x - fd) / fr)) * top);
    return top;
  };

  const renderEnv = () => {
    renderEnvSteps();
    const h = envHandles();
    const grid = Array.from({ length: ENV_ROWS }, () => Array(ENV_COLS).fill(" "));
    for (let x = 0; x < ENV_COLS; x += 1) {
      const row = envLevelRow(x);
      const rowNext = x + 1 < ENV_COLS ? envLevelRow(x + 1) : row;
      grid[row][x] = rowNext < row ? "/" : rowNext > row ? "\\" : row === 0 ? "‾" : row === ENV_ROWS - 1 ? "_" : "─";
    }
    [[h.xa, "A"], [h.xd, "D"], [h.xs, "S"], [h.xr, "R"]].forEach(([col, letter]) => {
      grid[envLevelRow(col)][col] = "o";
    });
    const labels = Array(ENV_COLS).fill(" ");
    labels[h.xr] = "R";
    labels[h.xs] = "S";
    labels[h.xd] = "D";
    labels[h.xa] = "A";
    const { a, d, r, s } = envStages();
    const readout = `a ${envFormat(a)}  d ${envFormat(d)}  s ${Math.round(s * 100)}%  r ${envFormat(r)}`;
    const line = (text, className) => Object.assign(document.createElement("span"), { className, textContent: text });
    envMount.replaceChildren(
      line(grid.map((cells) => cells.join("")).join("\n"), "key-guitar-env-curve"),
      line(labels.join(""), "key-guitar-env-labels"),
      line(readout, "key-guitar-env-readout"),
    );
  };

  const envSteps = () => {
    const { a, d, r, s } = envStages();
    return [
      ["attack", "a", envFormat(a)],
      ["decay", "d", envFormat(d)],
      ["sustain", "s", `${Math.round(s * 100)}%`],
      ["release", "r", envFormat(r)],
    ];
  };

  const renderEnvSteps = () => {
    if (!envStepsMount) return;
    const fragment = document.createDocumentFragment();
    envSteps().forEach(([label, stage, value]) => {
      const cell = document.createElement("div");
      cell.className = "music-selector";
      const step = (direction) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "music-selector-step";
        button.dataset.kgEnvStage = stage;
        button.dataset.kgStep = String(direction);
        button.textContent = direction < 0 ? "‹" : "›";
        button.setAttribute("aria-label", `${direction < 0 ? "shorter" : "longer"} ${label}`);
        return button;
      };
      cell.replaceChildren(
        span(`${label} :`, "music-selector-label"),
        step(-1),
        span(value, "music-selector-value"),
        step(1),
      );
      fragment.append(cell);
    });
    envStepsMount.replaceChildren(fragment);
  };

  const stepEnv = (stage, direction) => {
    const env = state.env;
    if (stage === "a") env.pa = Math.min(Math.max(env.pa + 0.02 * direction, 0.004), 0.98 - env.pd);
    else if (stage === "d") env.pd = Math.min(Math.max(env.pd + 0.02 * direction, 0.01), 0.98 - env.pa);
    else if (stage === "r") env.pr = Math.min(Math.max(env.pr + 0.02 * direction, 0.02), 0.98);
    else env.s = Math.min(Math.max(env.s + 0.05 * direction, 0), 1);
  };

  envStepsMount?.addEventListener("click", (event) => {
    const step = event.target.closest("[data-kg-env-stage]");
    if (!step) return;
    stepEnv(step.dataset.kgEnvStage, Number(step.dataset.kgStep));
    renderEnv();
  });

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
    } else if (step.dataset.kgDirection === "octave") {
      state.octaveBase = Math.max(-OCTAVE_BASE_LIMIT, Math.min(OCTAVE_BASE_LIMIT, state.octaveBase + stepDirection));
      renderOctave();
    } else if (step.dataset.kgDirection === "random") {
      randomizeGuitar();
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
    if (event.code === "Space") {
      event.preventDefault();
      setPedal(true);
      return;
    }
    const hit = hits.get(event.code);
    if (!hit) return;
    event.preventDefault();
    if (state.pressed.has(event.code)) return;
    state.pressed.add(event.code);
    press(hit);
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      setPedal(false);
      return;
    }
    if (event.key === "Shift" || event.key === "Control") {
      state.octaveHold = 0;
      renderOctave();
      return;
    }
    const hit = hits.get(event.code);
    if (!hit) return;
    state.pressed.delete(event.code);
    release(hit);
  });

  window.addEventListener("blur", () => {
    state.pressed.forEach((code) => release(hits.get(code)));
    state.pressed.clear();
    state.octaveHold = 0;
    setPedal(false);
    renderOctave();
  });

  render();
  renderOctave();
  renderControls();
  renderEnv();
})();

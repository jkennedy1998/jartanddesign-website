(() => {
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const INTERVAL_COLORS = ["#FEFFE5", "#8BF5C6", "#FFF3B3", "#4DC6E4", "#C4702B", "#F26657", "#A544FF", "#E36325", "#4477FF", "#B21535", "#2749D0", "#81172A"];
  const SCALES = [
    ["ionian", [0, 2, 4, 5, 7, 9, 11]],
    ["dorian", [0, 2, 3, 5, 7, 9, 10]],
    ["phrygian", [0, 1, 3, 5, 7, 8, 10]],
    ["lydian", [0, 2, 4, 6, 7, 9, 11]],
    ["mixolydian", [0, 2, 4, 5, 7, 9, 10]],
    ["aeolian", [0, 2, 3, 5, 7, 8, 10]],
    ["locrian", [0, 1, 3, 5, 6, 8, 10]],
    ["minor pentatonic", [0, 3, 5, 7, 10]],
    ["minor harmonic", [0, 2, 3, 5, 7, 8, 11]],
    ["mixo blues", [0, 2, 3, 4, 5, 7, 9, 10]],
  ];
  const FRETS = Array.from({ length: 12 }, (_, index) => index + 1);
  const FRET_MARKERS = new Set([3, 5, 7, 9, 12]);
  const HARMONIC_OFFSETS = new Map([[5, 0], [7, 7], [12, 0]]);
  const STANDARD_TUNING = ["E", "B", "G", "D", "A", "E"];

  const rootMount = document.querySelector("[data-root-control]");
  const scaleMount = document.querySelector("[data-scale-control]");
  const fretboardMount = document.querySelector("[data-fretboard]");
  const keyboardMount = document.querySelector("[data-keyboard]");
  const randomButton = document.querySelector("[data-randomize]");
  if (!rootMount || !scaleMount || !fretboardMount || !keyboardMount || !randomButton) return;

  const state = {
    root: "C",
    scale: "ionian",
    selected: new Set(),
    tuning: [...STANDARD_TUNING],
  };

  const noteIndex = (note) => NOTES.indexOf(note);
  const noteAt = (openNote, offset) => NOTES[(noteIndex(openNote) + offset + NOTES.length) % NOTES.length];
  const scaleIntervals = (name) => SCALES.find(([scaleName]) => scaleName === name)?.[1] || [];
  const noteSetFor = (root, intervals) => new Set(intervals.map((interval) => noteAt(root, interval)));
  const intervalsForSelection = () => [...state.selected]
    .map((note) => (noteIndex(note) - noteIndex(state.root) + NOTES.length) % NOTES.length)
    .sort((left, right) => left - right);
  const scaleForIntervals = (intervals) => SCALES.find(([, shape]) => shape.join(",") === intervals.join(","))?.[0] || "custom";
  const intervalFor = (note) => (noteIndex(note) - noteIndex(state.root) + NOTES.length) % NOTES.length;
  const colorFor = (note) => INTERVAL_COLORS[intervalFor(note)];

  const makeButton = (label, className, dataName, dataValue, ariaLabel) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset[dataName] = String(dataValue);
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    return button;
  };

  const noteButton = (note, className, label = note) => {
    const selected = state.selected.has(note);
    const button = makeButton(label, `${className}${selected ? " is-on" : " is-off"}`, "note", note, `${note} ${selected ? "on" : "off"}`);
    button.setAttribute("aria-pressed", String(selected));
    button.style.setProperty("--music-note-color", colorFor(note));
    return button;
  };

  const renderSelector = (mount, label, value, directionName, valueClass = "") => {
    mount.replaceChildren(
      Object.assign(document.createElement("span"), { className: "music-selector-label", textContent: `${label} :` }),
      makeButton("‹", "music-selector-step", directionName, -1, `previous ${label}`),
      Object.assign(document.createElement("span"), { className: `music-selector-value ${valueClass}`, textContent: value }),
      makeButton("›", "music-selector-step", directionName, 1, `next ${label}`),
    );
  };

  const renderSelectors = () => {
    renderSelector(rootMount, "root note", state.root, "rootDirection", "music-root-value");
    renderSelector(scaleMount, "scale", state.scale, "scaleDirection");
  };

  const renderFretboard = () => {
    const fragment = document.createDocumentFragment();
    const header = document.createElement("div");
    header.className = "music-fret-row music-fret-labels";
    header.append(Object.assign(document.createElement("span"), { textContent: "0" }));
    FRETS.forEach((fret) => {
      const label = document.createElement("span");
      label.textContent = FRET_MARKERS.has(fret) ? fret : "_";
      header.append(label);
    });
    header.append(Object.assign(document.createElement("span"), { className: "music-fret-end", textContent: "│" }));
    fragment.append(header);

    state.tuning.forEach((openNote, stringIndex) => {
      const row = document.createElement("div");
      row.className = "music-fret-row";
      const stringTuning = document.createElement("span");
      stringTuning.className = "music-string-tuning";
      const openSelected = state.selected.has(openNote);
      const stringLabel = Object.assign(document.createElement("span"), {
        className: `music-string-label ${openSelected ? "is-on" : "is-off"}`,
        textContent: openNote,
      });
      stringLabel.style.setProperty("--music-note-color", colorFor(openNote));
      stringTuning.append(
        makeButton("‹", "music-tuning-step", "tuningDirection", -1, `lower string ${stringIndex + 1} one semitone`),
        stringLabel,
        makeButton("›", "music-tuning-step", "tuningDirection", 1, `raise string ${stringIndex + 1} one semitone`),
      );
      stringTuning.querySelectorAll("[data-tuning-direction]").forEach((step) => { step.dataset.stringIndex = String(stringIndex); });
      row.append(stringTuning);
      FRETS.forEach((fret) => {
        const fretNote = noteButton(noteAt(openNote, fret), "music-fret-note");
        if (fret === 1 && openSelected) {
          fretNote.classList.add("is-open-marker");
          fretNote.style.setProperty("--music-marker-color", colorFor(openNote));
        }
        const harmonicOffset = HARMONIC_OFFSETS.get(fret);
        if (harmonicOffset !== undefined) {
          const harmonicNote = noteAt(openNote, harmonicOffset);
          if (state.selected.has(harmonicNote)) {
            fretNote.classList.add("is-harmonic");
            fretNote.style.setProperty("--music-marker-color", colorFor(harmonicNote));
          }
        }
        row.append(fretNote);
      });
      row.append(Object.assign(document.createElement("span"), { className: "music-fret-end", textContent: "│" }));
      fragment.append(row);
    });
    fretboardMount.replaceChildren(fragment);
  };

  const renderKeyboard = () => {
    const naturals = ["C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B"];
    const sharpsAfter = new Map([[0, "C#"], [1, "D#"], [3, "F#"], [4, "G#"], [5, "A#"], [7, "C#"], [8, "D#"], [10, "F#"], [11, "G#"], [12, "A#"]]);
    const frame = Object.assign(document.createElement("div"), { className: "music-piano-frame" });
    const sharpRow = Object.assign(document.createElement("div"), { className: "music-piano-row music-piano-sharps" });
    const naturalRow = Object.assign(document.createElement("div"), { className: "music-piano-row music-piano-naturals" });
    const topBorder = Object.assign(document.createElement("div"), { className: "music-piano-border" });
    const bottomBorder = Object.assign(document.createElement("div"), { className: "music-piano-border" });
    const place = (element, column, row, width = 1, height = 1) => {
      element.style.gridColumn = `${column} / span ${width}`;
      element.style.gridRow = `${row} / span ${height}`;
      return element;
    };
    const appendBorderSegment = (border, note, index, leading, joint, row) => {
      const selected = state.selected.has(note);
      const segment = Object.assign(document.createElement("span"), {
        className: `music-piano-border-segment ${selected ? "is-on" : "is-off"}`,
        textContent: `${index === 0 ? leading : joint}──`,
      });
      segment.style.setProperty("--music-note-color", colorFor(note));
      segment.dataset.pianoKey = `natural-${index}`;
      border.append(place(segment, index * 3 + 1, row, 3));
    };

    naturals.forEach((note, index) => {
      const sharp = sharpsAfter.get(index);
      if (sharp) {
        const sharpKey = noteButton(sharp, "music-piano-key music-piano-sharp", "┌#┐\n└─┘");
        sharpRow.append(place(sharpKey, (index + 1) * 3, 1, 3, 2));
      }
      appendBorderSegment(topBorder, note, index, "┌", "┬", 1);
      const naturalKey = noteButton(note, "music-piano-key music-piano-natural");
      naturalKey.dataset.pianoKey = `natural-${index}`;
      const naturalLabel = Object.assign(document.createElement("span"), { className: "music-piano-natural-label", textContent: note });
      naturalKey.replaceChildren(naturalLabel);
      naturalRow.append(place(naturalKey, index * 3 + 1, 2, 3, 2));
      appendBorderSegment(bottomBorder, note, index, "└", "┴", 4);
    });

    const lastNote = naturals[naturals.length - 1];
    const lastSelected = state.selected.has(lastNote);
    const keyEnd = (label, row, height = 1) => {
      const end = Object.assign(document.createElement("span"), {
        className: `music-piano-key-end ${lastSelected ? "is-on" : "is-off"}`,
        textContent: label,
      });
      end.style.setProperty("--music-note-color", colorFor(lastNote));
      end.dataset.pianoKey = `natural-${naturals.length - 1}`;
      return place(end, 43, row, 1, height);
    };
    frame.append(
      sharpRow,
      topBorder,
      naturalRow,
      bottomBorder,
      keyEnd("┐", 1),
      keyEnd("│\n│", 2, 2),
      keyEnd("┘", 4),
    );
    keyboardMount.replaceChildren(frame);
  };

  const render = () => {
    renderSelectors();
    renderFretboard();
    renderKeyboard();
  };

  const setRoot = (nextRoot) => {
    const intervals = intervalsForSelection();
    state.root = nextRoot;
    state.selected = noteSetFor(state.root, intervals);
    state.scale = scaleForIntervals(intervals);
    render();
  };

  const setScale = (nextScale) => {
    state.scale = nextScale;
    state.selected = noteSetFor(state.root, scaleIntervals(nextScale));
    render();
  };

  rootMount.addEventListener("click", (event) => {
    const step = event.target.closest("[data-root-direction]");
    if (step) setRoot(noteAt(state.root, Number(step.dataset.rootDirection)));
  });
  scaleMount.addEventListener("click", (event) => {
    const step = event.target.closest("[data-scale-direction]");
    if (!step) return;
    const direction = Number(step.dataset.scaleDirection);
    const currentIndex = SCALES.findIndex(([name]) => name === state.scale);
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : SCALES.length - 1)
      : (currentIndex + direction + SCALES.length) % SCALES.length;
    setScale(SCALES[nextIndex][0]);
  });
  randomButton.addEventListener("click", () => {
    const nextRoot = NOTES[Math.floor(Math.random() * NOTES.length)];
    let nextScale = SCALES[Math.floor(Math.random() * SCALES.length)][0];
    if (nextRoot === state.root && nextScale === state.scale) {
      nextScale = SCALES[(SCALES.findIndex(([name]) => name === state.scale) + 1) % SCALES.length][0];
    }
    state.root = nextRoot;
    state.scale = nextScale;
    state.selected = noteSetFor(state.root, scaleIntervals(state.scale));
    render();
  });
  const setPianoHover = (key, isHovered) => {
    keyboardMount.querySelectorAll(`[data-piano-key="${key}"]`).forEach((element) => {
      element.classList.toggle("is-hovered", isHovered);
    });
  };
  keyboardMount.addEventListener("mouseover", (event) => {
    const key = event.target.closest(".music-piano-natural");
    if (key && !key.contains(event.relatedTarget)) setPianoHover(key.dataset.pianoKey, true);
  });
  keyboardMount.addEventListener("mouseout", (event) => {
    const key = event.target.closest(".music-piano-natural");
    if (key && !key.contains(event.relatedTarget)) setPianoHover(key.dataset.pianoKey, false);
  });
  keyboardMount.addEventListener("focusin", (event) => {
    const key = event.target.closest(".music-piano-natural");
    if (key) setPianoHover(key.dataset.pianoKey, true);
  });
  keyboardMount.addEventListener("focusout", (event) => {
    const key = event.target.closest(".music-piano-natural");
    if (key) setPianoHover(key.dataset.pianoKey, false);
  });

  [fretboardMount, keyboardMount].forEach((mount) => {
    mount.addEventListener("click", (event) => {
      const tuningStep = event.target.closest("[data-tuning-direction]");
      if (tuningStep) {
        const stringIndex = Number(tuningStep.dataset.stringIndex);
        state.tuning[stringIndex] = noteAt(state.tuning[stringIndex], Number(tuningStep.dataset.tuningDirection));
        render();
        return;
      }
      const note = event.target.closest("[data-note]")?.dataset.note;
      if (!note) return;
      if (state.selected.has(note)) state.selected.delete(note);
      else state.selected.add(note);
      state.scale = scaleForIntervals(intervalsForSelection());
      render();
    });
  });

  setScale(state.scale);
})();

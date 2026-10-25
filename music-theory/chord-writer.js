(() => {
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const INTERVAL_COLORS = ["#FEFFE5", "#8BF5C6", "#FFF3B3", "#4DC6E4", "#C4702B", "#F26657", "#A544FF", "#E36325", "#4477FF", "#B21535", "#2749D0", "#81172A"];
  const FRETS = Array.from({ length: 12 }, (_, index) => index + 1);
  const FRET_MARKERS = new Set([3, 5, 7, 9, 12]);
  const STANDARD_TUNING = ["E", "B", "G", "D", "A", "E"];
  const NATURALS = ["C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B"];
  const SHARPS_AFTER = new Map([[0, "C#"], [1, "D#"], [3, "F#"], [4, "G#"], [5, "A#"], [7, "C#"], [8, "D#"], [10, "F#"], [11, "G#"], [12, "A#"]]);
  const STORAGE_KEY = "jartanddesign:chord-writer:v1";

  const fretboardMount = document.querySelector("[data-chord-fretboard]");
  const keyboardMount = document.querySelector("[data-chord-keyboard]");
  const groupsMount = document.querySelector("[data-chord-groups]");
  const saveButton = document.querySelector("[data-save-chord]");
  const clearButton = document.querySelector("[data-clear-chord]");
  const addGroupButton = document.querySelector("[data-add-group]");
  const copyTextButton = document.querySelector("[data-copy-text]");
  const saveTextButton = document.querySelector("[data-save-text]");
  const clearSongButton = document.querySelector("[data-clear-song]");
  const loadTextButton = document.querySelector("[data-load-text]");
  const loadFileInput = document.querySelector("[data-load-file]");
  if (!fretboardMount || !keyboardMount || !groupsMount || !saveButton || !clearButton || !addGroupButton
    || !copyTextButton || !saveTextButton || !clearSongButton || !loadTextButton || !loadFileInput) return;

  const noteIndex = (note) => NOTES.indexOf(note);
  const noteAt = (openNote, offset) => NOTES[(noteIndex(openNote) + offset + NOTES.length) % NOTES.length];
  const intervalFor = (note) => (noteIndex(note) - noteIndex(state.root) + NOTES.length) % NOTES.length;
  const colorFor = (note) => INTERVAL_COLORS[intervalFor(note)];
  const pianoNoteForId = (id) => (id.startsWith("sharp-") ? SHARPS_AFTER.get(Number(id.slice(6))) : NATURALS[Number(id.slice(8))]);
  const pianoIdForNote = (note) => {
    const naturalIndex = NATURALS.indexOf(note);
    if (naturalIndex !== -1) return `natural-${naturalIndex}`;
    const sharpEntry = [...SHARPS_AFTER].find(([, sharpNote]) => sharpNote === note);
    return sharpEntry ? `sharp-${sharpEntry[0]}` : "natural-0";
  };
  const makeId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const span = (text, className = "") => Object.assign(document.createElement("span"), { className, textContent: text });

  const loadState = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return parsed && Array.isArray(parsed.groups) ? parsed : null;
    } catch {
      return null;
    }
  };

  const saved = loadState();
  const state = {
    root: document.documentElement.dataset.musicRoot || "C",
    tuning: saved?.tuning?.length === 6 ? saved.tuning : [...STANDARD_TUNING],
    guitarSelected: new Set(),
    pianoSelected: new Set(),
    groups: saved?.groups || [],
    activeGroupId: saved?.activeGroupId ?? null,
    editingChordId: null,
    editingGroupId: null,
  };

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tuning: state.tuning,
        groups: state.groups,
        activeGroupId: state.activeGroupId,
      }));
    } catch {
      // storage unavailable — chord sections just won't survive a reload
    }
  };

  const makeStepButton = (label, dataValue, stringIndex, ariaLabel) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "music-tuning-step";
    button.dataset.tuningDirection = String(dataValue);
    button.dataset.stringIndex = String(stringIndex);
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    return button;
  };

  const renderFretboard = () => {
    const fragment = document.createDocumentFragment();
    const header = document.createElement("div");
    header.className = "music-fret-row music-fret-labels";
    header.append(span("0"));
    FRETS.forEach((fret) => header.append(span(FRET_MARKERS.has(fret) ? String(fret) : "_")));
    header.append(span("│", "music-fret-end"));
    fragment.append(header);

    state.tuning.forEach((openNote, stringIndex) => {
      const row = document.createElement("div");
      row.className = "music-fret-row";
      const stringTuning = document.createElement("span");
      stringTuning.className = "music-string-tuning";
      const openKey = `${stringIndex}-0`;
      const openOn = state.guitarSelected.has(openKey);
      const stringLabel = document.createElement("button");
      stringLabel.type = "button";
      stringLabel.className = `music-string-label chord-open-toggle ${openOn ? "is-on" : "is-off"}`;
      stringLabel.dataset.guitarKey = openKey;
      stringLabel.textContent = openNote;
      stringLabel.style.setProperty("--music-note-color", colorFor(openNote));
      stringLabel.setAttribute("aria-pressed", String(openOn));
      stringLabel.setAttribute("aria-label", `string ${stringIndex + 1} open ${openNote} ${openOn ? "on" : "off"}`);
      stringTuning.append(
        makeStepButton("‹", -1, stringIndex, `lower string ${stringIndex + 1} one semitone`),
        stringLabel,
        makeStepButton("›", 1, stringIndex, `raise string ${stringIndex + 1} one semitone`),
      );
      row.append(stringTuning);
      FRETS.forEach((fret) => {
        const note = noteAt(openNote, fret);
        const key = `${stringIndex}-${fret}`;
        const on = state.guitarSelected.has(key);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `music-fret-note ${on ? "is-on" : "is-off"}`;
        button.dataset.guitarKey = key;
        button.textContent = note;
        button.style.setProperty("--music-note-color", colorFor(note));
        button.setAttribute("aria-pressed", String(on));
        button.setAttribute("aria-label", `string ${stringIndex + 1} fret ${fret} ${note} ${on ? "on" : "off"}`);
        if (fret === 1 && openOn) {
          button.classList.add("is-open-marker");
          button.style.setProperty("--music-marker-color", colorFor(openNote));
        }
        row.append(button);
      });
      row.append(span("│", "music-fret-end"));
      fragment.append(row);
    });
    fretboardMount.replaceChildren(fragment);
  };

  const place = (element, column, row, width = 1, height = 1) => {
    element.style.gridColumn = `${column} / span ${width}`;
    element.style.gridRow = `${row} / span ${height}`;
    return element;
  };

  const renderKeyboard = () => {
    const frame = document.createElement("div");
    frame.className = "music-piano-frame";
    const sharpRow = document.createElement("div");
    sharpRow.className = "music-piano-row music-piano-sharps";
    const naturalRow = document.createElement("div");
    naturalRow.className = "music-piano-row music-piano-naturals";
    const topBorder = document.createElement("div");
    topBorder.className = "music-piano-border";
    const bottomBorder = document.createElement("div");
    bottomBorder.className = "music-piano-border";

    const appendBorderSegment = (border, index, leading, joint, row) => {
      const id = `natural-${index}`;
      const on = state.pianoSelected.has(id);
      const segment = span(`${index === 0 ? leading : joint}──`, `music-piano-border-segment ${on ? "is-on" : "is-off"}`);
      segment.style.setProperty("--music-note-color", colorFor(NATURALS[index]));
      segment.dataset.pianoKey = id;
      border.append(place(segment, index * 3 + 1, row, 3));
    };

    NATURALS.forEach((note, index) => {
      const sharpNote = SHARPS_AFTER.get(index);
      if (sharpNote) {
        const id = `sharp-${index}`;
        const on = state.pianoSelected.has(id);
        const sharpKey = document.createElement("button");
        sharpKey.type = "button";
        sharpKey.className = `music-piano-key music-piano-sharp ${on ? "is-on" : "is-off"}`;
        sharpKey.dataset.pianoId = id;
        sharpKey.dataset.pianoKey = id;
        sharpKey.textContent = "┌#┐\n└─┘";
        sharpKey.style.setProperty("--music-note-color", colorFor(sharpNote));
        sharpKey.setAttribute("aria-pressed", String(on));
        sharpKey.setAttribute("aria-label", `${sharpNote} ${on ? "on" : "off"}`);
        sharpRow.append(place(sharpKey, (index + 1) * 3, 1, 3, 2));
      }
      appendBorderSegment(topBorder, index, "┌", "┬", 1);
      const naturalId = `natural-${index}`;
      const naturalOn = state.pianoSelected.has(naturalId);
      const naturalKey = document.createElement("button");
      naturalKey.type = "button";
      naturalKey.className = `music-piano-key music-piano-natural ${naturalOn ? "is-on" : "is-off"}`;
      naturalKey.dataset.pianoId = naturalId;
      naturalKey.dataset.pianoKey = naturalId;
      naturalKey.style.setProperty("--music-note-color", colorFor(note));
      naturalKey.setAttribute("aria-pressed", String(naturalOn));
      naturalKey.setAttribute("aria-label", `${note} ${naturalOn ? "on" : "off"}`);
      naturalKey.append(span(note, "music-piano-natural-label"));
      naturalRow.append(place(naturalKey, index * 3 + 1, 2, 3, 2));
      appendBorderSegment(bottomBorder, index, "└", "┴", 4);
    });

    const lastIndex = NATURALS.length - 1;
    const lastId = `natural-${lastIndex}`;
    const lastOn = state.pianoSelected.has(lastId);
    const keyEnd = (label, row, height = 1) => {
      const end = span(label, `music-piano-key-end ${lastOn ? "is-on" : "is-off"}`);
      end.style.setProperty("--music-note-color", colorFor(NATURALS[lastIndex]));
      end.dataset.pianoKey = lastId;
      return place(end, 43, row, 1, height);
    };

    frame.append(
      sharpRow, topBorder, naturalRow, bottomBorder,
      keyEnd("┐", 1), keyEnd("│\n│", 2, 2), keyEnd("┘", 4),
    );
    keyboardMount.replaceChildren(frame);
  };

  const renderBoard = () => {
    renderFretboard();
    renderKeyboard();
  };

  const moveButton = (label, dataName, dataValue, ariaLabel, disabled) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "music-tuning-step chord-move-step";
    button.dataset[dataName] = String(dataValue);
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    if (disabled) button.disabled = true;
    return button;
  };

  const fretRangeFor = (chord) => {
    const fretted = chord.guitar.filter((entry) => entry.fret > 0).map((entry) => entry.fret);
    if (!fretted.length) return [];
    const min = Math.min(...fretted);
    const max = Math.max(...fretted);
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  };

  const renderChordFretMini = (chord) => {
    const fretRange = fretRangeFor(chord);
    const columns = `7ch repeat(${fretRange.length}, 3ch) 1ch`;
    const wrap = document.createElement("div");
    wrap.className = "chord-card-fretboard";

    if (fretRange.length) {
      const header = document.createElement("div");
      header.className = "music-fret-row music-fret-labels chord-card-fret-row";
      header.style.gridTemplateColumns = columns;
      header.append(span(""));
      fretRange.forEach((fret) => header.append(span(String(fret))));
      header.append(span("│", "music-fret-end"));
      wrap.append(header);
    }

    chord.tuning.forEach((openNote, stringIndex) => {
      const row = document.createElement("div");
      row.className = "music-fret-row chord-card-fret-row";
      row.style.gridTemplateColumns = columns;
      const openOn = chord.guitar.some((entry) => entry.stringIndex === stringIndex && entry.fret === 0);
      const label = span(openNote, `music-string-label ${openOn ? "is-on" : "is-off"}`);
      label.style.setProperty("--music-note-color", colorFor(openNote));
      row.append(label);
      fretRange.forEach((fret) => {
        const note = noteAt(openNote, fret);
        const pressed = chord.guitar.some((entry) => entry.stringIndex === stringIndex && entry.fret === fret);
        const cell = span(note, `music-fret-note ${pressed ? "is-on" : "is-off"}`);
        cell.style.setProperty("--music-note-color", colorFor(note));
        if (fret === 1 && openOn) {
          cell.classList.add("is-open-marker");
          cell.style.setProperty("--music-marker-color", colorFor(openNote));
        }
        row.append(cell);
      });
      row.append(span("│", "music-fret-end"));
      wrap.append(row);
    });
    return wrap;
  };

  const renderChordPianoMini = (chord) => {
    const line = document.createElement("div");
    line.className = "chord-card-piano";
    const seen = new Set();
    chord.piano.forEach(({ note }) => {
      if (seen.has(note)) return;
      seen.add(note);
      const noteSpan = span(note, "chord-card-piano-note");
      noteSpan.style.setProperty("--music-note-color", colorFor(note));
      line.append(noteSpan);
    });
    return line;
  };

  const renderChordCard = (chord, group, chordIndex) => {
    const card = document.createElement("div");
    card.className = `chord-card ${chord.id === state.editingChordId ? "is-editing" : ""}`;
    card.draggable = true;
    card.dataset.chordId = chord.id;
    card.dataset.groupId = group.id;

    const duplicateButton = document.createElement("button");
    duplicateButton.type = "button";
    duplicateButton.className = "music-tuning-step chord-card-duplicate";
    duplicateButton.textContent = "dup";
    duplicateButton.dataset.duplicateChord = chord.id;
    duplicateButton.setAttribute("aria-label", "duplicate chord");

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "music-tuning-step chord-card-delete";
    deleteButton.textContent = "×";
    deleteButton.dataset.deleteChord = chord.id;
    deleteButton.setAttribute("aria-label", "delete chord");

    const moveSelect = document.createElement("select");
    moveSelect.className = "chord-card-move-select";
    moveSelect.dataset.moveToGroup = chord.id;
    moveSelect.setAttribute("aria-label", "move chord to section");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "move to…";
    placeholder.disabled = true;
    placeholder.selected = true;
    moveSelect.append(placeholder);
    const otherGroups = state.groups.filter((candidate) => candidate.id !== group.id);
    otherGroups.forEach((otherGroup) => {
      const option = document.createElement("option");
      option.value = otherGroup.id;
      option.textContent = otherGroup.name;
      moveSelect.append(option);
    });
    moveSelect.disabled = otherGroups.length === 0;

    const controls = document.createElement("div");
    controls.className = "chord-card-controls";
    controls.append(
      moveButton("^", "moveChordUp", chord.id, "move chord earlier", chordIndex === 0),
      moveButton("v", "moveChordDown", chord.id, "move chord later", chordIndex === group.chords.length - 1),
      duplicateButton,
      moveSelect,
      deleteButton,
    );
    if (chord.id === state.editingChordId) controls.append(span("editing", "chord-card-editing-tag"));
    card.append(controls);

    if (chord.guitar.length) card.append(renderChordFretMini(chord));
    if (chord.piano.length) card.append(renderChordPianoMini(chord));
    return card;
  };

  const renderGroups = () => {
    const fragment = document.createDocumentFragment();
    state.groups.forEach((group, groupIndex) => {
      const card = document.createElement("div");
      card.className = `chord-group ${group.id === state.activeGroupId ? "is-active" : ""}`;
      card.dataset.selectGroup = group.id;

      const header = document.createElement("div");
      header.className = "chord-group-header";

      const moveControls = document.createElement("span");
      moveControls.className = "chord-group-move";
      moveControls.append(
        moveButton("^", "moveGroupUp", group.id, "move section earlier", groupIndex === 0),
        moveButton("v", "moveGroupDown", group.id, "move section later", groupIndex === state.groups.length - 1),
      );

      const name = span(group.name, "chord-group-name");

      const renameButton = document.createElement("button");
      renameButton.type = "button";
      renameButton.className = "music-tuning-step chord-group-rename-trigger";
      renameButton.textContent = "rename";
      renameButton.dataset.renameGroup = group.id;
      renameButton.setAttribute("aria-label", `rename ${group.name} section`);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "music-tuning-step chord-group-delete";
      deleteButton.textContent = "×";
      deleteButton.dataset.deleteGroup = group.id;
      deleteButton.setAttribute("aria-label", `delete ${group.name} section`);

      header.append(moveControls, name, renameButton, deleteButton);

      const list = document.createElement("div");
      list.className = "chord-group-list";
      list.dataset.groupList = group.id;
      group.chords.forEach((chord, chordIndex) => list.append(renderChordCard(chord, group, chordIndex)));

      card.append(header, list);
      fragment.append(card);
    });
    groupsMount.replaceChildren(fragment);
  };

  fretboardMount.addEventListener("click", (event) => {
    const tuningStep = event.target.closest("[data-tuning-direction]");
    if (tuningStep) {
      const stringIndex = Number(tuningStep.dataset.stringIndex);
      state.tuning[stringIndex] = noteAt(state.tuning[stringIndex], Number(tuningStep.dataset.tuningDirection));
      renderFretboard();
      persist();
      return;
    }
    const key = event.target.closest("[data-guitar-key]")?.dataset.guitarKey;
    if (!key) return;
    if (state.guitarSelected.has(key)) state.guitarSelected.delete(key);
    else state.guitarSelected.add(key);
    renderFretboard();
  });

  keyboardMount.addEventListener("click", (event) => {
    const id = event.target.closest("[data-piano-id]")?.dataset.pianoId;
    if (!id) return;
    if (state.pianoSelected.has(id)) state.pianoSelected.delete(id);
    else state.pianoSelected.add(id);
    renderKeyboard();
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

  const updateSaveButtonLabel = () => {
    saveButton.textContent = state.editingChordId ? "update chord" : "save chord";
  };

  const findChord = (chordId) => {
    const group = state.groups.find((candidate) => candidate.chords.some((chord) => chord.id === chordId));
    return group ? { group, chord: group.chords.find((chord) => chord.id === chordId) } : null;
  };

  const stopEditing = () => {
    state.editingChordId = null;
    state.editingGroupId = null;
    updateSaveButtonLabel();
  };

  const startEditingChord = (chordId) => {
    const found = findChord(chordId);
    if (!found) return;
    state.tuning = [...found.chord.tuning];
    state.guitarSelected = new Set(found.chord.guitar.map((entry) => `${entry.stringIndex}-${entry.fret}`));
    state.pianoSelected = new Set(found.chord.piano.map((entry) => entry.id));
    state.editingChordId = found.chord.id;
    state.editingGroupId = found.group.id;
    state.activeGroupId = found.group.id;
    updateSaveButtonLabel();
    renderBoard();
    renderGroups();
  };

  saveButton.addEventListener("click", () => {
    if (state.guitarSelected.size === 0 && state.pianoSelected.size === 0) return;
    const guitar = [...state.guitarSelected].map((key) => {
      const [stringIndex, fret] = key.split("-").map(Number);
      return { stringIndex, fret, note: fret === 0 ? state.tuning[stringIndex] : noteAt(state.tuning[stringIndex], fret) };
    });
    const piano = [...state.pianoSelected].map((id) => ({ id, note: pianoNoteForId(id) }));

    if (state.editingChordId) {
      const found = findChord(state.editingChordId);
      if (found) {
        found.chord.tuning = [...state.tuning];
        found.chord.guitar = guitar;
        found.chord.piano = piano;
      }
      stopEditing();
    } else {
      if (!state.groups.some((group) => group.id === state.activeGroupId)) {
        const group = { id: makeId(), name: "chords", chords: [] };
        state.groups.push(group);
        state.activeGroupId = group.id;
      }
      state.groups.find((group) => group.id === state.activeGroupId).chords.push({
        id: makeId(),
        tuning: [...state.tuning],
        guitar,
        piano,
      });
    }
    state.guitarSelected.clear();
    state.pianoSelected.clear();
    renderBoard();
    renderGroups();
    persist();
  });

  clearButton.addEventListener("click", () => {
    state.guitarSelected.clear();
    state.pianoSelected.clear();
    stopEditing();
    renderBoard();
    renderGroups();
  });

  addGroupButton.addEventListener("click", () => {
    const group = { id: makeId(), name: `section ${state.groups.length + 1}`, chords: [] };
    state.groups.push(group);
    state.activeGroupId = group.id;
    renderGroups();
    persist();
  });

  const moveChord = (chordId, direction) => {
    const group = state.groups.find((candidate) => candidate.chords.some((chord) => chord.id === chordId));
    if (!group) return;
    const index = group.chords.findIndex((chord) => chord.id === chordId);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= group.chords.length) return;
    [group.chords[index], group.chords[targetIndex]] = [group.chords[targetIndex], group.chords[index]];
    renderGroups();
    persist();
  };

  const moveGroup = (groupId, direction) => {
    const index = state.groups.findIndex((group) => group.id === groupId);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= state.groups.length) return;
    [state.groups[index], state.groups[targetIndex]] = [state.groups[targetIndex], state.groups[index]];
    renderGroups();
    persist();
  };

  const moveChordToGroup = (chordId, targetGroupId) => {
    let moved = null;
    state.groups.forEach((group) => {
      const index = group.chords.findIndex((chord) => chord.id === chordId);
      if (index !== -1) moved = group.chords.splice(index, 1)[0];
    });
    if (!moved) return;
    const target = state.groups.find((group) => group.id === targetGroupId);
    if (target) target.chords.push(moved);
    renderGroups();
    persist();
  };

  const duplicateChord = (chordId) => {
    const found = findChord(chordId);
    if (!found) return;
    const index = found.group.chords.findIndex((chord) => chord.id === chordId);
    const clone = JSON.parse(JSON.stringify(found.chord));
    clone.id = makeId();
    found.group.chords.splice(index + 1, 0, clone);
    renderGroups();
    persist();
  };

  const startGroupRename = (group, nameElement) => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "chord-group-rename";
    input.value = group.name;
    nameElement.replaceWith(input);
    input.focus();
    input.select();
    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      group.name = input.value.trim() || group.name;
      renderGroups();
      persist();
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      renderGroups();
    };
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") commit();
      else if (keyEvent.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);
  };

  groupsMount.addEventListener("click", (event) => {
    const moveChordUp = event.target.closest("[data-move-chord-up]");
    if (moveChordUp) {
      moveChord(moveChordUp.dataset.moveChordUp, -1);
      return;
    }
    const moveChordDown = event.target.closest("[data-move-chord-down]");
    if (moveChordDown) {
      moveChord(moveChordDown.dataset.moveChordDown, 1);
      return;
    }
    const moveGroupUp = event.target.closest("[data-move-group-up]");
    if (moveGroupUp) {
      moveGroup(moveGroupUp.dataset.moveGroupUp, -1);
      return;
    }
    const moveGroupDown = event.target.closest("[data-move-group-down]");
    if (moveGroupDown) {
      moveGroup(moveGroupDown.dataset.moveGroupDown, 1);
      return;
    }
    const duplicateChordButton = event.target.closest("[data-duplicate-chord]");
    if (duplicateChordButton) {
      duplicateChord(duplicateChordButton.dataset.duplicateChord);
      return;
    }
    const moveSelect = event.target.closest("[data-move-to-group]");
    if (moveSelect) return;
    const deleteChord = event.target.closest("[data-delete-chord]");
    if (deleteChord) {
      const chordId = deleteChord.dataset.deleteChord;
      if (state.editingChordId === chordId) stopEditing();
      state.groups.forEach((group) => { group.chords = group.chords.filter((chord) => chord.id !== chordId); });
      renderGroups();
      persist();
      return;
    }
    const deleteGroup = event.target.closest("[data-delete-group]");
    if (deleteGroup) {
      const id = deleteGroup.dataset.deleteGroup;
      if (state.editingGroupId === id) stopEditing();
      state.groups = state.groups.filter((group) => group.id !== id);
      if (state.activeGroupId === id) state.activeGroupId = state.groups[0]?.id ?? null;
      renderGroups();
      persist();
      return;
    }
    const renameTrigger = event.target.closest("[data-rename-group]");
    if (renameTrigger) {
      const group = state.groups.find((candidate) => candidate.id === renameTrigger.dataset.renameGroup);
      if (group) startGroupRename(group, renameTrigger.previousElementSibling);
      return;
    }
    const chordCard = event.target.closest("[data-chord-id]");
    if (chordCard) {
      startEditingChord(chordCard.dataset.chordId);
      return;
    }
    const groupCard = event.target.closest("[data-select-group]");
    if (groupCard) {
      state.activeGroupId = groupCard.dataset.selectGroup;
      renderGroups();
      persist();
    }
  });

  groupsMount.addEventListener("change", (event) => {
    const moveSelect = event.target.closest("[data-move-to-group]");
    if (!moveSelect || !moveSelect.value) return;
    moveChordToGroup(moveSelect.dataset.moveToGroup, moveSelect.value);
  });

  groupsMount.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-chord-id]");
    if (!card) return;
    event.dataTransfer.setData("text/plain", card.dataset.chordId);
    event.dataTransfer.effectAllowed = "move";
  });

  groupsMount.addEventListener("dragover", (event) => {
    if (event.target.closest("[data-group-list]")) event.preventDefault();
  });

  groupsMount.addEventListener("drop", (event) => {
    const list = event.target.closest("[data-group-list]");
    if (!list) return;
    event.preventDefault();
    const chordId = event.dataTransfer.getData("text/plain");
    if (!chordId) return;
    moveChordToGroup(chordId, list.dataset.groupList);
  });

  window.addEventListener("music-theory:root", (event) => {
    state.root = event.detail.root;
    renderBoard();
    renderGroups();
  });

  const notesForChord = (chord) => {
    const notes = [];
    chord.guitar.forEach((entry) => { if (!notes.includes(entry.note)) notes.push(entry.note); });
    chord.piano.forEach((entry) => { if (!notes.includes(entry.note)) notes.push(entry.note); });
    return notes;
  };

  const buildExportData = () => ({
    root: state.root,
    tuning: state.tuning,
    sections: state.groups.map((group) => ({
      name: group.name,
      chords: group.chords.map((chord) => ({
        notes: notesForChord(chord),
        guitar: chord.guitar.map((entry) => ({ string: entry.stringIndex + 1, fret: entry.fret, note: entry.note })),
        piano: chord.piano.map((entry) => entry.note),
      })),
    })),
  });

  const exportText = () => JSON.stringify(buildExportData(), null, 2);

  const flashButtonLabel = (button, text, revertTo) => {
    button.textContent = text;
    setTimeout(() => { button.textContent = revertTo; }, 1200);
  };

  copyTextButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      flashButtonLabel(copyTextButton, "copied!", "copy as text");
    } catch {
      flashButtonLabel(copyTextButton, "copy failed", "copy as text");
    }
  });

  saveTextButton.addEventListener("click", () => {
    const blob = new Blob([exportText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "chord-writer-song.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  clearSongButton.addEventListener("click", () => {
    if (state.groups.length === 0) return;
    if (!window.confirm("Clear the whole song? This removes every section and chord.")) return;
    state.groups = [];
    state.activeGroupId = null;
    stopEditing();
    state.guitarSelected.clear();
    state.pianoSelected.clear();
    renderBoard();
    renderGroups();
    persist();
  });

  const buildStateFromImport = (data) => {
    if (!data || typeof data !== "object" || !Array.isArray(data.sections)) throw new Error("not a chord-writer song export");
    const tuning = Array.isArray(data.tuning) && data.tuning.length === 6 ? data.tuning : [...STANDARD_TUNING];
    const groups = data.sections.map((section) => ({
      id: makeId(),
      name: typeof section.name === "string" && section.name.trim() ? section.name : "section",
      chords: (Array.isArray(section.chords) ? section.chords : []).map((chord) => ({
        id: makeId(),
        tuning: [...tuning],
        guitar: (Array.isArray(chord.guitar) ? chord.guitar : []).map((entry) => ({
          stringIndex: Number(entry.string) - 1,
          fret: Number(entry.fret),
          note: entry.note,
        })),
        piano: (Array.isArray(chord.piano) ? chord.piano : []).map((note) => ({ id: pianoIdForNote(note), note })),
      })),
    }));
    return { tuning, groups };
  };

  loadTextButton.addEventListener("click", () => loadFileInput.click());

  loadFileInput.addEventListener("change", async () => {
    const file = loadFileInput.files[0];
    loadFileInput.value = "";
    if (!file) return;
    try {
      const next = buildStateFromImport(JSON.parse(await file.text()));
      if (!window.confirm(`Load "${file.name}"? This replaces your current song.`)) return;
      state.tuning = next.tuning;
      state.groups = next.groups;
      state.activeGroupId = next.groups[0]?.id ?? null;
      stopEditing();
      state.guitarSelected.clear();
      state.pianoSelected.clear();
      renderBoard();
      renderGroups();
      persist();
    } catch {
      flashButtonLabel(loadTextButton, "load failed", "load");
    }
  });

  updateSaveButtonLabel();
  renderBoard();
  renderGroups();
})();

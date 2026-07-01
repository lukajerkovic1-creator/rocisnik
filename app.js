(function () {
  "use strict";

  const STORAGE_KEY = "rocisnik.hearings.v1";
  const DATA_NOTICE_DISMISSED_KEY = "rocisnik.dataNoticeDismissed.v1";
  const BACKUP_FORMAT_VERSION = 1;
  const DAY_NAMES = ["Ned", "Pon", "Uto", "Sri", "Čet", "Pet", "Sub"];
  const MONTH_NAMES_GENITIVE = [
    "siječnja",
    "veljače",
    "ožujka",
    "travnja",
    "svibnja",
    "lipnja",
    "srpnja",
    "kolovoza",
    "rujna",
    "listopada",
    "studenoga",
    "prosinca"
  ];
  const MONTH_NAMES_NOMINATIVE = [
    "siječanj",
    "veljača",
    "ožujak",
    "travanj",
    "svibanj",
    "lipanj",
    "srpanj",
    "kolovoz",
    "rujan",
    "listopad",
    "studeni",
    "prosinac"
  ];

  const state = {
    hearings: [],
    selectedId: null,
    editingId: null,
    currentMobileView: "schedule",
    visibleStart: null,
    visibleEnd: null,
    showDeleted: false,
    searchSubmitted: false,
    filters: {
      plaintiff: "",
      defendant: "",
      subject: "",
      value: "",
      other: ""
    }
  };

  const els = {
    rangeLabel: document.getElementById("rangeLabel"),
    todayChip: document.getElementById("todayChip"),
    calendarGrid: document.getElementById("calendarGrid"),
    dataNotice: document.getElementById("dataNotice"),
    dataSafetyButton: document.getElementById("dataSafetyButton"),
    dismissDataNoticeButton: document.getElementById("dismissDataNoticeButton"),
    exportJsonButton: document.getElementById("exportJsonButton"),
    importJsonButton: document.getElementById("importJsonButton"),
    importJsonFile: document.getElementById("importJsonFile"),
    importModeInputs: Array.from(document.querySelectorAll('input[name="importMode"]')),
    backupMessage: document.getElementById("backupMessage"),
    monthSelect: document.getElementById("monthSelect"),
    yearInput: document.getElementById("yearInput"),
    jumpButton: document.getElementById("jumpButton"),
    todayButton: document.getElementById("todayButton"),
    loadMoreButton: document.getElementById("loadMoreButton"),
    showDeletedToggle: document.getElementById("showDeletedToggle"),
    filters: {
      plaintiff: document.getElementById("filterPlaintiff"),
      defendant: document.getElementById("filterDefendant"),
      subject: document.getElementById("filterSubject"),
      value: document.getElementById("filterValue"),
      other: document.getElementById("filterOther")
    },
    searchButton: document.getElementById("searchButton"),
    clearFiltersButton: document.getElementById("clearFiltersButton"),
    searchResults: document.getElementById("searchResults"),
    form: document.getElementById("hearingForm"),
    formTitle: document.getElementById("formTitle"),
    formMessage: document.getElementById("formMessage"),
    submitButton: document.getElementById("submitButton"),
    cancelEditButton: document.getElementById("cancelEditButton"),
    clearSelectionButton: document.getElementById("clearSelectionButton"),
    mobileTabs: Array.from(document.querySelectorAll(".mobile-tab")),
    mobileViews: Array.from(document.querySelectorAll(".mobile-view")),
    fields: {
      id: document.getElementById("hearingId"),
      plaintiff: document.getElementById("plaintiff"),
      defendant: document.getElementById("defendant"),
      caseNumber: document.getElementById("caseNumber"),
      hearingDateTime: document.getElementById("hearingDateTime"),
      disputeSubject: document.getElementById("disputeSubject"),
      disputeValue: document.getElementById("disputeValue"),
      specificity: document.getElementById("specificity")
    },
    detailsEmpty: document.getElementById("detailsEmpty"),
    detailsContent: document.getElementById("detailsContent"),
    deletedStatus: document.getElementById("deletedStatus"),
    detailsSubtitle: document.getElementById("detailsSubtitle"),
    detailsTime: document.getElementById("detailsTime"),
    detailsParties: document.getElementById("detailsParties"),
    detailsCaseNumber: document.getElementById("detailsCaseNumber"),
    detailsDateTime: document.getElementById("detailsDateTime"),
    detailsDisputeSubject: document.getElementById("detailsDisputeSubject"),
    detailsDisputeValue: document.getElementById("detailsDisputeValue"),
    detailsSpecificity: document.getElementById("detailsSpecificity"),
    editButton: document.getElementById("editButton"),
    restoreButton: document.getElementById("restoreButton"),
    deleteButton: document.getElementById("deleteButton")
  };

  const startOfToday = stripTime(new Date());
  const weekStart = getWeekStart(startOfToday);

  init();

  function init() {
    registerServiceWorker();
    state.hearings = loadHearings();
    state.visibleStart = weekStart;
    state.visibleEnd = getDefaultVisibleEnd();
    fillMonthSelect();
    els.monthSelect.value = String(startOfToday.getMonth());
    els.yearInput.value = String(startOfToday.getFullYear());
    updateRangeLabel();
    els.todayChip.textContent = `Danas: ${formatShortDate(startOfToday)}`;

    els.form.addEventListener("submit", handleSubmit);
    els.dataSafetyButton.addEventListener("click", showDataNotice);
    els.dismissDataNoticeButton.addEventListener("click", dismissDataNotice);
    els.exportJsonButton.addEventListener("click", exportJsonBackup);
    els.importJsonButton.addEventListener("click", () => els.importJsonFile.click());
    els.importJsonFile.addEventListener("change", handleImportFile);
    els.cancelEditButton.addEventListener("click", resetForm);
    els.clearSelectionButton.addEventListener("click", () => {
      state.selectedId = null;
      resetForm();
      setMobileView("form");
      render();
    });
    els.editButton.addEventListener("click", startEditSelected);
    els.deleteButton.addEventListener("click", deleteSelected);
    els.restoreButton.addEventListener("click", restoreSelected);
    els.showDeletedToggle.addEventListener("change", () => {
      state.showDeleted = els.showDeletedToggle.checked;
      const selected = state.hearings.find((hearing) => hearing.id === state.selectedId);
      if (!state.showDeleted && isDeletedHearing(selected)) state.selectedId = null;
      render();
    });
    els.jumpButton.addEventListener("click", jumpToSelectedMonth);
    els.todayButton.addEventListener("click", scrollToToday);
    els.loadMoreButton.addEventListener("click", () => {
      state.visibleEnd = endOfMonth(addMonths(state.visibleEnd, 6));
      render();
    });
    els.searchButton.addEventListener("click", applySearch);
    Object.values(els.filters).forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applySearch();
        }
      });
    });
    els.clearFiltersButton.addEventListener("click", clearFilters);
    els.mobileTabs.forEach((tab) => {
      tab.addEventListener("click", () => setMobileView(tab.dataset.mobileView));
    });

    setDefaultDateTime();
    syncDataNotice();
    render();
  }

  function syncDataNotice() {
    els.dataNotice.hidden = window.localStorage.getItem(DATA_NOTICE_DISMISSED_KEY) === "true";
  }

  function dismissDataNotice() {
    window.localStorage.setItem(DATA_NOTICE_DISMISSED_KEY, "true");
    els.dataNotice.hidden = true;
  }

  function showDataNotice() {
    window.localStorage.removeItem(DATA_NOTICE_DISMISSED_KEY);
    els.dataNotice.hidden = false;
    els.dataNotice.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportJsonBackup() {
    const backup = createBackupPayload();
    const content = JSON.stringify(backup, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `rocisnik-backup-${toDateKey(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showBackupMessage(`Izvezeno ${formatHearingCount(state.hearings.length)} u JSON datoteku.`);
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const validation = validateBackupPayload(parsed);

      if (!validation.valid) {
        showBackupMessage(validation.message, "error");
        return;
      }

      const mode = getImportMode();
      const action = mode === "replace" ? "zamijeniti postojeće podatke" : "dodati podatke u postojeći ročišnik";
      const duplicateNote = mode === "append" ? " Zapisi s istim ID-em neće se duplicirati." : "";
      const confirmed = window.confirm(`Uvoz će ${action}. Datoteka sadrži ${formatHearingCount(validation.hearings.length)}.${duplicateNote} Nastaviti?`);
      if (!confirmed) {
        showBackupMessage("Uvoz je otkazan.");
        return;
      }

      const result = importHearings(validation.hearings, mode);
      saveHearings();
      resetForm();
      focusImportedRange(result.visibleHearings);
      render();
      showBackupMessage(result.message);
    } catch (error) {
      showBackupMessage("Datoteka nije ispravan JSON backup Ročišnika.", "error");
    }
  }

  function createBackupPayload() {
    return {
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      metadata: {
        appName: "Ročišnik",
        storageKey: STORAGE_KEY
      },
      hearings: state.hearings
    };
  }

  function validateBackupPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { valid: false, message: "Datoteka nije ispravan JSON backup Ročišnika." };
    }

    if (payload.formatVersion !== BACKUP_FORMAT_VERSION) {
      return { valid: false, message: "Backup ima nepodržanu verziju formata." };
    }

    if (!Array.isArray(payload.hearings)) {
      return { valid: false, message: "Backup ne sadrži ispravnu listu ročišta." };
    }

    const hearings = [];
    for (let index = 0; index < payload.hearings.length; index += 1) {
      const normalized = normalizeImportedHearing(payload.hearings[index]);
      if (!normalized) {
        return { valid: false, message: `Ročište pod rednim brojem ${index + 1} nije ispravno.` };
      }
      hearings.push(normalized);
    }

    return { valid: true, hearings };
  }

  function normalizeImportedHearing(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;

    const id = getRequiredImportString(item.id);
    const plaintiff = getRequiredImportString(item.plaintiff);
    const defendant = getRequiredImportString(item.defendant);
    const caseNumber = getRequiredImportString(item.caseNumber);
    const hearingDateTime = getRequiredImportString(item.hearingDateTime);
    if (!id || !plaintiff || !defendant || !caseNumber || Number.isNaN(new Date(hearingDateTime).getTime())) return null;

    return {
      id,
      plaintiff,
      defendant,
      caseNumber,
      hearingDateTime,
      disputeSubject: getOptionalImportString(item.disputeSubject),
      disputeValue: getOptionalImportString(item.disputeValue),
      specificity: getOptionalImportString(item.specificity),
      deletedAt: getOptionalImportString(item.deletedAt),
      deletedReason: getOptionalImportString(item.deletedReason),
      createdAt: getOptionalImportString(item.createdAt),
      updatedAt: getOptionalImportString(item.updatedAt)
    };
  }

  function getRequiredImportString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function getOptionalImportString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function getImportMode() {
    return els.importModeInputs.find((input) => input.checked)?.value === "replace" ? "replace" : "append";
  }

  function importHearings(importedHearings, mode) {
    if (mode === "replace") {
      state.hearings = [...importedHearings];
      state.selectedId = null;
      state.editingId = null;
      return {
        visibleHearings: importedHearings,
        message: `Uvoz je dovršen. Zamijenjeno je ${formatHearingCount(importedHearings.length)}.`
      };
    }

    const existingIds = new Set(state.hearings.map((hearing) => hearing.id));
    const added = [];
    let skipped = 0;

    importedHearings.forEach((hearing) => {
      if (existingIds.has(hearing.id)) {
        skipped += 1;
        return;
      }
      existingIds.add(hearing.id);
      state.hearings.push(hearing);
      added.push(hearing);
    });

    return {
      visibleHearings: added,
      message: `Uvoz je dovršen. Dodano: ${formatHearingCount(added.length)}. Preskočeno duplikata: ${skipped}.`
    };
  }

  function focusImportedRange(hearings) {
    if (!hearings.length) {
      setMobileView("schedule");
      return;
    }

    const dates = hearings.map((hearing) => new Date(hearing.hearingDateTime)).sort((a, b) => a - b);
    state.visibleStart = startOfMonth(dates[0]);
    state.visibleEnd = endOfMonth(addMonths(dates[dates.length - 1], 3));
    setMobileView("schedule");
  }

  function showBackupMessage(message, type = "success") {
    els.backupMessage.textContent = message;
    els.backupMessage.classList.toggle("error", type === "error");
  }

  function formatHearingCount(count) {
    return count === 1 ? "1 ročište" : `${count} ročišta`;
  }

  function handleSubmit(event) {
    event.preventDefault();
    clearValidation();

    const data = getFormData();
    const errors = validate(data);

    if (errors.length > 0) {
      showValidation(errors);
      return;
    }

    const warnings = findScheduleWarnings(data, state.editingId);
    if (warnings.length > 0 && !confirmScheduleWarnings(warnings)) {
      showFormMessage("Spremanje je otkazano nakon upozorenja.", "error");
      return;
    }

    const now = new Date().toISOString();

    if (state.editingId) {
      state.hearings = state.hearings.map((hearing) =>
        hearing.id === state.editingId
          ? { ...hearing, ...data, updatedAt: now }
          : hearing
      );
      state.selectedId = state.editingId;
      showFormMessage("Ročište je ažurirano.", "success");
    } else {
      const hearing = {
        id: createId(),
        ...data,
        createdAt: now,
        updatedAt: now
      };
      state.hearings.push(hearing);
      state.selectedId = null;
      showFormMessage("Ročište je dodano.", "success");
    }

    saveHearings();
    resetForm({ keepMessage: true });
    setMobileView(state.selectedId ? "details" : "schedule");
    render();
  }

  function getFormData() {
    return {
      plaintiff: els.fields.plaintiff.value.trim(),
      defendant: els.fields.defendant.value.trim(),
      caseNumber: els.fields.caseNumber.value.trim(),
      hearingDateTime: els.fields.hearingDateTime.value,
      disputeSubject: els.fields.disputeSubject.value.trim(),
      disputeValue: els.fields.disputeValue.value.trim(),
      specificity: els.fields.specificity.value.trim()
    };
  }

  function validate(data) {
    const errors = [];
    if (!data.plaintiff) errors.push(["plaintiff", "Upiši tužitelja."]);
    if (!data.defendant) errors.push(["defendant", "Upiši tuženika."]);
    if (!data.caseNumber) errors.push(["caseNumber", "Upiši broj predmeta."]);
    if (!data.hearingDateTime) errors.push(["hearingDateTime", "Odaberi datum i sat ročišta."]);
    return errors;
  }

  function findScheduleWarnings(data, ignoreId = null) {
    const warnings = [];
    const candidateDate = new Date(data.hearingDateTime);
    if (Number.isNaN(candidateDate.getTime())) return warnings;

    getActiveHearingsForChecks(ignoreId).forEach((hearing) => {
      if (isPossibleDuplicate(data, candidateDate, hearing)) {
        warnings.push({ type: "duplicate", hearing });
      }
      if (hasTimeConflict(candidateDate, new Date(hearing.hearingDateTime))) {
        warnings.push({ type: "conflict", hearing });
      }
    });

    return warnings;
  }

  function getActiveHearingsForChecks(ignoreId = null) {
    return state.hearings.filter((hearing) =>
      hearing.id !== ignoreId &&
      !isDeletedHearing(hearing)
    );
  }

  function isPossibleDuplicate(data, candidateDate, hearing) {
    const existingDate = new Date(hearing.hearingDateTime);
    if (!isSameDay(candidateDate, existingDate)) return false;
    if (!isSimilarIdentifier(data.caseNumber, hearing.caseNumber)) return false;

    return areSimilarParties(data.plaintiff, data.defendant, hearing.plaintiff, hearing.defendant);
  }

  function areSimilarParties(plaintiff, defendant, existingPlaintiff, existingDefendant) {
    return isSimilarText(plaintiff, existingPlaintiff) && isSimilarText(defendant, existingDefendant);
  }

  function isSimilarIdentifier(a, b) {
    const first = normalizeSearch(a);
    const second = normalizeSearch(b);
    if (!first || !second) return false;
    if (first === second) return true;
    if (Math.min(first.length, second.length) >= 5 && (first.includes(second) || second.includes(first))) return true;
    return Math.max(first.length, second.length) >= 5 && levenshteinDistance(first, second) <= 1;
  }

  function isSimilarText(a, b) {
    const first = normalizeSearch(a);
    const second = normalizeSearch(b);
    if (!first || !second) return false;
    if (first === second) return true;
    if (Math.min(first.length, second.length) >= 4 && (first.includes(second) || second.includes(first))) return true;

    const longest = Math.max(first.length, second.length);
    if (longest < 5) return false;
    const distance = levenshteinDistance(first, second);
    return 1 - distance / longest >= 0.82;
  }

  function hasTimeConflict(candidateStart, existingStart) {
    if (Number.isNaN(existingStart.getTime()) || !isSameDay(candidateStart, existingStart)) return false;

    const durationMs = 60 * 60 * 1000;
    const minimumGapMs = 30 * 60 * 1000;
    const candidateEnd = new Date(candidateStart.getTime() + durationMs);
    const existingEnd = new Date(existingStart.getTime() + durationMs);
    const overlaps = candidateStart < existingEnd && existingStart < candidateEnd;
    if (overlaps) return true;

    const gapMs = candidateStart >= existingEnd
      ? candidateStart.getTime() - existingEnd.getTime()
      : existingStart.getTime() - candidateEnd.getTime();
    return gapMs < minimumGapMs;
  }

  function confirmScheduleWarnings(warnings) {
    const duplicateLines = warnings
      .filter((warning) => warning.type === "duplicate")
      .map((warning) => `- ${formatWarningHearing(warning.hearing)}`);
    const conflictLines = warnings
      .filter((warning) => warning.type === "conflict")
      .map((warning) => `- ${formatWarningHearing(warning.hearing)}`);

    const messageParts = ["Pronađena su moguća upozorenja prije spremanja:"];
    if (duplicateLines.length) {
      messageParts.push("", "Mogući duplikati:", ...dedupeLines(duplicateLines));
    }
    if (conflictLines.length) {
      messageParts.push("", "Konflikti termina:", ...dedupeLines(conflictLines));
    }
    messageParts.push("", "Želite li svejedno spremiti ročište?");

    return window.confirm(messageParts.join("\n"));
  }

  function formatWarningHearing(hearing) {
    return `${hearing.caseNumber || "Bez broja predmeta"} | ${hearing.plaintiff} - ${hearing.defendant} | ${formatLongDateTime(new Date(hearing.hearingDateTime))}`;
  }

  function dedupeLines(lines) {
    return Array.from(new Set(lines));
  }

  function levenshteinDistance(a, b) {
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    const current = new Array(b.length + 1);

    for (let i = 1; i <= a.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + cost
        );
      }
      for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
    }

    return previous[b.length];
  }

  function showValidation(errors) {
    errors.forEach(([field]) => els.fields[field].classList.add("invalid"));
    showFormMessage(errors[0][1], "error");
    els.fields[errors[0][0]].focus();
  }

  function clearValidation() {
    Object.values(els.fields).forEach((field) => field.classList.remove("invalid"));
    els.formMessage.textContent = "";
    els.formMessage.className = "form-message";
  }

  function showFormMessage(message, type) {
    els.formMessage.textContent = message;
    els.formMessage.className = `form-message ${type}`;
  }

  function render() {
    updateRangeLabel();
    els.showDeletedToggle.checked = state.showDeleted;
    renderCalendar();
    renderSearchResults();
    renderDetails();
    updateFormMode();
  }

  function renderCalendar() {
    els.calendarGrid.replaceChildren();
    const visibleDays = getVisibleDays();
    let lastMonthKey = "";

    visibleDays.forEach((day) => {
      const monthKey = `${day.getFullYear()}-${day.getMonth()}`;
      if (monthKey !== lastMonthKey) {
        const monthBreak = document.createElement("div");
        monthBreak.className = "month-break";
        monthBreak.id = `month-${day.getFullYear()}-${day.getMonth()}`;
        monthBreak.textContent = `${capitalize(MONTH_NAMES_NOMINATIVE[day.getMonth()])} ${day.getFullYear()}.`;
        els.calendarGrid.append(monthBreak);
        lastMonthKey = monthKey;
      }

      const dayCard = document.createElement("article");
      dayCard.className = "day-card";
      dayCard.id = `day-${toDateKey(day)}`;
      if (isSameDay(day, startOfToday)) dayCard.classList.add("today");

      const head = document.createElement("div");
      head.className = "day-head";

      const dayText = document.createElement("div");
      dayText.innerHTML = `<div class="day-name">${DAY_NAMES[day.getDay()]}</div><div class="day-date">${day.getDate()}.</div>`;

      const month = document.createElement("div");
      month.className = "day-name";
      month.textContent = MONTH_NAMES_NOMINATIVE[day.getMonth()];

      head.append(dayText, month);
      dayCard.append(head);

      const list = document.createElement("div");
      list.className = "hearing-list";

      const hearings = getHearingsForDay(day);
      if (hearings.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-day";
        empty.textContent = hasActiveFilters() ? "Nema rezultata" : "Nema ročišta";
        list.append(empty);
      } else {
        hearings.forEach((hearing) => list.append(createHearingButton(hearing)));
      }

      dayCard.append(list);
      els.calendarGrid.append(dayCard);
    });
  }

  function createHearingButton(hearing) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hearing-button";
    if (hearing.id === state.selectedId) button.classList.add("selected");
    if (isDeletedHearing(hearing)) button.classList.add("deleted");
    button.innerHTML = `
      <span class="hearing-time">${formatTime(new Date(hearing.hearingDateTime))}</span>
      <span class="hearing-parties">${escapeHtml(hearing.plaintiff)} - ${escapeHtml(hearing.defendant)}</span>
      ${isDeletedHearing(hearing) ? `<span class="deleted-badge">${escapeHtml(getDeletedLabel(hearing))}</span>` : ""}
    `;
    button.addEventListener("click", () => {
      state.selectedId = hearing.id;
      setMobileView("details");
      render();
    });
    return button;
  }

  function createSearchResultButton(hearing) {
    const date = new Date(hearing.hearingDateTime);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-button";
    if (hearing.id === state.selectedId) button.classList.add("selected");
    if (isDeletedHearing(hearing)) button.classList.add("deleted");
    button.innerHTML = `
      <span class="search-result-date">${formatLongDateTime(date)}</span>
      <span class="search-result-parties">${escapeHtml(hearing.plaintiff)} - ${escapeHtml(hearing.defendant)}</span>
      <span class="search-result-meta">${escapeHtml(hearing.caseNumber || "Bez broja predmeta")}${hearing.disputeSubject ? ` | ${escapeHtml(hearing.disputeSubject)}` : ""}</span>
      ${isDeletedHearing(hearing) ? `<span class="deleted-badge">${escapeHtml(getDeletedLabel(hearing, true))}</span>` : ""}
    `;
    button.addEventListener("click", () => {
      state.selectedId = hearing.id;
      setMobileView("details");
      render();
    });
    return button;
  }

  function renderSearchResults() {
    els.searchResults.replaceChildren();

    if (!state.searchSubmitted) {
      const hint = document.createElement("div");
      hint.className = "search-empty";
      hint.textContent = "Upiši kriterij i pritisni Pretraži.";
      els.searchResults.append(hint);
      return;
    }

    const results = getSearchResults();
    const heading = document.createElement("p");
    heading.className = "search-results-heading";
    heading.textContent = results.length === 1 ? "1 pronađena rasprava" : `${results.length} pronađenih rasprava`;
    els.searchResults.append(heading);

    if (results.length === 0) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "Nema rasprava koje odgovaraju pretrazi.";
      els.searchResults.append(empty);
      return;
    }

    results.forEach((hearing) => els.searchResults.append(createSearchResultButton(hearing)));
  }

  function renderDetails() {
    const hearing = getSelectedHearing();

    if (!hearing) {
      els.detailsEmpty.hidden = false;
      els.detailsContent.hidden = true;
      els.deletedStatus.hidden = true;
      els.detailsSubtitle.textContent = "Odaberi raspravu za prikaz detalja.";
      return;
    }

    const date = new Date(hearing.hearingDateTime);
    els.detailsEmpty.hidden = true;
    els.detailsContent.hidden = false;
    els.detailsSubtitle.textContent = hearing.caseNumber;
    els.detailsTime.textContent = formatTime(date);
    els.detailsParties.textContent = `${hearing.plaintiff} - ${hearing.defendant}`;
    els.detailsCaseNumber.textContent = hearing.caseNumber;
    els.detailsDateTime.textContent = formatLongDateTime(date);
    els.detailsDisputeSubject.textContent = hearing.disputeSubject || "Nije uneseno";
    els.detailsDisputeValue.textContent = hearing.disputeValue || "Nije uneseno";
    els.detailsSpecificity.textContent = hearing.specificity || "Nije uneseno";

    const deleted = isDeletedHearing(hearing);
    els.deletedStatus.hidden = !deleted;
    els.deletedStatus.textContent = deleted ? getDeletedLabel(hearing, true) : "";
    els.editButton.hidden = deleted;
    els.deleteButton.hidden = deleted;
    els.restoreButton.hidden = !deleted;
  }

  function updateFormMode() {
    const isEditing = Boolean(state.editingId);
    els.formTitle.textContent = isEditing ? "Uredi ročište" : "Dodaj ročište";
    els.submitButton.textContent = isEditing ? "Spremi izmjene" : "Dodaj ročište";
    els.cancelEditButton.hidden = !isEditing;
  }

  function startEditSelected() {
    const hearing = getSelectedHearing();
    if (!hearing || isDeletedHearing(hearing)) return;

    state.editingId = hearing.id;
    els.fields.id.value = hearing.id;
    els.fields.plaintiff.value = hearing.plaintiff;
    els.fields.defendant.value = hearing.defendant;
    els.fields.caseNumber.value = hearing.caseNumber;
    els.fields.hearingDateTime.value = hearing.hearingDateTime;
    els.fields.disputeSubject.value = hearing.disputeSubject;
    els.fields.disputeValue.value = hearing.disputeValue;
    els.fields.specificity.value = hearing.specificity;
    clearValidation();
    setMobileView("form");
    updateFormMode();
    els.fields.plaintiff.focus();
  }

  function deleteSelected() {
    const hearing = getSelectedHearing();
    if (!hearing) return;

    const confirmed = window.confirm(`Obrisati ročište ${hearing.plaintiff} - ${hearing.defendant}?`);
    if (!confirmed) return;

    const now = new Date().toISOString();
    state.hearings = state.hearings.map((item) =>
      item.id === hearing.id
        ? { ...item, deletedAt: now, deletedReason: item.deletedReason || "", updatedAt: now }
        : item
    );
    state.selectedId = state.showDeleted ? hearing.id : null;
    state.editingId = null;
    saveHearings();
    resetForm();
    setMobileView(state.showDeleted ? "details" : "schedule");
    render();
  }

  function restoreSelected() {
    const hearing = getSelectedHearing();
    if (!hearing || !isDeletedHearing(hearing)) return;

    const confirmed = window.confirm(`Vratiti ročište ${hearing.plaintiff} - ${hearing.defendant}?`);
    if (!confirmed) return;

    const now = new Date().toISOString();
    state.hearings = state.hearings.map((item) => {
      if (item.id !== hearing.id) return item;
      const { deletedAt, deletedReason, deleted, isDeleted, ...restored } = item;
      return { ...restored, updatedAt: now };
    });
    state.selectedId = hearing.id;
    saveHearings();
    render();
  }

  function resetForm(options = {}) {
    state.editingId = null;
    els.form.reset();
    els.fields.id.value = "";
    setDefaultDateTime();
    if (!options.keepMessage) clearValidation();
    updateFormMode();
  }

  function setDefaultDateTime() {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    els.fields.hearingDateTime.value = toDateTimeInputValue(nextHour);
  }

  function setMobileView(view) {
    state.currentMobileView = view;
    els.mobileTabs.forEach((tab) => {
      const isActive = tab.dataset.mobileView === view;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-current", isActive ? "page" : "false");
    });
    els.mobileViews.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.view === view);
    });
  }

  function getSelectedHearing() {
    const hearing = state.hearings.find((item) => item.id === state.selectedId) || null;
    if (!hearing) return null;
    if (isDeletedHearing(hearing) && !state.showDeleted) return null;
    return hearing;
  }

  function getHearingsForDay(day) {
    return getVisibleHearings()
      .filter((hearing) => isSameDay(new Date(hearing.hearingDateTime), day))
      .filter(matchesFilters)
      .sort((a, b) => new Date(a.hearingDateTime) - new Date(b.hearingDateTime));
  }

  function getVisibleHearings() {
    return state.hearings.filter((hearing) => state.showDeleted || !isDeletedHearing(hearing));
  }

  function isDeletedHearing(hearing) {
    return Boolean(hearing && (hearing.deletedAt || hearing.deleted || hearing.isDeleted));
  }

  function getDeletedLabel(hearing, includeTime = false) {
    if (!hearing?.deletedAt) return "Obrisano";
    const deletedDate = new Date(hearing.deletedAt);
    if (Number.isNaN(deletedDate.getTime())) return "Obrisano";
    return `Obrisano ${includeTime ? formatLongDateTime(deletedDate) : formatShortDate(deletedDate)}`;
  }

  function matchesFilters(hearing) {
    const filters = state.filters;
    const checks = [
      [filters.plaintiff, hearing.plaintiff],
      [filters.defendant, hearing.defendant],
      [filters.subject, hearing.disputeSubject],
      [filters.value, hearing.disputeValue],
      [filters.other, `${hearing.caseNumber} ${hearing.specificity}`]
    ];
    return checks.every(([query, value]) => !query || normalizeSearch(value).includes(query));
  }

  function hasActiveFilters() {
    return Object.values(state.filters).some(Boolean);
  }

  function clearFilters() {
    Object.keys(state.filters).forEach((key) => {
      state.filters[key] = "";
      els.filters[key].value = "";
    });
    state.searchSubmitted = false;
    render();
  }

  function applySearch() {
    Object.entries(els.filters).forEach(([key, input]) => {
      state.filters[key] = normalizeSearch(input.value);
    });
    state.searchSubmitted = true;
    render();
    requestAnimationFrame(() => {
      els.searchResults.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function getSearchResults() {
    if (!hasActiveFilters()) return [];
    return getVisibleHearings()
      .filter(matchesFilters)
      .sort((a, b) => new Date(a.hearingDateTime) - new Date(b.hearingDateTime));
  }

  function jumpToSelectedMonth() {
    const month = Number(els.monthSelect.value);
    const year = Number(els.yearInput.value);
    if (!Number.isInteger(month) || !Number.isInteger(year)) return;

    const target = new Date(year, month, 1);
    state.visibleStart = startOfMonth(target);
    state.visibleEnd = endOfMonth(addMonths(target, 18));
    render();
    requestAnimationFrame(() => {
      document.getElementById(`month-${year}-${month}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function scrollToToday() {
    state.visibleStart = weekStart;
    state.visibleEnd = getDefaultVisibleEnd();
    render();
    requestAnimationFrame(() => {
      document.getElementById(`day-${toDateKey(startOfToday)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function ensureVisibleThrough(date) {
    if (date < state.visibleStart) {
      state.visibleStart = startOfMonth(date);
    }
    if (date > state.visibleEnd) {
      state.visibleEnd = endOfMonth(addMonths(date, 3));
    }
  }

  function getVisibleDays() {
    const days = [];
    let day = new Date(state.visibleStart);
    while (day <= state.visibleEnd) {
      days.push(new Date(day));
      day = addDays(day, 1);
    }
    return days;
  }

  function getDefaultVisibleEnd() {
    return endOfMonth(addMonths(startOfToday, 18));
  }

  function updateRangeLabel() {
    els.rangeLabel.textContent = `${formatShortDate(state.visibleStart)} ${state.visibleStart.getFullYear()}. - ${formatShortDate(state.visibleEnd)} ${state.visibleEnd.getFullYear()}.`;
  }

  function fillMonthSelect() {
    els.monthSelect.replaceChildren();
    MONTH_NAMES_NOMINATIVE.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = capitalize(name);
      els.monthSelect.append(option);
    });
  }

  function loadHearings() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && item.id && item.hearingDateTime);
    } catch (error) {
      return [];
    }
  }

  function saveHearings() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.hearings));
  }

  function getWeekStart(date) {
    const result = stripTime(date);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    return result;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function addMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  function startOfMonth(date) {
    return stripTime(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  function endOfMonth(date) {
    const result = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  function stripTime(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function formatShortDate(date) {
    return `${date.getDate()}. ${MONTH_NAMES_GENITIVE[date.getMonth()]}`;
  }

  function formatTime(date) {
    return date.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
  }

  function formatLongDateTime(date) {
    return `${DAY_NAMES[date.getDay()]}, ${date.getDate()}. ${MONTH_NAMES_GENITIVE[date.getMonth()]} ${date.getFullYear()}. u ${formatTime(date)}`;
  }

  function toDateKey(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function normalizeSearch(value) {
    return String(value || "")
      .toLocaleLowerCase("hr-HR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function capitalize(value) {
    return `${value.charAt(0).toLocaleUpperCase("hr-HR")}${value.slice(1)}`;
  }

  function toDateTimeInputValue(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function createId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `hearing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();

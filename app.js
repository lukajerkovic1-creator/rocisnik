(function () {
  "use strict";

  const STORAGE_KEY = "rocisnik.hearings.v1";
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
    monthSelect: document.getElementById("monthSelect"),
    yearInput: document.getElementById("yearInput"),
    jumpButton: document.getElementById("jumpButton"),
    todayButton: document.getElementById("todayButton"),
    loadMoreButton: document.getElementById("loadMoreButton"),
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
    detailsSubtitle: document.getElementById("detailsSubtitle"),
    detailsTime: document.getElementById("detailsTime"),
    detailsParties: document.getElementById("detailsParties"),
    detailsCaseNumber: document.getElementById("detailsCaseNumber"),
    detailsDateTime: document.getElementById("detailsDateTime"),
    detailsDisputeSubject: document.getElementById("detailsDisputeSubject"),
    detailsDisputeValue: document.getElementById("detailsDisputeValue"),
    detailsSpecificity: document.getElementById("detailsSpecificity"),
    editButton: document.getElementById("editButton"),
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
    els.cancelEditButton.addEventListener("click", resetForm);
    els.clearSelectionButton.addEventListener("click", () => {
      state.selectedId = null;
      resetForm();
      setMobileView("form");
      render();
    });
    els.editButton.addEventListener("click", startEditSelected);
    els.deleteButton.addEventListener("click", deleteSelected);
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
    render();
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
    button.innerHTML = `
      <span class="hearing-time">${formatTime(new Date(hearing.hearingDateTime))}</span>
      <span class="hearing-parties">${escapeHtml(hearing.plaintiff)} - ${escapeHtml(hearing.defendant)}</span>
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
    button.innerHTML = `
      <span class="search-result-date">${formatLongDateTime(date)}</span>
      <span class="search-result-parties">${escapeHtml(hearing.plaintiff)} - ${escapeHtml(hearing.defendant)}</span>
      <span class="search-result-meta">${escapeHtml(hearing.caseNumber || "Bez broja predmeta")}${hearing.disputeSubject ? ` | ${escapeHtml(hearing.disputeSubject)}` : ""}</span>
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
  }

  function updateFormMode() {
    const isEditing = Boolean(state.editingId);
    els.formTitle.textContent = isEditing ? "Uredi ročište" : "Dodaj ročište";
    els.submitButton.textContent = isEditing ? "Spremi izmjene" : "Dodaj ročište";
    els.cancelEditButton.hidden = !isEditing;
  }

  function startEditSelected() {
    const hearing = getSelectedHearing();
    if (!hearing) return;

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

    state.hearings = state.hearings.filter((item) => item.id !== hearing.id);
    state.selectedId = null;
    state.editingId = null;
    saveHearings();
    resetForm();
    setMobileView("schedule");
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
    return state.hearings.find((hearing) => hearing.id === state.selectedId) || null;
  }

  function getHearingsForDay(day) {
    return state.hearings
      .filter((hearing) => isSameDay(new Date(hearing.hearingDateTime), day))
      .filter(matchesFilters)
      .sort((a, b) => new Date(a.hearingDateTime) - new Date(b.hearingDateTime));
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
    return state.hearings
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

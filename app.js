(function () {
  "use strict";

  const STORAGE_KEY = "rocisnik.hearings.v1";
  const DATA_NOTICE_DISMISSED_KEY = "rocisnik.dataNoticeDismissed.v1";
  const SECURITY_NOTICE_ACCEPTED_AT_KEY = "securityNoticeAcceptedAt";
  const LAST_BACKUP_AT_KEY = "rocisnik.lastBackupAt.v1";
  const BACKUP_REMINDER_SNOOZE_UNTIL_KEY = "rocisnik.backupReminderSnoozeUntil.v1";
  const DEFAULT_REMINDER_KEY = "rocisnik.defaultReminder.v1";
  const BACKUP_FORMAT_VERSION = 1;
  const BACKUP_REMINDER_INTERVAL_DAYS = 7;
  const BACKUP_REMINDER_LATER_HOURS = 4;
  const REMINDER_CHECK_INTERVAL_MS = 60 * 1000;
  const REMINDER_SNOOZE_MINUTES = 60;
  const DEFAULT_REMINDER_MINUTES = 24 * 60;
  const PRESET_REMINDERS = [
    { id: "7d", label: "7 dana prije", minutesBefore: 7 * 24 * 60 },
    { id: "1d", label: "1 dan prije", minutesBefore: 24 * 60 },
    { id: "2h", label: "2 sata prije", minutesBefore: 2 * 60 }
  ];
  const DEFAULT_REMINDER_OPTIONS = [
    { value: "none", label: "Bez zadanog podsjetnika", reminders: [] },
    { value: "2h", label: "2 sata prije", reminders: [{ id: "2h", label: "2 sata prije", minutesBefore: 2 * 60 }] },
    { value: "1d", label: "1 dan prije", reminders: [{ id: "1d", label: "1 dan prije", minutesBefore: 24 * 60 }] },
    { value: "7d", label: "7 dana prije", reminders: [{ id: "7d", label: "7 dana prije", minutesBefore: 7 * 24 * 60 }] }
  ];
  const DEFAULT_HEARING_STATUS = "zakazano";
  const HEARING_STATUSES = [
    { value: "zakazano", label: "Zakazano", className: "status-scheduled" },
    { value: "odgođeno", label: "Odgođeno", className: "status-postponed" },
    { value: "otkazano", label: "Otkazano", className: "status-canceled" },
    { value: "održano", label: "Održano", className: "status-held" }
  ];
  const DAY_NAMES = ["Ned", "Pon", "Uto", "Sri", "Čet", "Pet", "Sub"];
  const SCHEDULE_VIEWS = {
    today: {
      label: "Danas",
      emptyTitle: "Nema ročišta danas.",
      emptyText: "Dodaj novo ročište ili odaberi širi vremenski pregled."
    },
    week: {
      label: "Ovaj tjedan",
      emptyTitle: "Nema ročišta ovaj tjedan.",
      emptyText: "Ročišta za aktualni tjedan pojavit će se ovdje."
    },
    next30: {
      label: "Sljedećih 30 dana",
      emptyTitle: "Nema ročišta u sljedećih 30 dana.",
      emptyText: "Za pregled udaljenijih termina odaberi Sve ili skoči na mjesec."
    },
    all: {
      label: "Sve",
      emptyTitle: "Nema aktivnih ročišta.",
      emptyText: "Kad dodaš ročište, pojavit će se ovdje kronološki."
    },
    custom: {
      label: "Odabrano razdoblje",
      emptyTitle: "Nema ročišta u odabranom razdoblju.",
      emptyText: "Promijeni mjesec ili dodaj novo ročište."
    }
  };
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
    scheduleView: "next30",
    visibleStart: null,
    visibleEnd: null,
    showDeleted: false,
    searchSubmitted: false,
    searchError: "",
    showAllSearchResults: false,
    activeReminders: [],
    filters: {
      plaintiff: "",
      defendant: "",
      subject: "",
      value: "",
      other: "",
      status: "",
      dateFrom: "",
      dateTo: ""
    }
  };

  const els = {
    rangeLabel: document.getElementById("rangeLabel"),
    todayChip: document.getElementById("todayChip"),
    calendarGrid: document.getElementById("calendarGrid"),
    dataNotice: document.getElementById("dataNotice"),
    dataSafetyButton: document.getElementById("dataSafetyButton"),
    dismissDataNoticeButton: document.getElementById("dismissDataNoticeButton"),
    securityNoticeButton: document.getElementById("securityNoticeButton"),
    securityPrompt: document.getElementById("securityPrompt"),
    securityPromptAcceptButton: document.getElementById("securityPromptAcceptButton"),
    securityPromptMoreButton: document.getElementById("securityPromptMoreButton"),
    securityNoticeModal: document.getElementById("securityNoticeModal"),
    securityNoticeCloseButton: document.getElementById("securityNoticeCloseButton"),
    securityNoticeAcceptButton: document.getElementById("securityNoticeAcceptButton"),
    securityNoticeDismissButton: document.getElementById("securityNoticeDismissButton"),
    backupReminder: document.getElementById("backupReminder"),
    backupReminderExportButton: document.getElementById("backupReminderExportButton"),
    backupReminderLaterButton: document.getElementById("backupReminderLaterButton"),
    backupReminderTodayButton: document.getElementById("backupReminderTodayButton"),
    defaultReminderSelect: document.getElementById("defaultReminderSelect"),
    enableNotificationsButton: document.getElementById("enableNotificationsButton"),
    notificationStatus: document.getElementById("notificationStatus"),
    remindersList: document.getElementById("remindersList"),
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
    loadMoreWrap: document.querySelector(".load-more-wrap"),
    scheduleViewButtons: Array.from(document.querySelectorAll("[data-schedule-view]")),
    showDeletedToggle: document.getElementById("showDeletedToggle"),
    filters: {
      plaintiff: document.getElementById("filterPlaintiff"),
      defendant: document.getElementById("filterDefendant"),
      subject: document.getElementById("filterSubject"),
      value: document.getElementById("filterValue"),
      other: document.getElementById("filterOther"),
      status: document.getElementById("filterStatus"),
      dateFrom: document.getElementById("filterDateFrom"),
      dateTo: document.getElementById("filterDateTo")
    },
    datePresetButtons: Array.from(document.querySelectorAll("[data-date-preset]")),
    searchButton: document.getElementById("searchButton"),
    clearFiltersButton: document.getElementById("clearFiltersButton"),
    searchMessage: document.getElementById("searchMessage"),
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
      status: document.getElementById("hearingStatus"),
      reminder7d: document.getElementById("reminder7d"),
      reminder1d: document.getElementById("reminder1d"),
      reminder2h: document.getElementById("reminder2h"),
      reminderCustomEnabled: document.getElementById("reminderCustomEnabled"),
      reminderCustomValue: document.getElementById("reminderCustomValue"),
      reminderCustomUnit: document.getElementById("reminderCustomUnit"),
      reminderDisabled: document.getElementById("reminderDisabled"),
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
    detailsStatus: document.getElementById("detailsStatus"),
    detailsReminders: document.getElementById("detailsReminders"),
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
    fillStatusSelects();
    fillDefaultReminderSelect();
    els.monthSelect.value = String(startOfToday.getMonth());
    els.yearInput.value = String(startOfToday.getFullYear());
    els.defaultReminderSelect.value = getDefaultReminderOptionValue();
    updateRangeLabel();
    els.todayChip.textContent = `Danas: ${formatShortDate(startOfToday)}`;

    els.form.addEventListener("submit", handleSubmit);
    els.dataSafetyButton.addEventListener("click", showDataNotice);
    els.dismissDataNoticeButton.addEventListener("click", dismissDataNotice);
    els.securityNoticeButton.addEventListener("click", openSecurityNoticeModal);
    els.securityPromptMoreButton.addEventListener("click", openSecurityNoticeModal);
    els.securityPromptAcceptButton.addEventListener("click", acceptSecurityNotice);
    els.securityNoticeAcceptButton.addEventListener("click", acceptSecurityNotice);
    els.securityNoticeCloseButton.addEventListener("click", closeSecurityNoticeModal);
    els.securityNoticeDismissButton.addEventListener("click", closeSecurityNoticeModal);
    els.securityNoticeModal.addEventListener("click", (event) => {
      if (event.target === els.securityNoticeModal) closeSecurityNoticeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.securityNoticeModal.hidden) closeSecurityNoticeModal();
    });
    els.exportJsonButton.addEventListener("click", exportJsonBackup);
    els.backupReminderExportButton.addEventListener("click", exportJsonBackup);
    els.backupReminderLaterButton.addEventListener("click", snoozeBackupReminder);
    els.backupReminderTodayButton.addEventListener("click", hideBackupReminderToday);
    els.defaultReminderSelect.addEventListener("change", saveDefaultReminderOption);
    els.enableNotificationsButton.addEventListener("click", requestBrowserNotifications);
    els.remindersList.addEventListener("click", handleReminderAction);
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
    els.scheduleViewButtons.forEach((button) => {
      button.addEventListener("click", () => setScheduleView(button.dataset.scheduleView));
    });
    els.loadMoreButton.addEventListener("click", () => {
      state.visibleEnd = endOfMonth(addMonths(state.visibleEnd, 6));
      render();
    });
    els.searchButton.addEventListener("click", applySearch);
    els.datePresetButtons.forEach((button) => {
      button.addEventListener("click", () => applyDatePreset(button.dataset.datePreset));
    });
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
    setDefaultReminderForm();
    syncDataNotice();
    updateNotificationStatus();
    render();
    checkDueReminders();
    window.setInterval(checkDueReminders, REMINDER_CHECK_INTERVAL_MS);
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

  function renderSecurityPrompt() {
    els.securityPrompt.hidden = hasAcceptedSecurityNotice();
  }

  function hasAcceptedSecurityNotice() {
    return Boolean(window.localStorage.getItem(SECURITY_NOTICE_ACCEPTED_AT_KEY));
  }

  function acceptSecurityNotice() {
    window.localStorage.setItem(SECURITY_NOTICE_ACCEPTED_AT_KEY, new Date().toISOString());
    closeSecurityNoticeModal();
    renderSecurityPrompt();
  }

  function openSecurityNoticeModal() {
    els.securityNoticeModal.hidden = false;
    document.body.classList.add("modal-open");
    els.securityNoticeCloseButton.focus();
  }

  function closeSecurityNoticeModal() {
    els.securityNoticeModal.hidden = true;
    document.body.classList.remove("modal-open");
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

    markBackupCompleted();
    showBackupMessage(`Izvezeno ${formatHearingCount(state.hearings.length)} u JSON datoteku.`);
    renderBackupReminder();
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
      checkDueReminders();
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
      status: normalizeStatus(item.status),
      reminders: normalizeReminders(item.reminders),
      reminderDismissedAt: getOptionalImportString(item.reminderDismissedAt),
      reminderSnoozedUntil: getOptionalImportString(item.reminderSnoozedUntil),
      reminderDisabled: Boolean(item.reminderDisabled),
      reminderEvents: normalizeReminderEvents(item.reminderEvents),
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
    state.scheduleView = "custom";
    state.visibleStart = startOfMonth(dates[0]);
    state.visibleEnd = endOfMonth(addMonths(dates[dates.length - 1], 3));
    setMobileView("schedule");
  }

  function showBackupMessage(message, type = "success") {
    els.backupMessage.textContent = message;
    els.backupMessage.classList.toggle("error", type === "error");
  }

  function markBackupCompleted() {
    window.localStorage.setItem(LAST_BACKUP_AT_KEY, new Date().toISOString());
    window.localStorage.removeItem(BACKUP_REMINDER_SNOOZE_UNTIL_KEY);
  }

  function snoozeBackupReminder() {
    const until = new Date();
    until.setHours(until.getHours() + BACKUP_REMINDER_LATER_HOURS);
    window.localStorage.setItem(BACKUP_REMINDER_SNOOZE_UNTIL_KEY, until.toISOString());
    renderBackupReminder();
  }

  function hideBackupReminderToday() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    window.localStorage.setItem(BACKUP_REMINDER_SNOOZE_UNTIL_KEY, tomorrow.toISOString());
    renderBackupReminder();
  }

  function renderBackupReminder() {
    els.backupReminder.hidden = !shouldShowBackupReminder();
  }

  function shouldShowBackupReminder() {
    if (state.hearings.length === 0) return false;
    if (isBackupReminderSnoozed()) return false;

    const lastBackupAt = getStoredDate(LAST_BACKUP_AT_KEY);
    if (!lastBackupAt) return true;

    const daysSinceBackup = (Date.now() - lastBackupAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceBackup > BACKUP_REMINDER_INTERVAL_DAYS;
  }

  function isBackupReminderSnoozed() {
    const snoozeUntil = getStoredDate(BACKUP_REMINDER_SNOOZE_UNTIL_KEY);
    return Boolean(snoozeUntil && snoozeUntil.getTime() > Date.now());
  }

  function fillDefaultReminderSelect() {
    els.defaultReminderSelect.replaceChildren();
    DEFAULT_REMINDER_OPTIONS.forEach((optionConfig) => {
      const option = document.createElement("option");
      option.value = optionConfig.value;
      option.textContent = optionConfig.label;
      els.defaultReminderSelect.append(option);
    });
  }

  function getDefaultReminderOptionValue() {
    const stored = window.localStorage.getItem(DEFAULT_REMINDER_KEY);
    return DEFAULT_REMINDER_OPTIONS.some((option) => option.value === stored) ? stored : "1d";
  }

  function getDefaultReminderConfigs() {
    const selected = DEFAULT_REMINDER_OPTIONS.find((option) => option.value === getDefaultReminderOptionValue()) || DEFAULT_REMINDER_OPTIONS[2];
    return normalizeReminders(selected.reminders);
  }

  function saveDefaultReminderOption() {
    window.localStorage.setItem(DEFAULT_REMINDER_KEY, els.defaultReminderSelect.value);
    if (!state.editingId) setDefaultReminderForm();
  }

  function setDefaultReminderForm() {
    applyReminderConfigsToForm(getDefaultReminderConfigs(), false);
  }

  function applyRemindersToForm(hearing) {
    applyReminderConfigsToForm(normalizeReminders(hearing.reminders), Boolean(hearing.reminderDisabled));
  }

  function applyReminderConfigsToForm(reminders, disabled) {
    const minutes = new Set(reminders.map((reminder) => reminder.minutesBefore));
    els.fields.reminder7d.checked = minutes.has(7 * 24 * 60);
    els.fields.reminder1d.checked = minutes.has(24 * 60);
    els.fields.reminder2h.checked = minutes.has(2 * 60);
    els.fields.reminderDisabled.checked = disabled;

    const customReminder = reminders.find((reminder) =>
      !PRESET_REMINDERS.some((preset) => preset.minutesBefore === reminder.minutesBefore)
    );
    els.fields.reminderCustomEnabled.checked = Boolean(customReminder);
    if (customReminder) {
      const custom = decomposeReminderMinutes(customReminder.minutesBefore);
      els.fields.reminderCustomValue.value = String(custom.value);
      els.fields.reminderCustomUnit.value = custom.unit;
    } else {
      els.fields.reminderCustomValue.value = "";
      els.fields.reminderCustomUnit.value = "minutes";
    }
  }

  function getFormReminders() {
    const reminders = [];
    [
      els.fields.reminder7d,
      els.fields.reminder1d,
      els.fields.reminder2h
    ].forEach((input) => {
      if (input.checked) reminders.push(createReminderConfig(Number(input.dataset.reminderMinutes)));
    });

    const custom = getCustomReminderConfig();
    if (els.fields.reminderCustomEnabled.checked && custom) reminders.push(custom);

    return normalizeReminders(reminders);
  }

  function getCustomReminderConfig() {
    const value = Number(els.fields.reminderCustomValue.value);
    if (!Number.isFinite(value) || value < 1) return null;

    const multipliers = {
      minutes: 1,
      hours: 60,
      days: 24 * 60
    };
    const unit = multipliers[els.fields.reminderCustomUnit.value] ? els.fields.reminderCustomUnit.value : "minutes";
    const minutesBefore = Math.round(value * multipliers[unit]);
    if (minutesBefore < 1) return null;
    return {
      id: `custom-${minutesBefore}`,
      label: `Prilagođeno: ${formatReminderOffset(minutesBefore)}`,
      minutesBefore
    };
  }

  function createReminderConfig(minutesBefore) {
    const preset = PRESET_REMINDERS.find((item) => item.minutesBefore === minutesBefore);
    return {
      id: preset?.id || `custom-${minutesBefore}`,
      label: preset?.label || `Prilagođeno: ${formatReminderOffset(minutesBefore)}`,
      minutesBefore
    };
  }

  function normalizeReminders(value) {
    const source = Array.isArray(value) ? value : [createReminderConfig(DEFAULT_REMINDER_MINUTES)];
    const byMinutes = new Map();

    source.forEach((item) => {
      const minutesBefore = Number(item?.minutesBefore);
      if (!Number.isFinite(minutesBefore) || minutesBefore < 1) return;
      const normalizedMinutes = Math.round(minutesBefore);
      byMinutes.set(normalizedMinutes, {
        id: String(item.id || `custom-${normalizedMinutes}`),
        label: String(item.label || formatReminderOffset(normalizedMinutes)),
        minutesBefore: normalizedMinutes
      });
    });

    return Array.from(byMinutes.values()).sort((a, b) => b.minutesBefore - a.minutesBefore);
  }

  function normalizeReminderEvents(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).map(([key, event]) => [
        key,
        {
          shownAt: getOptionalImportString(event?.shownAt),
          dismissedAt: getOptionalImportString(event?.dismissedAt),
          notificationSentAt: getOptionalImportString(event?.notificationSentAt)
        }
      ])
    );
  }

  function decomposeReminderMinutes(minutesBefore) {
    if (minutesBefore % (24 * 60) === 0) return { value: minutesBefore / (24 * 60), unit: "days" };
    if (minutesBefore % 60 === 0) return { value: minutesBefore / 60, unit: "hours" };
    return { value: minutesBefore, unit: "minutes" };
  }

  function shouldResetReminderEvents(hearing, data) {
    return hearing.hearingDateTime !== data.hearingDateTime ||
      normalizeStatus(hearing.status) !== data.status ||
      Boolean(hearing.reminderDisabled) !== data.reminderDisabled ||
      JSON.stringify(normalizeReminders(hearing.reminders)) !== JSON.stringify(normalizeReminders(data.reminders));
  }

  function checkDueReminders() {
    state.activeReminders = getDueReminders(new Date());
    markShownReminderEvents(state.activeReminders);
    sendBrowserNotifications(state.activeReminders);
    renderReminders();
  }

  function getDueReminders(now) {
    return state.hearings
      .filter(canCreateReminder)
      .flatMap((hearing) => getDueRemindersForHearing(hearing, now))
      .sort((a, b) => a.hearingDate - b.hearingDate || b.reminder.minutesBefore - a.reminder.minutesBefore);
  }

  function getDueRemindersForHearing(hearing, now) {
    const hearingDate = new Date(hearing.hearingDateTime);
    if (Number.isNaN(hearingDate.getTime()) || hearingDate <= now) return [];

    const snoozedUntil = hearing.reminderSnoozedUntil ? new Date(hearing.reminderSnoozedUntil) : null;
    if (snoozedUntil && !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil > now) return [];

    const events = normalizeReminderEvents(hearing.reminderEvents);
    return normalizeReminders(hearing.reminders)
      .map((reminder) => {
        const reminderAt = new Date(hearingDate.getTime() - reminder.minutesBefore * 60 * 1000);
        const key = getReminderKey(hearing, reminder);
        return { hearing, hearingDate, reminder, reminderAt, key, event: events[key] || {} };
      })
      .filter((item) => item.reminderAt <= now && !item.event.dismissedAt);
  }

  function canCreateReminder(hearing) {
    if (!hearing || isDeletedHearing(hearing) || hearing.reminderDisabled) return false;
    const status = normalizeStatus(hearing.status);
    return status !== "otkazano" && status !== "održano";
  }

  function getReminderKey(hearing, reminder) {
    return `${hearing.hearingDateTime}|${reminder.minutesBefore}`;
  }

  function renderReminders() {
    els.remindersList.replaceChildren();

    if (state.activeReminders.length === 0) {
      const empty = document.createElement("div");
      empty.className = "reminder-empty";
      empty.textContent = "Nema dospjelih podsjetnika.";
      els.remindersList.append(empty);
      return;
    }

    state.activeReminders.forEach((item) => els.remindersList.append(createReminderItem(item)));
  }

  function createReminderItem(item) {
    const wrapper = document.createElement("article");
    wrapper.className = "reminder-item";
    wrapper.innerHTML = `
      <div>
        <div class="reminder-item-title">${escapeHtml(item.hearing.plaintiff)} - ${escapeHtml(item.hearing.defendant)}</div>
        <div class="reminder-item-meta">${escapeHtml(item.hearing.caseNumber || "Bez broja predmeta")} | ${escapeHtml(formatLongDateTime(item.hearingDate))}</div>
        <div class="reminder-item-meta">Podsjetnik: ${escapeHtml(item.reminder.label)} (${escapeHtml(formatReminderDueText(item.reminderAt))})</div>
      </div>
      <div class="reminder-actions">
        <button class="secondary-button compact-button" type="button" data-reminder-action="seen" data-hearing-id="${escapeHtml(item.hearing.id)}" data-reminder-key="${escapeHtml(item.key)}">Viđeno</button>
        <button class="ghost-button compact-button" type="button" data-reminder-action="snooze" data-hearing-id="${escapeHtml(item.hearing.id)}" data-reminder-key="${escapeHtml(item.key)}">Odgodi</button>
        <button class="text-button compact-button" type="button" data-reminder-action="disable" data-hearing-id="${escapeHtml(item.hearing.id)}" data-reminder-key="${escapeHtml(item.key)}">Isključi za ovo ročište</button>
      </div>
    `;
    return wrapper;
  }

  function handleReminderAction(event) {
    const button = event.target.closest("[data-reminder-action]");
    if (!button) return;

    const action = button.dataset.reminderAction;
    const hearingId = button.dataset.hearingId;
    const reminderKey = button.dataset.reminderKey;
    const now = new Date().toISOString();

    state.hearings = state.hearings.map((hearing) => {
      if (hearing.id !== hearingId) return hearing;
      if (action === "disable") {
        return { ...hearing, reminderDisabled: true, reminderSnoozedUntil: "", reminderDismissedAt: now, updatedAt: now };
      }
      if (action === "snooze") {
        const snoozedUntil = new Date();
        snoozedUntil.setMinutes(snoozedUntil.getMinutes() + REMINDER_SNOOZE_MINUTES);
        return { ...hearing, reminderSnoozedUntil: snoozedUntil.toISOString(), updatedAt: now };
      }
      return {
        ...hearing,
        reminderDismissedAt: now,
        reminderEvents: {
          ...normalizeReminderEvents(hearing.reminderEvents),
          [reminderKey]: {
            ...(normalizeReminderEvents(hearing.reminderEvents)[reminderKey] || {}),
            dismissedAt: now,
            shownAt: (normalizeReminderEvents(hearing.reminderEvents)[reminderKey] || {}).shownAt || now
          }
        },
        updatedAt: now
      };
    });

    saveHearings();
    checkDueReminders();
    renderDetails();
  }

  function markShownReminderEvents(reminders) {
    const now = new Date().toISOString();
    let changed = false;
    reminders.forEach((item) => {
      if (item.event.shownAt) return;
      changed = true;
      state.hearings = state.hearings.map((hearing) => {
        if (hearing.id !== item.hearing.id) return hearing;
        const events = normalizeReminderEvents(hearing.reminderEvents);
        return {
          ...hearing,
          reminderEvents: {
            ...events,
            [item.key]: {
              ...(events[item.key] || {}),
              shownAt: now
            }
          }
        };
      });
    });
    if (changed) saveHearings();
  }

  function sendBrowserNotifications(reminders) {
    if (!("Notification" in window) || window.Notification.permission !== "granted") return;

    let changed = false;
    const now = new Date().toISOString();
    reminders.forEach((item) => {
      if (item.event.notificationSentAt) return;
      new window.Notification("Ročišnik podsjetnik", {
        body: `${item.hearing.plaintiff} - ${item.hearing.defendant}, ${formatLongDateTime(item.hearingDate)}`
      });
      changed = true;
      state.hearings = state.hearings.map((hearing) => {
        if (hearing.id !== item.hearing.id) return hearing;
        const events = normalizeReminderEvents(hearing.reminderEvents);
        return {
          ...hearing,
          reminderEvents: {
            ...events,
            [item.key]: {
              ...(events[item.key] || {}),
              shownAt: (events[item.key] || {}).shownAt || now,
              notificationSentAt: now
            }
          }
        };
      });
    });
    if (changed) saveHearings();
  }

  async function requestBrowserNotifications() {
    if (!("Notification" in window)) {
      els.notificationStatus.textContent = "Preglednik ne podržava obavijesti.";
      return;
    }

    if (window.Notification.permission === "granted") {
      els.notificationStatus.textContent = "Obavijesti preglednika su uključene.";
      return;
    }

    if (window.Notification.permission === "denied") {
      els.notificationStatus.textContent = "Obavijesti su blokirane u postavkama preglednika.";
      return;
    }

    const permission = await window.Notification.requestPermission();
    els.notificationStatus.textContent = permission === "granted"
      ? "Obavijesti preglednika su uključene dok je aplikacija otvorena."
      : "Obavijesti nisu uključene. In-app podsjetnici i dalje rade.";
    checkDueReminders();
  }

  function updateNotificationStatus() {
    if (!("Notification" in window)) {
      els.notificationStatus.textContent = "In-app podsjetnici su uključeni.";
      return;
    }
    if (window.Notification.permission === "granted") {
      els.notificationStatus.textContent = "Obavijesti preglednika su uključene dok je aplikacija otvorena.";
    } else {
      els.notificationStatus.textContent = "Obavijesti preglednika su opcionalne.";
    }
  }

  function getStoredDate(key) {
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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
      state.hearings = state.hearings.map((hearing) => {
        if (hearing.id !== state.editingId) return hearing;
        const resetReminderState = shouldResetReminderEvents(hearing, data);
        return {
          ...hearing,
          ...data,
          reminderEvents: resetReminderState ? {} : normalizeReminderEvents(hearing.reminderEvents),
          reminderDismissedAt: resetReminderState ? "" : hearing.reminderDismissedAt || "",
          reminderSnoozedUntil: resetReminderState || data.reminderDisabled ? "" : hearing.reminderSnoozedUntil || "",
          updatedAt: now
        };
      });
      state.selectedId = state.editingId;
      showFormMessage("Ročište je ažurirano.", "success");
    } else {
      const hearing = {
        id: createId(),
        ...data,
        reminderEvents: {},
        reminderDismissedAt: "",
        reminderSnoozedUntil: "",
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
    checkDueReminders();
  }

  function getFormData() {
    return {
      plaintiff: els.fields.plaintiff.value.trim(),
      defendant: els.fields.defendant.value.trim(),
      caseNumber: els.fields.caseNumber.value.trim(),
      hearingDateTime: els.fields.hearingDateTime.value,
      status: normalizeStatus(els.fields.status.value),
      reminders: getFormReminders(),
      reminderDisabled: els.fields.reminderDisabled.checked,
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
    if (!isAllowedStatus(data.status)) errors.push(["status", "Odaberi ispravan status ročišta."]);
    if (els.fields.reminderCustomEnabled.checked && !getCustomReminderConfig()) {
      errors.push(["reminderCustomValue", "Upiši ispravan prilagođeni podsjetnik."]);
    }
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
    updateScheduleViewButtons();
    renderSecurityPrompt();
    renderBackupReminder();
    renderReminders();
    renderCalendar();
    renderSearchResults();
    renderDetails();
    updateFormMode();
  }

  function renderCalendar() {
    els.calendarGrid.replaceChildren();
    const visibleHearings = getScheduleHearings();
    if (visibleHearings.length === 0) {
      els.calendarGrid.append(createScheduleEmptyState());
      return;
    }

    const visibleDays = getScheduleDays(visibleHearings);
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

      const hearings = visibleHearings.filter((hearing) => isSameDay(new Date(hearing.hearingDateTime), day));
      els.calendarGrid.append(createDayCard(day, hearings));
    });
  }

  function createDayCard(day, hearings) {
    const dayCard = document.createElement("article");
    dayCard.className = "day-card";
    dayCard.id = `day-${toDateKey(day)}`;
    if (isSameDay(day, startOfToday)) dayCard.classList.add("today");
    if (day < startOfToday) dayCard.classList.add("past-day");

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
    hearings.forEach((hearing) => list.append(createHearingButton(hearing, { markPast: state.scheduleView === "all" })));

    dayCard.append(list);
    return dayCard;
  }

  function createScheduleEmptyState() {
    const viewConfig = SCHEDULE_VIEWS[state.scheduleView] || SCHEDULE_VIEWS.next30;
    const empty = document.createElement("div");
    empty.className = "schedule-empty";
    empty.innerHTML = `
      <strong>${escapeHtml(viewConfig.emptyTitle)}</strong>
      <span>${escapeHtml(viewConfig.emptyText)}</span>
    `;

    const button = document.createElement("button");
    button.className = "secondary-button";
    button.type = "button";
    button.textContent = "Dodaj novo ročište";
    button.addEventListener("click", () => {
      resetForm();
      setMobileView("form");
      render();
      els.fields.plaintiff.focus();
    });
    empty.append(button);
    return empty;
  }

  function createHearingButton(hearing, options = {}) {
    const date = new Date(hearing.hearingDateTime);
    const showPastBadge = Boolean(options.markPast && isPastHearing(hearing));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hearing-button";
    if (hearing.id === state.selectedId) button.classList.add("selected");
    if (isDeletedHearing(hearing)) button.classList.add("deleted");
    if (showPastBadge) button.classList.add("past-hearing");
    button.classList.add(getStatusClass(hearing.status));
    button.innerHTML = `
      <span class="hearing-time">${formatTime(date)}</span>
      <span class="hearing-parties">${escapeHtml(hearing.plaintiff)} - ${escapeHtml(hearing.defendant)}</span>
      ${createStatusBadgeHtml(hearing.status)}
      ${showPastBadge ? `<span class="past-badge">Prošlo</span>` : ""}
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
    button.classList.add(getStatusClass(hearing.status));
    button.innerHTML = `
      <span class="search-result-date">${formatLongDateTime(date)}</span>
      <span class="search-result-parties">${escapeHtml(hearing.plaintiff)} - ${escapeHtml(hearing.defendant)}</span>
      <span class="search-result-meta">${escapeHtml(hearing.caseNumber || "Bez broja predmeta")}${hearing.disputeSubject ? ` | ${escapeHtml(hearing.disputeSubject)}` : ""}</span>
      ${createStatusBadgeHtml(hearing.status)}
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
    els.searchMessage.textContent = state.searchError;
    els.searchMessage.classList.toggle("error", Boolean(state.searchError));

    if (state.searchError) {
      const error = document.createElement("div");
      error.className = "search-empty error";
      error.textContent = state.searchError;
      els.searchResults.append(error);
      return;
    }

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
    els.detailsStatus.replaceChildren(createStatusBadge(hearing.status));
    els.detailsReminders.textContent = getReminderSummary(hearing);
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
    els.fields.status.value = normalizeStatus(hearing.status);
    applyRemindersToForm(hearing);
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
    checkDueReminders();
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
    checkDueReminders();
  }

  function resetForm(options = {}) {
    state.editingId = null;
    els.form.reset();
    els.fields.id.value = "";
    setDefaultDateTime();
    els.fields.status.value = DEFAULT_HEARING_STATUS;
    setDefaultReminderForm();
    if (!options.keepMessage) clearValidation();
    updateFormMode();
  }

  function setDefaultDateTime() {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    els.fields.hearingDateTime.value = toDateTimeInputValue(nextHour);
    els.fields.status.value = DEFAULT_HEARING_STATUS;
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

  function getScheduleHearings() {
    return getVisibleHearings()
      .filter((hearing) => {
        const date = new Date(hearing.hearingDateTime);
        return !Number.isNaN(date.getTime()) && matchesScheduleView(date);
      })
      .sort(compareHearingsByDate);
  }

  function getScheduleDays(hearings) {
    return getVisibleDaysWithHearings(hearings);
  }

  function getVisibleDaysWithHearings(hearings) {
    const keys = new Set();
    return hearings
      .map((hearing) => stripTime(new Date(hearing.hearingDateTime)))
      .filter((date) => {
        const key = toDateKey(date);
        if (keys.has(key)) return false;
        keys.add(key);
        return true;
      })
      .sort((a, b) => a - b);
  }

  function matchesScheduleView(date) {
    if (state.scheduleView === "today") return isToday(date);
    if (state.scheduleView === "week") return isThisWeek(date);
    if (state.scheduleView === "next30") return isWithinNextDays(date, 30);
    if (state.scheduleView === "custom") return date >= state.visibleStart && date <= state.visibleEnd;
    return true;
  }

  function compareHearingsByDate(a, b) {
    return new Date(a.hearingDateTime) - new Date(b.hearingDateTime);
  }

  function updateScheduleViewButtons() {
    const todayCount = getVisibleHearings().filter((hearing) => isToday(new Date(hearing.hearingDateTime))).length;
    els.scheduleViewButtons.forEach((button) => {
      const isActive = button.dataset.scheduleView === state.scheduleView;
      button.classList.toggle("active", isActive);
      button.classList.toggle("has-items", button.dataset.scheduleView === "today" && todayCount > 0);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    els.loadMoreWrap.hidden = state.scheduleView !== "custom";
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

  function isAllowedStatus(value) {
    return HEARING_STATUSES.some((status) => status.value === value);
  }

  function normalizeStatus(value, fallback = DEFAULT_HEARING_STATUS) {
    const normalized = normalizeSearch(value);
    const aliases = {
      zakazano: "zakazano",
      odgodeno: "odgođeno",
      otkazano: "otkazano",
      odrzano: "održano"
    };
    return aliases[normalized] || fallback;
  }

  function getStatusConfig(value) {
    const status = normalizeStatus(value);
    return HEARING_STATUSES.find((item) => item.value === status) || HEARING_STATUSES[0];
  }

  function getStatusClass(value) {
    return getStatusConfig(value).className;
  }

  function getStatusLabel(value) {
    return getStatusConfig(value).label;
  }

  function createStatusBadge(value) {
    const badge = document.createElement("span");
    badge.className = `status-badge ${getStatusClass(value)}`;
    badge.textContent = getStatusLabel(value);
    return badge;
  }

  function createStatusBadgeHtml(value) {
    return `<span class="status-badge ${escapeHtml(getStatusClass(value))}">${escapeHtml(getStatusLabel(value))}</span>`;
  }

  function getReminderSummary(hearing) {
    if (hearing.reminderDisabled) return "Podsjetnici su isključeni za ovo ročište";
    const reminders = normalizeReminders(hearing.reminders);
    if (!reminders.length) return "Nema podsjetnika";
    return reminders.map((reminder) => reminder.label).join(", ");
  }

  function formatReminderOffset(minutesBefore) {
    if (minutesBefore % (24 * 60) === 0) {
      const days = minutesBefore / (24 * 60);
      return days === 1 ? "1 dan prije" : `${days} dana prije`;
    }
    if (minutesBefore % 60 === 0) {
      const hours = minutesBefore / 60;
      return hours === 1 ? "1 sat prije" : `${hours} sati prije`;
    }
    return minutesBefore === 1 ? "1 minuta prije" : `${minutesBefore} minuta prije`;
  }

  function formatReminderDueText(reminderAt) {
    const now = new Date();
    if (reminderAt <= now) return "dospjelo";
    return formatLongDateTime(reminderAt);
  }

  function matchesFilters(hearing) {
    const filters = state.filters;
    if (filters.status && normalizeStatus(hearing.status) !== filters.status) return false;
    if (!matchesDateRange(hearing, filters)) return false;

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

  function clearFilters(options = {}) {
    Object.keys(state.filters).forEach((key) => {
      state.filters[key] = "";
      els.filters[key].value = "";
    });
    state.searchError = "";
    state.showAllSearchResults = Boolean(options.showAll);
    state.searchSubmitted = Boolean(options.showAll);
    render();
  }

  function applySearch() {
    Object.entries(els.filters).forEach(([key, input]) => {
      if (key === "status") {
        state.filters[key] = normalizeStatus(input.value, "");
        return;
      }
      if (key === "dateFrom" || key === "dateTo") {
        state.filters[key] = input.value.trim();
        return;
      }
      state.filters[key] = normalizeSearch(input.value);
    });
    state.searchError = validateSearchDateRange();
    state.showAllSearchResults = false;
    state.searchSubmitted = true;
    render();
    requestAnimationFrame(() => {
      els.searchResults.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function getSearchResults() {
    if (state.searchError || (!hasActiveFilters() && !state.showAllSearchResults)) return [];
    return getVisibleHearings()
      .filter(matchesFilters)
      .sort((a, b) => new Date(a.hearingDateTime) - new Date(b.hearingDateTime));
  }

  function applyDatePreset(preset) {
    const today = stripTime(new Date());
    let from = "";
    let to = "";

    if (preset === "all") {
      clearFilters({ showAll: true });
      requestAnimationFrame(() => {
        els.searchResults.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    if (preset === "today") {
      from = today;
      to = today;
    } else if (preset === "this-week") {
      from = getWeekStart(today);
      to = addDays(from, 6);
    } else if (preset === "next-30") {
      from = today;
      to = addDays(today, 30);
    } else if (preset === "this-month") {
      from = startOfMonth(today);
      to = endOfMonth(today);
    }

    els.filters.dateFrom.value = from ? toDateKey(from) : "";
    els.filters.dateTo.value = to ? toDateKey(to) : "";
    applySearch();
  }

  function validateSearchDateRange() {
    const from = parseDateInput(state.filters.dateFrom);
    const to = parseDateInput(state.filters.dateTo);
    if (from && to && from > to) return "Datum od ne smije biti kasniji od datuma do.";
    return "";
  }

  function matchesDateRange(hearing, filters) {
    const hearingDate = new Date(hearing.hearingDateTime);
    if (Number.isNaN(hearingDate.getTime())) return false;

    const from = parseDateInput(filters.dateFrom);
    const to = parseDateInput(filters.dateTo);
    if (from && hearingDate < from) return false;
    if (to && hearingDate > endOfDay(to)) return false;
    return true;
  }

  function jumpToSelectedMonth() {
    const month = Number(els.monthSelect.value);
    const year = Number(els.yearInput.value);
    if (!Number.isInteger(month) || !Number.isInteger(year)) return;

    const target = new Date(year, month, 1);
    state.scheduleView = "custom";
    state.visibleStart = startOfMonth(target);
    state.visibleEnd = endOfMonth(addMonths(target, 18));
    render();
    requestAnimationFrame(() => {
      document.getElementById(`month-${year}-${month}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function scrollToToday() {
    state.scheduleView = "today";
    state.visibleStart = weekStart;
    state.visibleEnd = getDefaultVisibleEnd();
    render();
    requestAnimationFrame(() => {
      document.getElementById(`day-${toDateKey(startOfToday)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function setScheduleView(view) {
    if (!SCHEDULE_VIEWS[view]) return;
    state.scheduleView = view;
    render();
    requestAnimationFrame(() => {
      els.calendarGrid.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (state.scheduleView === "today") {
      els.rangeLabel.textContent = `Danas: ${formatShortDate(startOfToday)} ${startOfToday.getFullYear()}.`;
      return;
    }
    if (state.scheduleView === "week") {
      const weekEnd = addDays(weekStart, 6);
      els.rangeLabel.textContent = `Ovaj tjedan: ${formatShortDate(weekStart)} ${weekStart.getFullYear()}. - ${formatShortDate(weekEnd)} ${weekEnd.getFullYear()}.`;
      return;
    }
    if (state.scheduleView === "next30") {
      const end = addDays(startOfToday, 30);
      els.rangeLabel.textContent = `Sljedećih 30 dana: ${formatShortDate(startOfToday)} ${startOfToday.getFullYear()}. - ${formatShortDate(end)} ${end.getFullYear()}.`;
      return;
    }
    if (state.scheduleView === "all") {
      els.rangeLabel.textContent = state.showDeleted ? "Sva ročišta, uključujući obrisane" : "Sva aktivna ročišta";
      return;
    }
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

  function fillStatusSelects() {
    els.fields.status.replaceChildren();
    HEARING_STATUSES.forEach((status) => {
      const option = document.createElement("option");
      option.value = status.value;
      option.textContent = status.label;
      els.fields.status.append(option);
    });
    els.fields.status.value = DEFAULT_HEARING_STATUS;

    els.filters.status.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Svi statusi";
    els.filters.status.append(allOption);
    HEARING_STATUSES.forEach((status) => {
      const option = document.createElement("option");
      option.value = status.value;
      option.textContent = status.label;
      els.filters.status.append(option);
    });
  }

  function loadHearings() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && item.id && item.hearingDateTime)
        .map((item) => ({
          ...item,
          status: normalizeStatus(item.status),
          reminders: normalizeReminders(item.reminders),
          reminderDismissedAt: getOptionalImportString(item.reminderDismissedAt),
          reminderSnoozedUntil: getOptionalImportString(item.reminderSnoozedUntil),
          reminderDisabled: Boolean(item.reminderDisabled),
          reminderEvents: normalizeReminderEvents(item.reminderEvents)
        }));
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

  function endOfDay(date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  function parseDateInput(value) {
    if (!value) return null;
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;

    const [year, month, day] = parts;
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    return stripTime(parsed);
  }

  function isToday(date) {
    return isSameDay(date, startOfToday);
  }

  function isThisWeek(date) {
    const day = stripTime(date);
    return day >= weekStart && day <= addDays(weekStart, 6);
  }

  function isWithinNextDays(date, days) {
    const day = stripTime(date);
    return day >= startOfToday && day <= addDays(startOfToday, days);
  }

  function isPastHearing(hearing) {
    const date = new Date(hearing.hearingDateTime);
    return !Number.isNaN(date.getTime()) && date < new Date();
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
      .replace(/[đð]/g, "d")
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

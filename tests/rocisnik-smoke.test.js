const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const STORAGE_KEY = "rocisnik.hearings.v1";
const LAST_BACKUP_AT_KEY = "rocisnik.lastBackupAt.v1";
const LAST_JSON_EXPORT_AT_KEY = "rocisnik.lastJsonExportAt";
const LAST_JSON_IMPORT_AT_KEY = "rocisnik.lastJsonImportAt";
const SECURITY_NOTICE_ACCEPTED_AT_KEY = "securityNoticeAcceptedAt";
const ONBOARDING_COMPLETED_AT_KEY = "onboardingCompletedAt";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

async function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const target = path.normalize(path.join(ROOT, pathname));

      if (!target.startsWith(ROOT)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const content = await fs.readFile(target);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": MIME_TYPES[path.extname(target)] || "application/octet-stream"
      });
      response.end(content);
    } catch (error) {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/?qa=smoke-regression`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function fillRequiredHearing(page, values = {}) {
  await page.fill("#plaintiff", values.plaintiff || "Croatia osiguranje");
  await page.fill("#defendant", values.defendant || "Marko Markovic");
  await page.fill("#caseNumber", values.caseNumber || "P-123/2026");
  await page.fill("#hearingDateTime", values.hearingDateTime || toDateTimeInputValue(addMinutes(new Date(), 90)));
  await page.fill("#disputeSubject", values.disputeSubject || "Naknada stete");
  await page.fill("#disputeValue", values.disputeValue || "1.000 EUR");
  await page.fill("#specificity", values.specificity || "Pripremno rociste");
}

async function run() {
  const app = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleMessages = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await page.goto(app.url, { waitUntil: "domcontentloaded" });

    assert.equal(await page.title(), "Ročišnik");
    await assertVisibleText(page, "h1", "Ročišnik");
    await assertVisibleText(page, "#onboardingModal", "Kako koristiti Ročišnik");
    await assertVisibleText(page, "#onboardingModal", "Redovito izvozite sigurnosnu kopiju");
    await page.click("#onboardingFinishButton");
    assert.equal(await page.locator("#onboardingModal").isHidden(), true);
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_COMPLETED_AT_KEY));
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#onboardingModal").isHidden(), true);
    await page.click("#onboardingButton");
    await assertVisibleText(page, "#onboardingModal", "Za osjetljive podatke koristite samo zaštićen uređaj.");
    await page.click("#onboardingSkipButton");
    assert.equal(await page.locator("#onboardingModal").isHidden(), true);

    await assertVisibleText(page, "#securityPrompt", "Sigurnosna napomena");
    await assertVisibleText(page, "#securityPrompt", "osjetljivih stvarnih podataka");
    await assertVisibleText(page, "#lastJsonExportAt", "nikada");
    await assertVisibleText(page, "#lastJsonImportAt", "nikada");

    await page.click("#securityPromptMoreButton");
    await assertVisibleText(page, "#securityNoticeModal", "Ova aplikacija sprema podatke lokalno");
    await page.click("#securityNoticeDismissButton");
    assert.equal(await page.locator("#securityPrompt").isVisible(), true);

    await page.click("#securityPromptAcceptButton");
    assert.equal(await page.locator("#securityPrompt").isHidden(), true);
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), SECURITY_NOTICE_ACCEPTED_AT_KEY));
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#securityPrompt").isHidden(), true);
    await assertScheduleViewActive(page, "next30");
    await assertVisibleText(page, "#summaryTodayCount", "0");
    await assertVisibleText(page, "#summaryTodayMeta", "0 nadolazi");
    await assertVisibleText(page, "#summaryWeekCount", "0");
    await assertVisibleText(page, "#summaryWeekMeta", "0 nadolazećih");
    await assertVisibleText(page, "#summaryNext30Count", "0");
    await assertVisibleText(page, "#summaryNext30Meta", "0 odgođeno");
    await assertVisibleText(page, "#summaryActiveCount", "0");
    await assertVisibleText(page, "#summaryActiveMeta", "zakazano");
    await assertVisibleText(page, ".schedule-empty", "Još nema unesenih ročišta.");
    await assertVisibleText(page, ".schedule-empty", "Dodajte prvo ročište kako biste počeli voditi osobni raspored.");
    await assertVisibleText(page, ".schedule-empty", "Dodaj prvo ročište");
    await assertVisibleText(page, ".utility-tabs", "Pretraživanje");
    await assertVisibleText(page, ".utility-tabs", "Novo ročište");
    await assertVisibleText(page, ".utility-tabs", "Podsjetnici");
    const desktopLayout = await page.evaluate(() => {
      const utilityTabs = document.querySelector(".utility-tabs")?.getBoundingClientRect();
      const searchPanel = document.querySelector(".search-panel")?.getBoundingClientRect();
      const scheduleTabs = document.querySelector(".schedule-view-tabs")?.getBoundingClientRect();
      const scheduleDatebar = document.querySelector(".schedule-datebar")?.getBoundingClientRect();
      const next30Tab = document.querySelector('.schedule-view-tabs [data-schedule-view="next30"]')?.getBoundingClientRect();
      const quickSearchStyle = getComputedStyle(document.querySelector("#scheduleQuickSearch"));
      const filterIconStyle = getComputedStyle(document.querySelector("#scheduleFilterButton"), "::before");
      const dataNoticeClose = document.querySelector("#dismissDataNoticeButton")?.getBoundingClientRect();
      const importSummary = document.querySelector(".side-column .import-options summary")?.getBoundingClientRect();
      return {
        noHorizontalScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        utilityTabsInFirstViewport: utilityTabs ? utilityTabs.top < window.innerHeight : false,
        searchPanelStartsInFirstViewport: searchPanel ? searchPanel.top < window.innerHeight : false,
        scheduleTabsShareRowWithDatebar: scheduleTabs && scheduleDatebar
          ? Math.abs(scheduleTabs.top - scheduleDatebar.top) <= 2
          : false,
        next30TabSingleLine: next30Tab ? next30Tab.height <= 40 : false,
        quickSearchHasIcon: quickSearchStyle.backgroundImage.includes("data:image/svg+xml")
          && Number.parseFloat(quickSearchStyle.paddingLeft) >= 34,
        filterButtonHasIcon: filterIconStyle.content === '""'
          && filterIconStyle.maskImage !== "none",
        backupCloseIsCompact: dataNoticeClose ? dataNoticeClose.width <= 32 && dataNoticeClose.height <= 32 : false,
        importSummaryIsSubtle: importSummary ? importSummary.height <= 28 : false
      };
    });
    assert.equal(desktopLayout.noHorizontalScroll, true);
    assert.equal(desktopLayout.utilityTabsInFirstViewport, true);
    assert.equal(desktopLayout.searchPanelStartsInFirstViewport, true);
    assert.equal(desktopLayout.scheduleTabsShareRowWithDatebar, true);
    assert.equal(desktopLayout.next30TabSingleLine, true);
    assert.equal(desktopLayout.quickSearchHasIcon, true);
    assert.equal(desktopLayout.filterButtonHasIcon, true);
    assert.equal(desktopLayout.backupCloseIsCompact, true);
    assert.equal(desktopLayout.importSummaryIsSubtle, true);

    const onlyDeleted = {
      ...buildStoredHearing("only-deleted-record", startOfDay(new Date()), "Obrisano Samo", "Test Osoba"),
      deletedAt: new Date().toISOString()
    };
    await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify([record])), { key: STORAGE_KEY, record: onlyDeleted });
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertVisibleText(page, ".schedule-empty", "Sva ročišta su obrisana.");
    await assertVisibleText(page, ".schedule-empty", "Prikaži obrisane zapise");
    await page.click(".schedule-empty button");
    assert.equal(await page.locator("#showDeletedToggle").isChecked(), true);
    await assertScheduleIncludes(page, "Obrisano Samo");

    const futureOnly = buildStoredHearing("future-only-record", addDays(startOfDay(new Date()), 45), "Daleki Termin", "Test Osoba");
    await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify([record])), { key: STORAGE_KEY, record: futureOnly });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.click('.schedule-view-tabs [data-schedule-view="today"]');
    await assertVisibleText(page, ".schedule-empty", "Nema ročišta danas.");
    await page.click('.schedule-view-tabs [data-schedule-view="week"]');
    await assertVisibleText(page, ".schedule-empty", "Nema ročišta ovaj tjedan.");
    await page.click('.schedule-view-tabs [data-schedule-view="next30"]');
    await assertVisibleText(page, ".schedule-empty", "Nema ročišta u sljedećih 30 dana.");
    await page.click('.schedule-view-tabs [data-schedule-view="all"]');
    await assertScheduleIncludes(page, "Daleki Termin");

    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.click(".schedule-empty button");
    await assertVisibleText(page, "#formTitle", "Dodaj ročište");
    await page.click('.schedule-view-tabs [data-schedule-view="next30"]');

    assert.equal(await page.locator("#defaultReminderSelect").inputValue(), "1d");
    assert.equal(await page.locator("#reminder1d").isChecked(), true);
    await page.selectOption("#defaultReminderSelect", "2h");
    assert.equal(await page.locator("#reminder2h").isChecked(), true);
    assert.equal(await page.locator("#reminder1d").isChecked(), false);

    await fillRequiredHearing(page);
    await page.check("#reminderCustomEnabled");
    await page.fill("#reminderCustomValue", "30");
    await page.selectOption("#reminderCustomUnit", "minutes");
    assert.equal(await page.locator("#hearingStatus").inputValue(), "zakazano");
    await page.click("#submitButton");
    await assertVisibleText(page, "#formMessage", "Ročište je dodano.");
    await assertVisibleText(page, "#summaryActiveCount", "1");
    await assertVisibleText(page, "#quickAddButton", "Dodaj novo ročište");
    assert.equal(await page.locator(".hearing-button .row-more").count(), 1);
    await page.click("#quickAddButton");
    assert.equal(await page.locator("#plaintiff").evaluate((input) => document.activeElement === input), true);

    let hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(hearings.length, 1);
    assert.equal(hearings[0].status, "zakazano");
    assert.equal(hearings[0].history.length, 1);
    assert.equal(hearings[0].history[0].eventType, "created");
    assert.ok(hearings[0].history[0].eventId);
    assert.deepEqual(hearings[0].reminders.map((reminder) => reminder.minutesBefore).sort((a, b) => a - b), [30, 120]);
    assert.equal(await page.locator("#backupReminder").isVisible(), true);
    await assertVisibleText(page, "#remindersList", "Croatia osiguranje - Marko Markovic");
    await assertVisibleText(page, "#remindersList", "2 sata prije");
    await assertVisibleText(page, "#utilityReminderCount", "1");

    await page.click('[data-reminder-action="seen"]');
    await assertVisibleText(page, "#remindersList", "Nema dospjelih podsjetnika.");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.ok(Object.values(hearings[0].reminderEvents || {}).some((event) => event.dismissedAt));

    const today = startOfDay(new Date());
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const tenDaysFromToday = addDays(today, 10);
    const fortyDaysFromToday = addDays(today, 40);
    await page.waitForFunction(() => document.querySelectorAll("#hearingStatus option").length >= 4);
    const postponedStatusValue = await page.evaluate(() =>
      document.querySelectorAll("#hearingStatus option")[1]?.value || "zakazano"
    );
    const seededHearings = [
      buildStoredHearing("date-filter-yesterday", yesterday, "Datum Jucer", "Test Osoba"),
      buildStoredHearing("date-filter-today", today, "Datum Danas", "Test Osoba"),
      buildStoredHearing("date-filter-tomorrow", tomorrow, "Datum Sutra", "Test Osoba"),
      buildStoredHearing("date-filter-ten-days", tenDaysFromToday, "Datum Deset", "Test Osoba"),
      buildStoredHearing("date-filter-forty-days", fortyDaysFromToday, "Datum Cetrdeset", "Test Osoba"),
      buildStoredHearing("date-filter-canceled", tomorrow, "Datum Otkazano", "Test Osoba", "otkazano"),
      buildStoredHearing("date-filter-postponed", tomorrow, "Datum Odgodeno", "Test Osoba", postponedStatusValue),
      {
        ...buildStoredHearing("date-filter-deleted", tomorrow, "Datum Obrisano", "Test Osoba"),
        deletedAt: new Date().toISOString()
      }
    ];
    await page.evaluate(({ key, records }) => {
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([...existing, ...records]));
    }, { key: STORAGE_KEY, records: seededHearings });
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertScheduleViewActive(page, "today");
    await assertScheduleIncludes(page, "Datum Danas");
    await assertScheduleExcludes(page, "Datum Deset");
    await page.click('.schedule-view-tabs [data-schedule-view="next30"]');
    await assertScheduleViewActive(page, "next30");
    await assertScheduleIncludes(page, "Datum Danas");
    await assertScheduleIncludes(page, "Datum Deset");
    await assertScheduleIncludes(page, "Datum Otkazano");
    await assertScheduleIncludes(page, "Odgođeno");
    await assertScheduleExcludes(page, "Datum Jucer");
    await assertScheduleExcludes(page, "Datum Cetrdeset");
    await assertScheduleExcludes(page, "Datum Obrisano");

    await page.click('.schedule-view-tabs [data-schedule-view="today"]');
    await assertScheduleViewActive(page, "today");
    await assertScheduleIncludes(page, "Datum Danas");
    await assertScheduleExcludes(page, "Datum Sutra");

    await page.click('.schedule-view-tabs [data-schedule-view="week"]');
    await assertScheduleViewActive(page, "week");
    await assertScheduleIncludes(page, "Datum Danas");
    await assertScheduleExcludes(page, "Datum Cetrdeset");

    await page.click('.schedule-view-tabs [data-schedule-view="next30"]');
    await assertScheduleViewActive(page, "next30");
    await assertScheduleIncludes(page, "Datum Deset");
    await assertScheduleExcludes(page, "Datum Cetrdeset");

    await page.click('.schedule-view-tabs [data-schedule-view="all"]');
    await assertScheduleViewActive(page, "all");
    await assertScheduleIncludes(page, "Datum Jucer");
    await assertScheduleIncludes(page, "Datum Cetrdeset");
    await assertScheduleIncludes(page, "Prošlo");
    await assertScheduleExcludes(page, "Datum Obrisano");

    await page.fill("#filterDateFrom", toDateKey(today));
    await page.fill("#filterDateTo", toDateKey(tomorrow));
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Danas");
    await assertSearchIncludes(page, "Datum Sutra");
    await assertSearchExcludes(page, "Datum Deset");
    await assertSearchExcludes(page, "Datum Obrisano");

    await page.click("#clearFiltersButton");
    await page.fill("#filterDateFrom", toDateKey(tenDaysFromToday));
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Deset");
    await assertSearchIncludes(page, "Datum Cetrdeset");
    await assertSearchExcludes(page, "Datum Sutra");

    await page.click("#clearFiltersButton");
    await page.fill("#filterDateTo", toDateKey(tomorrow));
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Danas");
    await assertSearchIncludes(page, "Datum Sutra");
    await assertSearchExcludes(page, "Datum Deset");

    await page.click("#clearFiltersButton");
    await page.fill("#filterDateFrom", toDateKey(tomorrow));
    await page.fill("#filterDateTo", toDateKey(tomorrow));
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Sutra");
    await assertSearchExcludes(page, "Datum Danas");

    await page.click("#clearFiltersButton");
    await page.fill("#filterDateFrom", toDateKey(tenDaysFromToday));
    await page.fill("#filterDateTo", toDateKey(today));
    await page.click("#searchButton");
    await assertVisibleText(page, "#searchMessage", "Datum od ne smije biti kasniji od datuma do.");
    await assertSearchExcludes(page, "Datum Deset");

    await page.click('[data-date-preset="today"]');
    await assertSearchIncludes(page, "Datum Danas");
    await assertSearchExcludes(page, "Datum Sutra");

    await page.click('[data-date-preset="this-week"]');
    await assertSearchIncludes(page, "Datum Danas");
    await assertSearchExcludes(page, "Datum Cetrdeset");

    await page.click('[data-date-preset="next-30"]');
    await assertSearchIncludes(page, "Datum Deset");
    await assertSearchExcludes(page, "Datum Cetrdeset");

    await page.click('[data-date-preset="this-month"]');
    await assertSearchIncludes(page, "Datum Danas");
    await assertSearchExcludes(page, "Datum Cetrdeset");

    await page.click('[data-date-preset="all"]');
    await assertSearchIncludes(page, "Datum Cetrdeset");
    await assertSearchExcludes(page, "Datum Obrisano");

    await page.click("#clearFiltersButton");
    await page.fill("#filterDateFrom", toDateKey(tomorrow));
    await page.fill("#filterDateTo", toDateKey(tomorrow));
    await page.selectOption("#filterStatus", "otkazano");
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Otkazano");
    await assertSearchExcludes(page, "Datum Sutra");

    await page.click("#scheduleFilterButton");
    await page.check("#showDeletedToggle");
    await page.click("#clearFiltersButton");
    await page.fill("#filterDateFrom", toDateKey(tomorrow));
    await page.fill("#filterDateTo", toDateKey(tomorrow));
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Obrisano");
    await page.uncheck("#showDeletedToggle");

    await page.click("#clearFiltersButton");
    await page.fill("#filterPlaintiff", "Ne postoji");
    await page.click("#searchButton");
    await assertVisibleText(page, ".search-empty", "Nema rezultata za zadane kriterije.");
    await assertVisibleText(page, ".search-empty", "Očisti filtre");
    await assertVisibleText(page, ".search-empty", "Dodaj novo ročište");
    await page.locator(".search-empty button").filter({ hasText: "Očisti filtre" }).click();
    await assertVisibleText(page, ".search-empty", "Upiši kriterij i pritisni Pretraži.");

    await page.fill("#filterPlaintiff", "Croatia");
    await page.selectOption("#filterStatus", "zakazano");
    await page.click("#searchButton");
    await assertVisibleText(page, ".search-results-heading", "1 pronađena rasprava");
    await assertVisibleText(page, ".search-result-button", "Zakazano");

    await page.click(".search-result-button");
    await assertVisibleText(page, "#detailsParties", "P-123/2026");
    await assertVisibleText(page, "#detailsHeaderStatus", "Zakazano");
    await assertVisibleText(page, "#moreDetailsButton", "Više");
    await assertVisibleText(page, "#detailsCaseParties", "Croatia osiguranje - Marko Markovic");
    await assertVisibleText(page, "#detailsPlaintiff", "Croatia osiguranje");
    await assertVisibleText(page, "#detailsDefendant", "Marko Markovic");
    assert.equal(await page.locator(".side-column .details-panel").evaluate((element) => element.scrollHeight <= element.clientHeight + 1), true);
    assert.equal(await page.locator(".side-column .detail-date-row").evaluate((element) => {
      const iconStyle = getComputedStyle(element, "::before");
      return iconStyle.content === '""' && iconStyle.maskImage !== "none";
    }), true);
    assert.equal(await page.locator("#historyPanel").evaluate((element) => element.open), false);
    await page.click("#moreDetailsButton");
    assert.equal(await page.locator("#historyPanel").evaluate((element) => element.open), true);
    await assertVisibleText(page, "#detailsHistory", "Zapis stvoren");

    await page.click("#editButton");
    await page.selectOption("#hearingStatus", "otkazano");
    await page.click("#submitButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(hearings[0].status, "otkazano");
    assert.ok(hearings[0].history.some((event) => event.eventType === "status-changed" && event.changedFields.includes("status")));
    await assertVisibleText(page, "#detailsHeaderStatus", "Otkazano");
    await openHistoryPanel(page);
    await assertVisibleText(page, "#detailsHistory", "Status promijenjen");
    await assertVisibleText(page, "#remindersList", "Nema dospjelih podsjetnika.");

    await page.selectOption("#filterStatus", "otkazano");
    await page.click("#searchButton");
    await assertVisibleText(page, ".search-results-heading", "1 pronađena rasprava");

    await page.click("#deleteButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.ok(hearings[0].deletedAt, "Soft-delete should keep a deletedAt timestamp");
    assert.ok(hearings[0].history.some((event) => event.eventType === "deleted"));
    assert.equal(await page.locator("#detailsContent").isHidden(), true);

    await page.check("#showDeletedToggle");
    await page.click(".hearing-button.deleted");
    await assertVisibleText(page, "#deletedStatus", "Obrisano");
    await openHistoryPanel(page);
    await assertVisibleText(page, "#detailsHistory", "Zapis obrisan");
    await page.click("#restoreButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(Boolean(hearings[0].deletedAt), false);
    assert.ok(hearings[0].history.some((event) => event.eventType === "restored"));

    await page.evaluate((key) => localStorage.removeItem(key), LAST_BACKUP_AT_KEY);
    await page.uncheck("#showDeletedToggle");
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#backupReminder").isVisible(), true);

    await page.click("#backupReminderExportButton");
    await assertVisibleText(page, "#jsonExportModal", "JSON backup je spreman");
    await assertVisibleText(page, "#jsonExportModal", "JSON backup može sadržavati osjetljive podatke.");
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), LAST_BACKUP_AT_KEY));
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), LAST_JSON_EXPORT_AT_KEY));
    await assertVisibleText(page, "#lastJsonExportAt", ".");
    await assertVisibleText(page, "#lastJsonImportAt", "nikada");
    assert.equal(await page.locator("#backupReminder").isHidden(), true);

    const downloadPromise = page.waitForEvent("download");
    await page.click("#jsonExportDownloadButton");
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^rocisnik-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backupPath = await download.path();
    const exportedBackup = JSON.parse(await fs.readFile(backupPath, "utf8"));
    assert.ok(exportedBackup.hearings[0].history.some((event) => event.eventType === "created"));
    assert.ok(exportedBackup.hearings[0].history.some((event) => event.eventType === "restored"));

    await page.evaluate(() => {
      window.__sharedJsonBackup = null;
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (payload) => {
          window.__sharedJsonBackup = {
            title: payload.title,
            text: payload.text,
            fileName: payload.files?.[0]?.name || "",
            fileType: payload.files?.[0]?.type || ""
          };
        }
      });
    });
    await page.click("#jsonExportShareButton");
    const sharedBackup = await page.waitForFunction(() => window.__sharedJsonBackup).then((handle) => handle.jsonValue());
    assert.equal(sharedBackup.title, "Ročišnik JSON backup");
    assert.equal(sharedBackup.text, "U privitku je JSON sigurnosna kopija ročišnika.");
    assert.match(sharedBackup.fileName, /^rocisnik-backup-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(sharedBackup.fileType, "application/json");
    await page.click("#jsonExportDismissButton");

    await page.evaluate((key) => localStorage.removeItem(key), LAST_BACKUP_AT_KEY);
    await page.click("#exportEncryptedButton");
    await assertVisibleText(page, "#encryptedBackupModal", "Izvezi šifrirani backup");
    await page.fill("#encryptedPassword", "SigurnaLozinka123!");
    await page.fill("#encryptedPasswordConfirm", "DrugaLozinka123!");
    await page.click("#encryptedBackupConfirmButton");
    await assertVisibleText(page, "#encryptedBackupMessage", "Lozinke se ne podudaraju.");
    assert.equal(await page.locator("#encryptedPassword").getAttribute("type"), "password");
    await page.check("#showEncryptedPassword");
    assert.equal(await page.locator("#encryptedPassword").getAttribute("type"), "text");
    assert.equal(await page.locator("#encryptedPasswordConfirm").getAttribute("type"), "text");
    await page.uncheck("#showEncryptedPassword");
    assert.equal(await page.locator("#encryptedPassword").getAttribute("type"), "password");

    await page.fill("#encryptedPassword", "SigurnaLozinka123!");
    await page.fill("#encryptedPasswordConfirm", "SigurnaLozinka123!");
    const encryptedDownloadPromise = page.waitForEvent("download");
    await page.click("#encryptedBackupConfirmButton");
    const encryptedDownload = await encryptedDownloadPromise;
    assert.match(encryptedDownload.suggestedFilename(), /^rocisnik-encrypted-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const encryptedBackupPath = await encryptedDownload.path();
    const encryptedBackupRaw = await fs.readFile(encryptedBackupPath, "utf8");
    const encryptedBackup = JSON.parse(encryptedBackupRaw);
    assert.equal(encryptedBackup.formatVersion, 1);
    assert.deepEqual(encryptedBackup.algorithm, { name: "AES-GCM", length: 256 });
    assert.equal(encryptedBackup.kdf.name, "PBKDF2");
    assert.equal(encryptedBackup.kdf.hash, "SHA-256");
    assert.ok(encryptedBackup.kdf.iterations >= 250000);
    assert.ok(encryptedBackup.kdf.salt);
    assert.ok(encryptedBackup.iv);
    assert.ok(encryptedBackup.ciphertext);
    assert.equal(encryptedBackupRaw.includes("Croatia osiguranje"), false);
    assert.equal(encryptedBackupRaw.includes("Marko Markovic"), false);
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), LAST_BACKUP_AT_KEY));
    const storageAfterEncryptedExport = await page.evaluate(() => Object.values(localStorage).join(" "));
    assert.equal(storageAfterEncryptedExport.includes("SigurnaLozinka123!"), false);

    await page.click(".import-options summary");
    const recordsBeforeWrongPassword = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    await page.check('input[name="importMode"][value="replace"]');
    await page.setInputFiles("#importEncryptedFile", encryptedBackupPath);
    await assertVisibleText(page, "#encryptedBackupModal", "Uvezi šifrirani backup");
    await page.fill("#encryptedPassword", "PogresnaLozinka123!");
    await page.click("#encryptedBackupConfirmButton");
    await page.waitForFunction(() => document.querySelector("#encryptedBackupMessage")?.textContent.includes("Lozinka nije ispravna"));
    await assertVisibleText(page, "#encryptedBackupMessage", "Lozinka nije ispravna ili datoteka nije valjan šifrirani backup.");
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), recordsBeforeWrongPassword);

    await page.fill("#encryptedPassword", "SigurnaLozinka123!");
    await page.click("#encryptedBackupConfirmButton");
    await page.waitForFunction(() => document.querySelector("#backupMessage")?.textContent.includes("Uvoz je dovršen."));
    await assertVisibleText(page, "#backupMessage", "Uvoz je dovršen.");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.ok(hearings.some((hearing) => hearing.plaintiff === "Croatia osiguranje"));
    assert.ok(hearings.some((hearing) => hearing.history?.some((event) => event.eventType === "imported")));
    const storageAfterEncryptedImport = await page.evaluate(() => Object.values(localStorage).join(" "));
    assert.equal(storageAfterEncryptedImport.includes("SigurnaLozinka123!"), false);
    await page.check('input[name="importMode"][value="append"]');

    const importDir = await fs.mkdtemp(path.join(os.tmpdir(), "rocisnik-import-"));
    const importRecord = buildStoredHearing("import-history-record", addDays(today, 3), "Import Povijest", "Test Osoba");
    importRecord.history = [{
      eventId: "existing-import-history",
      eventType: "created",
      timestamp: new Date().toISOString(),
      actor: "local-user",
      changedFields: ["plaintiff"],
      previousValues: {},
      newValues: { plaintiff: "Import Povijest" },
      note: "Postojeća povijest"
    }];
    const importPath = path.join(importDir, "rocisnik-import-history.json");
    const invalidImportPath = path.join(importDir, "rocisnik-invalid.json");
    await fs.writeFile(invalidImportPath, JSON.stringify({ formatVersion: 1, hearings: [{ id: "broken" }] }), "utf8");
    await fs.writeFile(importPath, JSON.stringify({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      metadata: { appName: "Ročišnik", storageKey: STORAGE_KEY },
      hearings: [importRecord]
    }), "utf8");
    await page.evaluate((key) => localStorage.removeItem(key), LAST_JSON_IMPORT_AT_KEY);
    await page.setInputFiles("#importJsonFile", invalidImportPath);
    await page.waitForFunction(() => document.querySelector("#backupMessage")?.textContent.includes("nije ispravno"));
    await assertVisibleText(page, "#backupMessage", "nije ispravno");
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), LAST_JSON_IMPORT_AT_KEY), null);

    await page.setInputFiles("#importJsonFile", importPath);
    await page.waitForFunction((key) => {
      const hearings = JSON.parse(localStorage.getItem(key) || "[]");
      return hearings.some((hearing) => hearing.id === "import-history-record");
    }, STORAGE_KEY);
    await assertVisibleText(page, "#backupMessage", "Uvoz je dovršen.");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    const imported = hearings.find((hearing) => hearing.id === "import-history-record");
    assert.ok(imported, "Imported hearing should be saved");
    assert.ok(imported.history.some((event) => event.eventId === "existing-import-history"));
    assert.ok(imported.history.some((event) => event.eventType === "imported"));
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), LAST_JSON_IMPORT_AT_KEY));
    await assertVisibleText(page, "#lastJsonImportAt", ".");
    await fs.rm(importDir, { recursive: true, force: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".mobile-tabs").isVisible(), true);
    await page.click('[data-mobile-view="schedule"]');
    assert.equal(await page.locator('.schedule-view-tabs [data-schedule-view="today"]').isVisible(), true);
    assert.equal(await page.locator('.schedule-view-tabs [data-schedule-view="next30"]').isVisible(), true);
    await page.click('[data-mobile-view="search"]');
    assert.equal(await page.locator(".search-panel").isVisible(), true);
    assert.equal(await page.locator("#filterStatus").isVisible(), true);
    assert.equal(await page.locator("#filterDateFrom").isVisible(), true);
    assert.equal(await page.locator('[data-date-preset="next-30"]').isVisible(), true);

    const relevantMessages = consoleMessages.filter((line) => !line.includes("favicon"));
    assert.deepEqual(relevantMessages, []);

    console.log("OK: Ročišnik smoke/regression test passed.");
  } finally {
    await browser.close();
    await app.close();
  }
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function toDateKey(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateTimeInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildStoredHearing(id, date, plaintiff, defendant, status = "zakazano") {
  const createdAt = new Date().toISOString();
  return {
    id,
    plaintiff,
    defendant,
    caseNumber: `P-${id}/2026`,
    hearingDateTime: toDateTimeInputValue(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 0)),
    status,
    reminders: [],
    reminderDisabled: true,
    disputeSubject: "Test datuma",
    disputeValue: "100 EUR",
    specificity: "Smoke test",
    createdAt,
    updatedAt: createdAt
  };
}

async function assertVisibleText(page, selector, expectedText) {
  const locator = page.locator(selector);
  await assert.equal(await locator.isVisible(), true, `${selector} should be visible`);
  const text = await locator.innerText();
  assert.ok(text.includes(expectedText), `${selector} should contain "${expectedText}", got "${text}"`);
}

async function openHistoryPanel(page) {
  const isOpen = await page.locator("#historyPanel").evaluate((element) => element.open);
  if (!isOpen) await page.click("#historyPanel summary");
}

async function assertSearchIncludes(page, expectedText) {
  const text = await page.locator("#searchResults").innerText();
  assert.ok(text.includes(expectedText), `Search results should contain "${expectedText}", got "${text}"`);
}

async function assertSearchExcludes(page, unexpectedText) {
  const text = await page.locator("#searchResults").innerText();
  assert.equal(text.includes(unexpectedText), false, `Search results should not contain "${unexpectedText}", got "${text}"`);
}

async function assertScheduleViewActive(page, view) {
  assert.equal(await page.locator(`.schedule-view-tabs [data-schedule-view="${view}"]`).getAttribute("aria-pressed"), "true");
}

async function assertScheduleIncludes(page, expectedText) {
  const text = await page.locator("#calendarGrid").innerText();
  assert.ok(text.includes(expectedText), `Schedule should contain "${expectedText}", got "${text}"`);
}

async function assertScheduleExcludes(page, unexpectedText) {
  const text = await page.locator("#calendarGrid").innerText();
  assert.equal(text.includes(unexpectedText), false, `Schedule should not contain "${unexpectedText}", got "${text}"`);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

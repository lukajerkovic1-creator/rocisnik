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
    await assertActivePanel(page, "#onboardingModal .modal-panel");
    await assertOpaqueModalPanel(page, "#onboardingModal .modal-panel");
    await assertVisibleText(page, "#onboardingModal", "Za osjetljive podatke koristite samo zaštićen uređaj.");
    await page.click("#onboardingSkipButton");
    assert.equal(await page.locator("#onboardingModal").isHidden(), true);

    await assertVisibleText(page, "#securityPrompt", "Sigurnosna napomena");
    await assertVisibleText(page, "#securityPrompt", "osjetljivih stvarnih podataka");
    await assertVisibleText(page, "#lastJsonExportAt", "nikada");
    await assertVisibleText(page, "#lastJsonImportAt", "nikada");

    await page.click("#securityPromptMoreButton");
    await assertActivePanel(page, "#securityNoticeModal .modal-panel");
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
    await assertVisibleText(page, ".schedule-empty", "Za prvi unos koristite gornji gumb Novo ročište.");
    await assertSingleNewHearingButton(page);
    await assertVisibleText(page, ".mobile-tabs", "Raspored");
    assert.equal(await page.locator('.mobile-tab[data-mobile-view="twoWeek"]').count(), 0);
    assert.equal(await page.locator(".two-week-panel").isVisible(), true);
    assert.equal(await page.locator(".schedule-panel").isVisible(), true);
    assert.equal(await page.locator(".search-panel").isVisible(), false);
    const desktopLayout = await page.evaluate(() => {
      const utilityTabs = document.querySelector(".search-panel .utility-tabs")?.getBoundingClientRect();
      const searchPanel = document.querySelector(".search-panel")?.getBoundingClientRect();
      const twoWeekPanel = document.querySelector(".two-week-panel")?.getBoundingClientRect();
      const schedulePanel = document.querySelector(".schedule-panel")?.getBoundingClientRect();
      const scheduleTabs = document.querySelector(".schedule-view-tabs")?.getBoundingClientRect();
      const scheduleDatebar = document.querySelector(".schedule-datebar")?.getBoundingClientRect();
      const dateLabel = document.querySelector(".schedule-date-label")?.getBoundingClientRect();
      const next30Tab = document.querySelector('.schedule-view-tabs [data-schedule-view="next30"]')?.getBoundingClientRect();
      const dateLabelIconStyle = getComputedStyle(document.querySelector(".schedule-date-label"), "::before");
      const overviewCardStyle = getComputedStyle(document.querySelector(".overview-card"));
      const activeOverviewCardStyle = getComputedStyle(document.querySelector(".overview-card.active"));
      const quickSearchStyle = getComputedStyle(document.querySelector("#scheduleQuickSearch"));
      const filterIconStyle = getComputedStyle(document.querySelector("#scheduleFilterButton"), "::before");
      const topNewIconStyle = getComputedStyle(document.querySelector("#clearSelectionButton"), "::before");
      const topbarActionIconStyle = getComputedStyle(document.querySelector(".topbar-action-icon"));
      const topbarActionSvg = document.querySelector(".topbar-action-icon svg")?.getBoundingClientRect();
      const topbarUtilityButtons = ["#dataSafetyButton", "#onboardingButton", "#settingsButton"].map((selector) => {
        const button = document.querySelector(selector);
        const style = getComputedStyle(button);
        return {
          paddingRight: Number.parseFloat(style.paddingRight),
          paddingLeft: Number.parseFloat(style.paddingLeft),
          contentFits: button.scrollWidth <= button.clientWidth + 1
        };
      });
      const detailActionButtons = ["#editButton", "#deleteButton", "#moreDetailsButton"];
      const detailActionButtonsAreBordered = detailActionButtons.every((selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return style.backgroundColor === "rgb(255, 255, 255)"
          && Number.parseFloat(style.borderTopWidth) >= 1
          && style.borderTopStyle === "solid";
      });
      const statusBadgeProbe = document.createElement("span");
      statusBadgeProbe.className = "status-badge";
      statusBadgeProbe.hidden = true;
      document.body.append(statusBadgeProbe);
      const statusBadgeStyle = getComputedStyle(statusBadgeProbe);
      const statusBadgeTextTransform = statusBadgeStyle.textTransform;
      const statusBadgeFontSize = Number.parseFloat(statusBadgeStyle.fontSize);
      statusBadgeProbe.remove();
      const heldBadgeProbe = document.createElement("span");
      heldBadgeProbe.className = "status-badge status-held";
      heldBadgeProbe.textContent = "Održano";
      document.body.append(heldBadgeProbe);
      const heldBadgeStyle = getComputedStyle(heldBadgeProbe);
      const heldBadgeColor = heldBadgeStyle.color;
      const heldBadgeBackground = heldBadgeStyle.backgroundColor;
      heldBadgeProbe.remove();
      const dataNoticeClose = document.querySelector("#dismissDataNoticeButton")?.getBoundingClientRect();
      const importSummary = document.querySelector(".side-column .import-options summary")?.getBoundingClientRect();
      const searchHeading = document.querySelector(".search-panel > .panel-heading")?.getBoundingClientRect();
      const datePreset = document.querySelector(".date-presets .compact-button")?.getBoundingClientRect();
      const searchActions = document.querySelector(".search-actions")?.getBoundingClientRect();
      const quickAdd = document.querySelector(".quick-add-button");
      const searchGridColumns = getComputedStyle(document.querySelector(".search-grid")).gridTemplateColumns
        .split(" ")
        .filter(Boolean).length;
      const reminderIcon = document.querySelector('.search-panel .utility-tab[data-utility-view="reminders"] .utility-tab-icon svg')?.getBoundingClientRect();
      const backupIconTargets = ["#exportJsonButton", "#importJsonButton", "#exportEncryptedButton"];
      const backupButtonsHaveIcons = backupIconTargets.every((selector) => {
        const iconStyle = getComputedStyle(document.querySelector(selector), "::before");
        return iconStyle.content === '""' && iconStyle.maskImage !== "none";
      });
      return {
        noHorizontalScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        combinedScheduleOrder: twoWeekPanel && schedulePanel
          ? twoWeekPanel.height > 0 && schedulePanel.height > 0 && twoWeekPanel.top < schedulePanel.top
          : false,
        searchHiddenByDefault: searchPanel ? getComputedStyle(document.querySelector(".search-panel")).display === "none" : false,
        scheduleTabsShareRowWithDatebar: scheduleTabs && scheduleDatebar
          ? Math.abs(scheduleTabs.top - scheduleDatebar.top) <= 2
          : false,
        dateLabelHasCalendarIcon: dateLabelIconStyle.content === '""'
          && dateLabelIconStyle.maskImage !== "none"
          && Number.parseFloat(dateLabelIconStyle.width) >= 14,
        dateLabelSingleLine: dateLabel ? dateLabel.height <= 34 : false,
        next30TabSingleLine: next30Tab ? next30Tab.height <= 40 : false,
        overviewCardsHaveNoHeavySideAccent: Number.parseFloat(overviewCardStyle.borderLeftWidth) <= 1,
        activeOverviewCardStaysNeutral: activeOverviewCardStyle.borderTopColor === overviewCardStyle.borderTopColor
          && activeOverviewCardStyle.backgroundColor === overviewCardStyle.backgroundColor,
        quickSearchHasIcon: quickSearchStyle.backgroundImage.includes("data:image/svg+xml")
          && Number.parseFloat(quickSearchStyle.paddingLeft) >= 34,
        topNewButtonHasIcon: topNewIconStyle.content === '""'
          && topNewIconStyle.maskImage !== "none",
        topbarActionIconsAreLightweight: topbarActionIconStyle.backgroundColor === "rgba(0, 0, 0, 0)"
          && Number.parseFloat(topbarActionIconStyle.width) <= 18
          && topbarActionSvg?.width <= 17,
        topbarUtilityButtonsHaveBreathingRoom: topbarUtilityButtons.every((button) =>
          button.paddingLeft >= 8 && button.paddingRight >= 8 && button.contentFits
        ),
        detailActionButtonsHaveIcons: detailActionButtons.every((selector) => {
          const iconStyle = getComputedStyle(document.querySelector(selector), "::before");
          return iconStyle.content === '""' && iconStyle.maskImage !== "none";
        }),
        detailActionButtonsAreBordered,
        statusBadgesAreUppercase: statusBadgeTextTransform === "uppercase"
          && statusBadgeFontSize <= 11,
        heldStatusBadgeIsBlue: heldBadgeColor === "rgb(27, 95, 153)"
          && heldBadgeBackground === "rgb(230, 243, 255)",
        filterButtonHasIcon: filterIconStyle.content === '""'
          && filterIconStyle.maskImage !== "none",
        backupCloseIsCompact: dataNoticeClose ? dataNoticeClose.width <= 32 && dataNoticeClose.height <= 32 : false,
        importSummaryIsSubtle: importSummary ? importSummary.height <= 32 : false,
        searchHeadingHiddenOnDesktop: searchHeading ? searchHeading.height === 0 : false,
        datePresetsCompact: datePreset ? datePreset.height <= 32 : false,
        searchActionsBeforePresets: searchActions && datePreset ? searchActions.top <= datePreset.top : false,
        searchGridHasWideDesktopColumns: searchGridColumns === 5,
        quickAddRemoved: quickAdd === null,
        reminderTabHasSvgIcon: reminderIcon ? reminderIcon.width === 16 && reminderIcon.height === 16 : false,
        backupButtonsHaveIcons
      };
    });
    assert.equal(desktopLayout.noHorizontalScroll, true);
    assert.equal(desktopLayout.combinedScheduleOrder, true);
    assert.equal(desktopLayout.searchHiddenByDefault, true);
    assert.equal(desktopLayout.scheduleTabsShareRowWithDatebar, true);
    assert.equal(desktopLayout.dateLabelHasCalendarIcon, true);
    assert.equal(desktopLayout.dateLabelSingleLine, true);
    assert.equal(desktopLayout.next30TabSingleLine, true);
    assert.equal(desktopLayout.overviewCardsHaveNoHeavySideAccent, true);
    assert.equal(desktopLayout.activeOverviewCardStaysNeutral, true);
    assert.equal(desktopLayout.quickSearchHasIcon, true);
    assert.equal(desktopLayout.topNewButtonHasIcon, true);
    assert.equal(desktopLayout.topbarActionIconsAreLightweight, true);
    assert.equal(desktopLayout.topbarUtilityButtonsHaveBreathingRoom, true);
    assert.equal(desktopLayout.detailActionButtonsHaveIcons, true);
    assert.equal(desktopLayout.detailActionButtonsAreBordered, true);
    assert.equal(desktopLayout.statusBadgesAreUppercase, true);
    assert.equal(desktopLayout.heldStatusBadgeIsBlue, true);
    assert.equal(desktopLayout.filterButtonHasIcon, true);
    assert.equal(desktopLayout.backupCloseIsCompact, true);
    assert.equal(desktopLayout.importSummaryIsSubtle, true);
    assert.equal(desktopLayout.searchHeadingHiddenOnDesktop, true);
    assert.equal(desktopLayout.datePresetsCompact, true);
    assert.equal(desktopLayout.quickAddRemoved, true);
    assert.equal(desktopLayout.backupButtonsHaveIcons, true);

    await page.setViewportSize({ width: 1213, height: 816 });
    const referenceViewportLayout = await page.evaluate(() => {
      const scheduleTabs = document.querySelector(".schedule-view-tabs")?.getBoundingClientRect();
      const scheduleDatebar = document.querySelector(".schedule-datebar")?.getBoundingClientRect();
      const primaryTabs = document.querySelector(".mobile-tabs")?.getBoundingClientRect();
      const allTab = document.querySelector('.schedule-view-tabs [data-schedule-view="all"]')?.getBoundingClientRect();
      const searchPanel = document.querySelector(".search-panel");
      return {
        noHorizontalScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        scheduleTabsDoNotOverlapDatebar: scheduleTabs && scheduleDatebar ? scheduleTabs.right <= scheduleDatebar.left : false,
        searchHiddenByDefault: searchPanel ? getComputedStyle(searchPanel).display === "none" : false,
        primaryTabsInReferenceViewport: primaryTabs ? primaryTabs.top < window.innerHeight && primaryTabs.bottom < window.innerHeight : false,
        allTabReadable: allTab ? allTab.width >= 58 : false
      };
    });
    assert.equal(referenceViewportLayout.noHorizontalScroll, true);
    assert.equal(referenceViewportLayout.scheduleTabsDoNotOverlapDatebar, true);
    assert.equal(referenceViewportLayout.searchHiddenByDefault, true);
    assert.equal(referenceViewportLayout.primaryTabsInReferenceViewport, true);
    assert.equal(referenceViewportLayout.allTabReadable, true);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.click("#dismissDataNoticeButton");
    assert.equal(await page.locator("#dataNotice").isVisible(), true);
    assert.equal(await page.locator("#dataNotice .data-storage-note").isVisible(), false);
    assert.equal(await page.locator("#dismissDataNoticeButton").isVisible(), false);
    await assertVisibleText(page, "#dataNotice", "Izvezi JSON");
    await assertVisibleText(page, "#dataNotice", "Uvezi JSON");
    await assertVisibleText(page, ".side-column .import-options summary", "Dodatne opcije");
    assert.equal(await page.locator("#importEncryptedButton").isVisible(), false);
    await page.click("#dataSafetyButton");
    await assertVisibleText(page, "#dataNotice .data-storage-note", "Podaci se čuvaju samo");
    assert.equal(await page.locator("#dismissDataNoticeButton").isVisible(), true);
    await assertActivePanel(page, "#dataNotice");

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

    await page.click("#clearSelectionButton");
    await assertNewHearingFormReady(page);
    await page.click('.mobile-tab[data-mobile-view="search"]');
    assert.equal(await page.locator(".search-panel").evaluate((panel) => panel.classList.contains("utility-active")), true);
    assert.equal(await page.locator("#filterPlaintiff").isVisible(), true);
    await assertActivePanel(page, ".search-panel");
    await page.click("#clearSelectionButton");
    await assertNewHearingFormReady(page);
    await page.click('.mobile-tab[data-mobile-view="schedule"]');
    await page.click('.schedule-view-tabs [data-schedule-view="next30"]');
    assert.equal(await page.locator(".schedule-panel").isVisible(), true);

    assert.equal(await page.locator(".reminders-panel").isVisible(), false);
    await page.click('.entry-panel [data-utility-view="reminders"]');
    assert.equal(await page.locator(".reminders-panel").isVisible(), true);
    await assertActivePanel(page, ".reminders-panel");
    assert.equal(await page.locator("#defaultReminderSelect").inputValue(), "1d");
    assert.equal(await page.locator("#reminder1d").isChecked(), true);
    await page.selectOption("#defaultReminderSelect", "2h");
    assert.equal(await page.locator("#reminder2h").isChecked(), true);
    assert.equal(await page.locator("#reminder1d").isChecked(), false);
    await page.click("#clearSelectionButton");
    await assertNewHearingFormReady(page);

    await fillRequiredHearing(page);
    await page.check("#reminderCustomEnabled");
    await page.fill("#reminderCustomValue", "30");
    await page.selectOption("#reminderCustomUnit", "minutes");
    assert.equal(await page.locator("#hearingStatus").inputValue(), "zakazano");
    await page.click("#submitButton");
    await assertVisibleText(page, "#formMessage", "Ročište je dodano.");
    await assertVisibleText(page, "#summaryActiveCount", "1");
    assert.equal(await page.locator("#quickAddButton").count(), 0);
    await assertSingleNewHearingButton(page);
    assert.equal(await page.locator(".hearing-button .row-more").count(), 1);
    assert.equal(await page.locator(".hearing-reminder-indicator").count(), 1);
    assert.equal(await page.locator(".hearing-reminder-indicator").first().evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width === 13 && box.height === 13 &&
        style.backgroundColor === "rgb(217, 71, 71)" &&
        style.maskImage !== "none";
    }), true);
    assert.equal(await page.locator(".hearing-date-inline").first().evaluate((element) => {
      const text = element.textContent.trim();
      return /^\d{1,2}\. \d{1,2}\. \d{4}\.$/.test(text) && !text.toLowerCase().includes("srpn");
    }), true);
    assert.deepEqual(await page.locator(".hearing-button .row-more").first().evaluate((element) => {
      const style = getComputedStyle(element);
      const iconStyle = getComputedStyle(element, "::before");
      return {
        text: element.textContent.trim(),
        background: style.backgroundColor,
        iconContent: iconStyle.content,
        iconMask: iconStyle.maskImage
      };
    }), {
      text: "",
      background: "rgba(0, 0, 0, 0)",
      iconContent: '""',
      iconMask: "radial-gradient(circle at 50% 2px, rgb(0, 0, 0) 2px, rgba(0, 0, 0, 0) 2.4px), radial-gradient(circle at 50% 8px, rgb(0, 0, 0) 2px, rgba(0, 0, 0, 0) 2.4px), radial-gradient(circle at 50% 14px, rgb(0, 0, 0) 2px, rgba(0, 0, 0, 0) 2.4px)"
    });
    assert.equal(await page.locator(".hearing-button").first().evaluate((element) => {
      const height = element.getBoundingClientRect().height;
      return height >= 50 && height <= 64;
    }), true);
    await page.click("#clearSelectionButton");
    await assertNewHearingFormReady(page);

    let hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(hearings.length, 1);
    assert.equal(hearings[0].status, "zakazano");
    assert.equal(hearings[0].history.length, 1);
    assert.equal(hearings[0].history[0].eventType, "created");
    assert.ok(hearings[0].history[0].eventId);
    assert.deepEqual(hearings[0].reminders.map((reminder) => reminder.minutesBefore).sort((a, b) => a - b), [30, 120]);
    assert.equal(await page.locator("#backupReminder").isVisible(), true);
    const backupReminderChrome = await page.locator("#backupReminder").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const actionButtons = element.querySelectorAll(".backup-reminder-actions button");
      return {
        height: rect.height,
        buttonCount: actionButtons.length,
        firstActionVisible: actionButtons[0]?.getBoundingClientRect().height > 0
      };
    });
    assert.ok(backupReminderChrome.height <= 56, `Backup reminder should stay compact, got ${backupReminderChrome.height}px`);
    assert.equal(backupReminderChrome.buttonCount, 3);
    assert.equal(backupReminderChrome.firstActionVisible, true);
    await page.click('.entry-panel [data-utility-view="reminders"]');
    await assertVisibleText(page, "#remindersList", "Croatia osiguranje - Marko Markovic");
    await assertVisibleText(page, "#remindersList", "2 sata prije");
    await assertVisibleText(page, ".search-panel .utility-reminder-count", "1");

    await page.click('[data-reminder-action="seen"]');
    await assertVisibleText(page, "#remindersList", "Nema dospjelih podsjetnika.");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.ok(Object.values(hearings[0].reminderEvents || {}).some((event) => event.dismissedAt));

    const today = startOfDay(new Date());
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const currentWeekStart = getWeekStart(today);
    const nextWeekDate = addDays(currentWeekStart, 8);
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
        ...buildStoredHearing("value-low", tomorrow, "Vrijednost Niska", "Test Osoba"),
        disputeValue: "4.500 EUR"
      },
      {
        ...buildStoredHearing("value-high", tomorrow, "Vrijednost Visoka", "Test Osoba"),
        disputeValue: "7.500 EUR"
      },
      {
        ...buildStoredHearing("two-week-early", today, "Dva Tjedna Rano", "Test Osoba"),
        hearingDateTime: toDateTimeInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 15))
      },
      {
        ...buildStoredHearing("two-week-middle", today, "Dva Tjedna Sredina", "Test Osoba"),
        hearingDateTime: toDateTimeInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 30))
      },
      {
        ...buildStoredHearing("two-week-late", today, "Dva Tjedna Kasno", "Test Osoba"),
        hearingDateTime: toDateTimeInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 45))
      },
      buildStoredHearing("two-week-next", nextWeekDate, "Dva Tjedna Sljedeci", "Test Osoba", postponedStatusValue),
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
    await assertVisibleText(page, ".mobile-tabs", "Raspored");
    assert.equal(await page.locator('.mobile-tab[data-mobile-view="twoWeek"]').count(), 0);
    await page.click('.mobile-tab[data-mobile-view="schedule"]');
    await assertVisibleText(page, "#twoWeekTitle", "Ovaj i sljedeći tjedan");
    await assertVisibleText(page, "#twoWeekSummary", "Ukupno rasprava");
    await assertVisibleText(page, "#twoWeekCalendar", "Dva Tjedna Sljedeci");
    await assertVisibleText(page, "#twoWeekCalendar", "ODGOĐENO");
    await assertVisibleText(page, "#twoWeekCalendar", "Nema rasprava");
    await assertVisibleText(page, "#twoWeekCalendar", "+ još");
    await assertVisibleText(page, "#twoWeekCalendar", "08:15");
    await assertVisibleText(page, "#twoWeekCalendar", "09:30");
    const twoWeekDesktop = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".two-week-day"));
      const firstBusyCard = cards.find((card) => card.innerText.includes("Dva Tjedna Rano"));
      const dayTops = [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top)))];
      const times = firstBusyCard
        ? Array.from(firstBusyCard.querySelectorAll(".two-week-hearing-top strong")).map((node) => node.textContent.trim())
        : [];
      return {
        cardCount: cards.length,
        rowCount: dayTops.length,
        todayHighlighted: Boolean(document.querySelector(".two-week-day.today")),
        noDeletedRecord: !document.querySelector("#twoWeekCalendar")?.innerText.includes("Datum Obrisano"),
        sortedFirstTimes: times.slice(0, 2).join(","),
        noHorizontalScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      };
    });
    assert.equal(twoWeekDesktop.cardCount, 14);
    assert.equal(twoWeekDesktop.rowCount, 2);
    assert.equal(twoWeekDesktop.todayHighlighted, true);
    assert.equal(twoWeekDesktop.noDeletedRecord, true);
    assert.equal(twoWeekDesktop.sortedFirstTimes, "08:15,09:30");
    assert.equal(twoWeekDesktop.noHorizontalScroll, true);
    await page.locator(".two-week-hearing", { hasText: "Dva Tjedna Sljedeci" }).click();
    await assertVisibleText(page, "#detailsParties", "P-two-week-next/2026");
    await assertActivePanel(page, ".details-panel");
    assert.equal(await page.locator(".two-week-panel").isVisible(), true);
    await page.click('.mobile-tab[data-mobile-view="schedule"]');
    assert.equal(await page.locator(".two-week-panel").isVisible(), true);
    assert.equal(await page.locator(".schedule-panel").isVisible(), true);
    await assertScheduleViewActive(page, "today");
    await assertScheduleIncludes(page, "Datum Danas");
    await assertScheduleExcludes(page, "Datum Deset");
    await page.click('.schedule-view-tabs [data-schedule-view="next30"]');
    await assertScheduleViewActive(page, "next30");
    await assertScheduleIncludes(page, "Datum Danas");
    await assertScheduleIncludes(page, "Datum Deset");
    await assertScheduleIncludes(page, "Datum Otkazano");
    await assertScheduleIncludes(page, "ODGOĐENO");
    await assertScheduleExcludes(page, "Datum Jucer");
    await assertScheduleExcludes(page, "Datum Cetrdeset");
    await assertScheduleExcludes(page, "Datum Obrisano");
    const unselectedRowChrome = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll(".hearing-button"))
        .find((button) => button.innerText.includes("Datum Odgodeno"));
      return row ? getComputedStyle(row).borderLeftColor : "";
    });
    assert.equal(unselectedRowChrome, "rgba(0, 0, 0, 0)");
    await page.locator(".hearing-button", { hasText: "Datum Danas" }).click();
    const selectedRowChrome = await page.evaluate(() => {
      const row = document.querySelector(".hearing-button.selected");
      if (!row) return null;
      const style = getComputedStyle(row);
      return {
        text: row.innerText,
        borderLeftColor: style.borderLeftColor,
        backgroundColor: style.backgroundColor
      };
    });
    assert.ok(selectedRowChrome?.text.includes("Datum Danas"));
    assert.notEqual(selectedRowChrome?.borderLeftColor, "rgba(0, 0, 0, 0)");
    assert.notEqual(selectedRowChrome?.backgroundColor, "rgb(255, 255, 255)");
    await assertVisibleText(page, "#detailsParties", "P-date-filter-today");

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

    await page.click('.overview-card[data-schedule-view="active"]');
    assert.equal(await page.locator('.overview-card[data-schedule-view="active"]').getAttribute("aria-pressed"), "true");
    assert.ok((await page.locator("#rangeLabel").textContent()).includes("Aktivno"));
    await assertScheduleIncludes(page, "Datum Danas");
    await assertScheduleIncludes(page, "Datum Odgodeno");
    await assertScheduleIncludes(page, "Datum Jucer");
    await assertScheduleExcludes(page, "Datum Otkazano");
    await assertScheduleExcludes(page, "Datum Obrisano");
    await page.click('.schedule-view-tabs [data-schedule-view="all"]');
    await page.click('.mobile-tab[data-mobile-view="search"]');

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
    await page.fill("#filterCaseNumber", "P-123/2026");
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Croatia osiguranje");
    await assertSearchExcludes(page, "Datum Danas");

    await page.click("#clearFiltersButton");
    await page.fill("#filterOther", "Smoke test");
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Danas");
    await assertSearchExcludes(page, "Croatia osiguranje");

    await page.click("#clearFiltersButton");
    await page.fill("#filterDateFrom", toDateKey(tomorrow));
    await page.fill("#filterDateTo", toDateKey(tomorrow));
    await page.selectOption("#filterStatus", "otkazano");
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Otkazano");
    await assertSearchExcludes(page, "Datum Sutra");

    await page.click("#clearFiltersButton");
    assert.equal(await page.locator("#filterDeleted").inputValue(), "no");
    await page.fill("#filterDateFrom", toDateKey(tomorrow));
    await page.fill("#filterDateTo", toDateKey(tomorrow));
    await page.selectOption("#filterDeleted", "yes");
    assert.equal(await page.locator("#showDeletedToggle").isChecked(), true);
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Obrisano");
    await page.selectOption("#filterDeleted", "no");
    assert.equal(await page.locator("#showDeletedToggle").isChecked(), false);

    await page.click("#clearFiltersButton");
    await page.selectOption("#filterValueRange", "lte5000");
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Vrijednost Niska");
    await assertSearchExcludes(page, "Vrijednost Visoka");

    await page.click("#clearFiltersButton");
    await page.selectOption("#filterValueRange", "gt5000");
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Vrijednost Visoka");
    await assertSearchExcludes(page, "Vrijednost Niska");

    await page.click("#clearFiltersButton");
    await page.fill("#filterPlaintiff", "Ne postoji");
    await page.click("#searchButton");
    await assertVisibleText(page, ".search-empty", "Nema rezultata za zadane kriterije.");
    await assertVisibleText(page, ".search-empty", "Očisti filtre");
    await assertVisibleText(page, ".search-empty", "gornji gumb Novo ročište");
    await page.locator(".search-empty button").filter({ hasText: "Očisti filtre" }).click();
    await assertVisibleText(page, ".search-empty", "Upiši kriterij i pritisni Pretraži.");

    await page.fill("#filterPlaintiff", "Croatia");
    await page.selectOption("#filterStatus", "zakazano");
    await page.click("#searchButton");
    await assertVisibleText(page, ".search-results-heading", "1 pronađena rasprava");
    await assertVisibleText(page, ".search-result-button", "ZAKAZANO");

    await page.click(".search-result-button");
    await assertVisibleText(page, "#detailsParties", "P-123/2026");
    await assertVisibleText(page, "#detailsHeaderStatus", "ZAKAZANO");
    await assertVisibleText(page, "#moreDetailsButton", "Više");
    await assertVisibleText(page, "#detailsCaseParties", "Croatia osiguranje - Marko Markovic");
    await assertVisibleText(page, "#detailsPlaintiff", "Croatia osiguranje");
    await assertVisibleText(page, "#detailsDefendant", "Marko Markovic");
    await assertVisibleText(page, "#detailsRecordId", hearings[0].id);
    assert.equal(await page.locator(".side-column .details-panel").evaluate((element) => element.scrollHeight <= element.clientHeight + 1), true);
    assert.equal(await page.locator(".side-column .backup-note").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom < window.innerHeight;
    }), true);
    assert.equal(await page.locator(".side-column .detail-date-row").evaluate((element) => {
      const iconStyle = getComputedStyle(element, "::before");
      return iconStyle.content === '""' && iconStyle.maskImage !== "none";
    }), true);
    assert.equal(await page.locator("#historyPanel").evaluate((element) => element.open), false);
    assert.equal(await page.locator(".side-column #historyPanel").evaluate((element) => getComputedStyle(element).display), "none");
    await page.click("#moreDetailsButton");
    assert.equal(await page.locator("#historyPanel").evaluate((element) => element.open), true);
    assert.notEqual(await page.locator(".side-column #historyPanel").evaluate((element) => getComputedStyle(element).display), "none");
    await assertVisibleText(page, "#detailsHistory", "Zapis stvoren");

    await page.click("#editButton");
    assert.equal(await page.locator("#plaintiff").inputValue(), "Croatia osiguranje");
    await page.click("#clearSelectionButton");
    await assertNewHearingFormReady(page);
    assert.equal(await page.locator("#plaintiff").inputValue(), "");
    assert.equal(await page.locator("#caseNumber").inputValue(), "");
    assert.equal(await page.locator("#cancelEditButton").isHidden(), true);
    await page.click('.entry-panel [data-utility-view="search"]');
    await page.locator(".search-result-button", { hasText: "Croatia osiguranje" }).click();
    await page.click("#editButton");
    await page.selectOption("#hearingStatus", "otkazano");
    await page.click("#submitButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(hearings[0].status, "otkazano");
    assert.ok(hearings[0].history.some((event) => event.eventType === "status-changed" && event.changedFields.includes("status")));
    await assertVisibleText(page, "#detailsHeaderStatus", "OTKAZANO");
    await openHistoryPanel(page);
    await assertVisibleText(page, "#detailsHistory", "Status promijenjen");
    await page.click('.search-panel [data-utility-view="reminders"]');
    await assertVisibleText(page, "#remindersList", "Nema dospjelih podsjetnika.");

    await page.selectOption("#filterStatus", "otkazano");
    await page.click("#searchButton");
    await assertVisibleText(page, ".search-results-heading", "1 pronađena rasprava");

    await page.click("#deleteButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.ok(hearings[0].deletedAt, "Soft-delete should keep a deletedAt timestamp");
    assert.ok(hearings[0].history.some((event) => event.eventType === "deleted"));
    assert.equal(await page.locator("#detailsContent").isHidden(), true);

    await page.selectOption("#filterDeleted", "yes");
    assert.equal(await page.locator("#showDeletedToggle").isChecked(), true);
    await page.click(".hearing-button.deleted");
    await assertVisibleText(page, "#deletedStatus", "Obrisano");
    await openHistoryPanel(page);
    await assertVisibleText(page, "#detailsHistory", "Zapis obrisan");
    await page.click("#restoreButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(Boolean(hearings[0].deletedAt), false);
    assert.ok(hearings[0].history.some((event) => event.eventType === "restored"));

    await page.evaluate((key) => localStorage.removeItem(key), LAST_BACKUP_AT_KEY);
    await page.selectOption("#filterDeleted", "no");
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
    assert.equal(await page.locator('.mobile-tab[data-mobile-view="twoWeek"]').count(), 0);
    await page.click('.mobile-tab[data-mobile-view="schedule"]');
    assert.equal(await page.locator(".two-week-panel").isVisible(), true);
    assert.equal(await page.locator(".schedule-panel").isVisible(), true);
    await assertActivePanel(page, ".two-week-panel");
    const twoWeekMobileLayout = await page.evaluate(() => {
      const calendar = document.querySelector(".two-week-calendar");
      const cards = Array.from(document.querySelectorAll(".two-week-day"));
      const firstCard = cards[0]?.getBoundingClientRect();
      const secondCard = cards[1]?.getBoundingClientRect();
      return {
        noHorizontalScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        verticalList: Boolean(firstCard && secondCard && secondCard.top > firstCard.bottom),
        gridColumns: calendar ? getComputedStyle(calendar).gridTemplateColumns.split(" ").filter(Boolean).length : 0
      };
    });
    assert.equal(twoWeekMobileLayout.noHorizontalScroll, true);
    assert.equal(twoWeekMobileLayout.verticalList, true);
    assert.equal(twoWeekMobileLayout.gridColumns, 1);
    assert.equal(await page.locator('.schedule-view-tabs [data-schedule-view="today"]').isVisible(), true);
    assert.equal(await page.locator('.schedule-view-tabs [data-schedule-view="next30"]').isVisible(), true);
    await page.click('.mobile-tab[data-mobile-view="search"]');
    assert.equal(await page.locator(".search-panel").isVisible(), true);
    await assertActivePanel(page, ".search-panel");
    assert.equal(await page.locator("#filterStatus").isVisible(), true);
    assert.equal(await page.locator("#filterCaseNumber").isVisible(), true);
    assert.equal(await page.locator("#filterValueRange").isVisible(), true);
    assert.equal(await page.locator("#filterDeleted").isVisible(), true);
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

function getWeekStart(date) {
  const result = startOfDay(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
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

async function assertNewHearingFormReady(page) {
  await assertVisibleText(page, "#formTitle", "Novo ročište");
  await assertVisibleText(page, "#submitButton", "Spremi ročište");
  assert.equal(await page.locator("#hearingId").inputValue(), "");
  assert.equal(await page.locator("#plaintiff").isVisible(), true);
  await page.waitForFunction(() => document.activeElement?.id === "plaintiff");
  const formViewport = await page.evaluate(() => {
    const plaintiff = document.querySelector("#plaintiff")?.getBoundingClientRect();
    const panel = document.querySelector(".entry-panel");
    return {
      fieldVisible: Boolean(plaintiff && plaintiff.top >= 0 && plaintiff.bottom <= window.innerHeight),
      panelHighlighted: Boolean(panel?.classList.contains("new-hearing-focus")),
      panelActive: Boolean(panel?.classList.contains("is-active-panel")),
      noHorizontalScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    };
  });
  assert.equal(formViewport.fieldVisible, true);
  assert.equal(formViewport.panelHighlighted, true);
  assert.equal(formViewport.panelActive, true);
  assert.equal(formViewport.noHorizontalScroll, true);
}

async function assertActivePanel(page, selector) {
  await page.waitForFunction((targetSelector) => {
    const target = document.querySelector(targetSelector);
    return Boolean(target?.classList.contains("is-active-panel"));
  }, selector);
  const activeCount = await page.locator(".is-active-panel").count();
  assert.equal(activeCount, 1);
}

async function assertSingleNewHearingButton(page) {
  const newButtons = await page.evaluate(() => Array.from(document.querySelectorAll("button"))
    .filter((button) => button.innerText.trim() === "Novo ročište")
    .map((button) => ({
      id: button.id,
      visible: button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0
    })));
  assert.deepEqual(newButtons, [{ id: "clearSelectionButton", visible: true }]);
}

async function assertOpaqueModalPanel(page, selector) {
  const modalStyle = await page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      backgroundColor: style.backgroundColor,
      coversContent: style.backgroundColor === "rgb(255, 255, 255)" || style.backgroundColor === "rgb(250, 253, 252)",
      visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight
    };
  });
  assert.equal(modalStyle.coversContent, true, `Modal should be opaque, got ${modalStyle.backgroundColor}`);
  assert.equal(modalStyle.visible, true);
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

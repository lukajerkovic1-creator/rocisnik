const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const STORAGE_KEY = "rocisnik.hearings.v1";
const LAST_BACKUP_AT_KEY = "rocisnik.lastBackupAt.v1";
const SECURITY_NOTICE_ACCEPTED_AT_KEY = "securityNoticeAcceptedAt";

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
    await assertVisibleText(page, "#securityPrompt", "Sigurnosna napomena");
    await assertVisibleText(page, "#securityPrompt", "osjetljivih stvarnih podataka");

    await page.click("#securityPromptMoreButton");
    await assertVisibleText(page, "#securityNoticeModal", "Ova aplikacija sprema podatke lokalno");
    await page.click("#securityNoticeDismissButton");
    assert.equal(await page.locator("#securityPrompt").isVisible(), true);

    await page.click("#securityPromptAcceptButton");
    assert.equal(await page.locator("#securityPrompt").isHidden(), true);
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), SECURITY_NOTICE_ACCEPTED_AT_KEY));
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#securityPrompt").isHidden(), true);

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

    let hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(hearings.length, 1);
    assert.equal(hearings[0].status, "zakazano");
    assert.deepEqual(hearings[0].reminders.map((reminder) => reminder.minutesBefore).sort((a, b) => a - b), [30, 120]);
    assert.equal(await page.locator("#backupReminder").isVisible(), true);
    await assertVisibleText(page, "#remindersList", "Croatia osiguranje - Marko Markovic");
    await assertVisibleText(page, "#remindersList", "2 sata prije");

    await page.click('[data-reminder-action="seen"]');
    await assertVisibleText(page, "#remindersList", "Nema dospjelih podsjetnika.");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.ok(Object.values(hearings[0].reminderEvents || {}).some((event) => event.dismissedAt));

    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const tenDaysFromToday = addDays(today, 10);
    const fortyDaysFromToday = addDays(today, 40);
    const seededHearings = [
      buildStoredHearing("date-filter-today", today, "Datum Danas", "Test Osoba"),
      buildStoredHearing("date-filter-tomorrow", tomorrow, "Datum Sutra", "Test Osoba"),
      buildStoredHearing("date-filter-ten-days", tenDaysFromToday, "Datum Deset", "Test Osoba"),
      buildStoredHearing("date-filter-forty-days", fortyDaysFromToday, "Datum Cetrdeset", "Test Osoba"),
      buildStoredHearing("date-filter-canceled", tomorrow, "Datum Otkazano", "Test Osoba", "otkazano"),
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

    await page.check("#showDeletedToggle");
    await page.click("#clearFiltersButton");
    await page.fill("#filterDateFrom", toDateKey(tomorrow));
    await page.fill("#filterDateTo", toDateKey(tomorrow));
    await page.click("#searchButton");
    await assertSearchIncludes(page, "Datum Obrisano");
    await page.uncheck("#showDeletedToggle");

    await page.click("#clearFiltersButton");
    await page.fill("#filterPlaintiff", "Croatia");
    await page.selectOption("#filterStatus", "zakazano");
    await page.click("#searchButton");
    await assertVisibleText(page, ".search-results-heading", "1 pronađena rasprava");
    await assertVisibleText(page, ".search-result-button", "Zakazano");

    await page.click(".search-result-button");
    await assertVisibleText(page, "#detailsParties", "Croatia osiguranje - Marko Markovic");
    await assertVisibleText(page, "#detailsStatus", "Zakazano");

    await page.click("#editButton");
    await page.selectOption("#hearingStatus", "otkazano");
    await page.click("#submitButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(hearings[0].status, "otkazano");
    await assertVisibleText(page, "#detailsStatus", "Otkazano");
    await assertVisibleText(page, "#remindersList", "Nema dospjelih podsjetnika.");

    await page.selectOption("#filterStatus", "otkazano");
    await page.click("#searchButton");
    await assertVisibleText(page, ".search-results-heading", "1 pronađena rasprava");

    await page.click("#deleteButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.ok(hearings[0].deletedAt, "Soft-delete should keep a deletedAt timestamp");
    assert.equal(await page.locator("#detailsContent").isHidden(), true);

    await page.check("#showDeletedToggle");
    await page.click(".hearing-button.deleted");
    await assertVisibleText(page, "#deletedStatus", "Obrisano");
    await page.click("#restoreButton");
    hearings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
    assert.equal(Boolean(hearings[0].deletedAt), false);

    await page.evaluate((key) => localStorage.removeItem(key), LAST_BACKUP_AT_KEY);
    await page.uncheck("#showDeletedToggle");
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#backupReminder").isVisible(), true);

    const downloadPromise = page.waitForEvent("download");
    await page.click("#backupReminderExportButton");
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^rocisnik-backup-\d{4}-\d{2}-\d{2}\.json$/);
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), LAST_BACKUP_AT_KEY));
    assert.equal(await page.locator("#backupReminder").isHidden(), true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".mobile-tabs").isVisible(), true);
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

async function assertSearchIncludes(page, expectedText) {
  const text = await page.locator("#searchResults").innerText();
  assert.ok(text.includes(expectedText), `Search results should contain "${expectedText}", got "${text}"`);
}

async function assertSearchExcludes(page, unexpectedText) {
  const text = await page.locator("#searchResults").innerText();
  assert.equal(text.includes(unexpectedText), false, `Search results should not contain "${unexpectedText}", got "${text}"`);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

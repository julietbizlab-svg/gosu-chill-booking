/**
 * 從 CSV 匯入／更新 Notion 課程表
 *
 * CSV 欄位：日期, 星期, 時間, 課程名稱, 備註
 *
 * 用法：
 *   cd backend && node scripts/import-courses-csv.mjs ../data/july-2026-course.csv
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  applyTimePeriodToCourseTitle,
  notionFetch
} from "../src/notion.js";

var __dirname = dirname(fileURLToPath(import.meta.url));
var devVarsPath = resolve(__dirname, "../.dev.vars");
var csvPath = process.argv[2];

if (!csvPath) {
  console.error("請指定 CSV 路徑，例如：node scripts/import-courses-csv.mjs ../data/july-2026-course.csv");
  process.exit(1);
}

var env = Object.fromEntries(
  readFileSync(devVarsPath, "utf8")
    .split("\n")
    .filter(function (line) { return line && !line.startsWith("#"); })
    .map(function (line) {
      var idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

var token = env.NOTION_TOKEN;
var databaseId = env.NOTION_DATABASE_COURSES;

function parseCsv(content) {
  var lines = content.trim().split(/\r?\n/);
  var headers = lines[0].split(",").map(function (h) { return h.trim(); });

  return lines.slice(1).map(function (line) {
    var cols = line.split(",");
    var row = {};
    headers.forEach(function (header, index) {
      row[header] = (cols[index] || "").trim();
    });
    return row;
  });
}

function getDate(props) {
  var prop = props["日期"] || props["上課日期"];
  if (!prop || prop.type !== "date" || !prop.date || !prop.date.start) {
    return "";
  }
  return prop.date.start.slice(0, 10);
}

function isClosureRow(row) {
  return /停課|進修|休假|取消|未開課/.test(row["備註"] || "");
}

function isCourseRow(row) {
  return Boolean(row["課程名稱"] && row["時間"]);
}

function buildProperties(row) {
  var props = {
    "日期": { date: { start: row["日期"] } }
  };

  if (row["星期"]) {
    props["星期"] = { select: { name: row["星期"] } };
  }

  if (isClosureRow(row)) {
    props["課程名稱"] = { title: [{ text: { content: "停課" } }] };
    props["時間"] = { rich_text: [] };
    props["備註"] = { rich_text: [{ text: { content: row["備註"] } }] };
    return props;
  }

  if (!isCourseRow(row)) {
    return null;
  }

  var title = applyTimePeriodToCourseTitle(row["課程名稱"], row["時間"]);
  props["課程名稱"] = { title: [{ text: { content: title } }] };
  props["時間"] = { rich_text: [{ text: { content: row["時間"] } }] };
  props["備註"] = row["備註"]
    ? { rich_text: [{ text: { content: row["備註"] } }] }
    : { rich_text: [] };

  return props;
}

async function queryMonthPages(year, month) {
  var monthStr = String(month).padStart(2, "0");
  var start = year + "-" + monthStr + "-01";
  var lastDay = new Date(year, month, 0).getDate();
  var end = year + "-" + monthStr + "-" + String(lastDay).padStart(2, "0");
  var results = [];
  var cursor;

  do {
    var payload = {
      filter: {
        and: [
          { property: "日期", date: { on_or_after: start } },
          { property: "日期", date: { on_or_before: end } }
        ]
      },
      sorts: [{ property: "日期", direction: "ascending" }]
    };

    if (cursor) {
      payload.start_cursor = cursor;
    }

    var data = await notionFetch("/databases/" + databaseId + "/query", token, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

async function createPage(properties) {
  return notionFetch("/pages", token, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: properties
    })
  });
}

async function updatePage(pageId, properties) {
  return notionFetch("/pages/" + pageId, token, {
    method: "PATCH",
    body: JSON.stringify({ properties: properties })
  });
}

async function archivePage(pageId) {
  return notionFetch("/pages/" + pageId, token, {
    method: "PATCH",
    body: JSON.stringify({ archived: true })
  });
}

var rows = parseCsv(readFileSync(resolve(csvPath), "utf8"));
var monthDates = new Set();
var created = 0;
var updated = 0;
var archived = 0;
var skipped = 0;

if (!rows.length) {
  console.error("CSV 沒有資料");
  process.exit(1);
}

var sampleDate = rows.find(function (row) { return row["日期"]; })["日期"];
var year = Number(sampleDate.slice(0, 4));
var month = Number(sampleDate.slice(5, 7));
var existingPages = await queryMonthPages(year, month);
var pagesByDate = new Map();

existingPages.forEach(function (page) {
  var date = getDate(page.properties || {});
  if (date) {
    pagesByDate.set(date, page);
  }
});

for (var row of rows) {
  var date = row["日期"];
  if (!date) {
    skipped++;
    continue;
  }

  monthDates.add(date);

  if (!isCourseRow(row) && !isClosureRow(row)) {
    if (pagesByDate.has(date)) {
      await archivePage(pagesByDate.get(date).id);
      pagesByDate.delete(date);
      archived++;
      console.log("封存", date, "（無課程）");
    }
    continue;
  }

  var properties = buildProperties(row);
  if (!properties) {
    skipped++;
    continue;
  }

  var existing = pagesByDate.get(date);
  if (existing) {
    await updatePage(existing.id, properties);
    updated++;
    console.log("更新", date, isClosureRow(row) ? row["備註"] : properties["課程名稱"].title[0].text.content);
  } else {
    await createPage(properties);
    created++;
    console.log("新增", date, isClosureRow(row) ? row["備註"] : properties["課程名稱"].title[0].text.content);
  }
}

for (var [orphanDate, page] of pagesByDate.entries()) {
  if (!monthDates.has(orphanDate)) {
    continue;
  }

  var stillWanted = rows.some(function (row) {
    return row["日期"] === orphanDate && (isCourseRow(row) || isClosureRow(row));
  });

  if (!stillWanted) {
    await archivePage(page.id);
    archived++;
    console.log("封存", orphanDate, "（CSV 無此日課程）");
  }
}

console.log("\n完成：新增 " + created + "、更新 " + updated + "、封存 " + archived + "、略過 " + skipped);

/**
 * 課程名稱格式：椅子瑜伽｜下午（不含老師名，時段用｜分開）
 *
 * 用法：cd backend && node scripts/label-course-times.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  applyTimePeriodToCourseTitle,
  notionFetch,
  parseInstructorFromTitle
} from "../src/notion.js";

var __dirname = dirname(fileURLToPath(import.meta.url));
var devVarsPath = resolve(__dirname, "../.dev.vars");
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

function getTitle(props, name) {
  var prop = props[name];
  if (!prop || prop.type !== "title") return "";
  return (prop.title || []).map(function (t) { return t.plain_text; }).join("");
}

function getTime(props) {
  var prop = props["時間"] || props["上課時間"];
  if (!prop || prop.type !== "rich_text") return "";
  return (prop.rich_text || []).map(function (t) { return t.plain_text; }).join("");
}

function getRichText(props, name) {
  var prop = props[name];
  if (!prop || prop.type !== "rich_text") return "";
  return (prop.rich_text || []).map(function (t) { return t.plain_text; }).join("");
}

async function ensureInstructorProperty() {
  var db = await notionFetch("/databases/" + databaseId, token, { method: "GET" });
  if (db.properties && db.properties["老師"]) {
    return;
  }

  await notionFetch("/databases/" + databaseId, token, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "老師": { rich_text: {} }
      }
    })
  });

  console.log("已新增 Notion 欄位：老師\n");
}

async function queryAll() {
  var results = [];
  var cursor;

  do {
    var payload = cursor ? { start_cursor: cursor } : {};
    var data = await notionFetch("/databases/" + databaseId + "/query", token, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

await ensureInstructorProperty();

var pages = await queryAll();
var updated = 0;
var skipped = 0;

for (var page of pages) {
  var props = page.properties || {};
  var oldTitle = getTitle(props, "課程名稱");
  var time = getTime(props);

  if (!oldTitle || !time) {
    skipped++;
    continue;
  }

  var newTitle = applyTimePeriodToCourseTitle(oldTitle, time);
  var instructor = getRichText(props, "老師") || parseInstructorFromTitle(oldTitle);
  var patchProps = {
    "課程名稱": { title: [{ text: { content: newTitle } }] }
  };

  if (instructor) {
    patchProps["老師"] = { rich_text: [{ text: { content: instructor } }] };
  }

  if (newTitle === oldTitle && (!instructor || getRichText(props, "老師") === instructor)) {
    skipped++;
    continue;
  }

  await notionFetch("/pages/" + page.id, token, {
    method: "PATCH",
    body: JSON.stringify({ properties: patchProps })
  });

  console.log(oldTitle, "→", newTitle, instructor ? "（老師：" + instructor + "）" : "");
  updated++;
}

console.log("\n完成：更新 " + updated + " 筆，略過 " + skipped + " 筆");

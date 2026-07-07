/**
 * 高手揪派 — Notion 資料庫操作
 *
 * 三個資料庫欄位名稱請與 Notion 完全一致：
 *
 * 【學員 Members】
 *   預約編號 (title) | 學員姓名 (text) | 剩餘堂數 (number) | 到期日 (date) | 狀態 (select)
 *   體驗贈送日 (date) | 系統記錄堂數 (number) | 低堂數已提醒 (checkbox)
 */

import {
  addDays,
  getEffectiveExpiryRaw,
  getTrialExpiryDate,
  isMemberExpiredByRules,
  isTrialMember,
  isoToday,
  shouldExtendPurchaseExpiry,
  validateTrialBooking
} from "./member-rules.js";
import { maybeNotifyLowCredits } from "./line-push.js";

var NOTION_VERSION = "2022-06-28";
var memberSchemaReady = false;

export async function notionFetch(path, token, options) {
  var response = await fetch("https://api.notion.com/v1" + path, Object.assign({
    headers: {
      "Authorization": "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  }, options || {}));

  var body = null;

  try {
    body = await response.json();
  } catch (ignore) {
    body = null;
  }

  if (!response.ok) {
    var message = (body && body.message) ? body.message : "Notion API 錯誤（" + response.status + "）";
    throw new Error(message);
  }

  return body;
}

function getTitle(props, name) {
  var prop = props[name];
  if (!prop || prop.type !== "title") return "";
  return (prop.title || []).map(function (t) { return t.plain_text; }).join("");
}

function getRichText(props, name) {
  var prop = props[name];
  if (!prop || prop.type !== "rich_text") return "";
  return (prop.rich_text || []).map(function (t) { return t.plain_text; }).join("");
}

function getTextOrTitle(props, name) {
  var text = getRichText(props, name);
  if (text) return text;
  return getTitle(props, name);
}

function getSelectOrStatus(props, name) {
  var prop = props[name];
  if (!prop) return "";
  if (prop.type === "select" && prop.select) return prop.select.name || "";
  if (prop.type === "status" && prop.status) return prop.status.name || "";
  return "";
}

function getDateFlexible(props) {
  return getDate(props, "到期日") || getDate(props, "日期");
}

function getCourseDate(props) {
  return getDate(props, "上課日期") || getDate(props, "日期");
}

function getCourseTime(props) {
  return getRichText(props, "上課時間") || getRichText(props, "時間");
}

function buildMemberUserIdFilter(userId) {
  return {
    property: "預約編號",
    title: { equals: userId }
  };
}

function buildTextOrTitleFilter(propertyName, value) {
  return {
    or: [
      { property: propertyName, rich_text: { equals: value } },
      { property: propertyName, title: { equals: value } }
    ]
  };
}

function buildStatusFilter(propertyName, value) {
  return {
    or: [
      { property: propertyName, select: { equals: value } },
      { property: propertyName, status: { equals: value } }
    ]
  };
}

function getNumber(props, name) {
  var prop = props[name];
  if (!prop || prop.type !== "number") return 0;
  return Number(prop.number || 0);
}

function getSelect(props, name) {
  var prop = props[name];
  if (!prop || prop.type !== "select" || !prop.select) return "";
  return prop.select.name || "";
}

function getDate(props, name) {
  var prop = props[name];
  if (!prop || prop.type !== "date" || !prop.date || !prop.date.start) return "";
  return prop.date.start.slice(0, 10);
}

function formatDateZh(isoDate) {
  if (!isoDate) return "—";
  var parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return parts[0] + "/" + parts[1] + "/" + parts[2];
}

function parseStartHour(timeStr) {
  var part = (timeStr || "").split("~")[0].trim();
  var match = part.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function getTimePeriodLabel(hour) {
  if (hour === null || isNaN(hour)) return "";
  if (hour >= 18) return "夜間";
  if (hour >= 12) return "下午";
  return "";
}

export function parseInstructorFromTitle(title) {
  var parts = (title || "").trim().split("｜");
  if (parts.length < 2) return "";

  var second = parts[1].trim();
  if (second === "下午" || second === "夜間") {
    return parts.length >= 3 ? parts[2].trim() : "";
  }

  return second;
}

function extractBaseCourseName(title) {
  var raw = (title || "").trim();
  if (!raw) return raw;

  var parts = raw.split("｜");
  var name = parts[0].replace(/(下午|夜間)+$/, "").trim();

  if (parts.length > 1) {
    var second = parts[1].trim();
    if (second === "下午" || second === "夜間") {
      return name;
    }
  }

  return name;
}

export function applyTimePeriodToCourseTitle(title, timeStr) {
  var raw = (title || "").trim();
  if (!raw) return raw;

  var label = getTimePeriodLabel(parseStartHour(timeStr));
  var baseName = extractBaseCourseName(raw);

  if (!label) {
    return baseName;
  }

  return baseName + "｜" + label;
}

function getCheckbox(props, name) {
  var prop = props[name];
  if (!prop || prop.type !== "checkbox") return false;
  return Boolean(prop.checkbox);
}

function getNumberFlexible(props, names) {
  var i;
  for (i = 0; i < names.length; i++) {
    if (Object.prototype.hasOwnProperty.call(props, names[i])) {
      return getNumber(props, names[i]);
    }
  }
  return 0;
}

function parseMemberPage(page) {
  var props = page.properties || {};
  var expiresRaw = getDateFlexible(props);
  var trialGiftRaw = getDate(props, "體驗贈送日");
  var hasRecorded = Object.prototype.hasOwnProperty.call(props, "系統記錄堂數");

  var member = {
    id: page.id,
    userId: getTextOrTitle(props, "LINE userId") || getTitle(props, "預約編號"),
    displayName: getRichText(props, "姓名")
      || getRichText(props, "學員姓名")
      || getRichText(props, "学员姓名")
      || getTitle(props, "姓名")
      || getTextOrTitle(props, "LINE userId"),
    credits: getNumber(props, "剩餘堂數"),
    card10: getNumberFlexible(props, ["10堂課卡", "10堂課", "未開卡10堂"]),
    card24: getNumberFlexible(props, ["24堂課卡", "24堂課", "未開卡24堂"]),
    expiresRaw: expiresRaw,
    expiresAt: formatDateZh(expiresRaw),
    trialGiftRaw: trialGiftRaw,
    systemRecordedCredits: hasRecorded ? getNumber(props, "系統記錄堂數") : null,
    lowCreditNotified: getCheckbox(props, "低堂數已提醒"),
    teacherRole: getSelectOrStatus(props, "老師權限") || "無",
    status: getSelectOrStatus(props, "狀態") === "有效" ? "active" : "pending"
  };

  member.expiresAt = formatDateZh(getEffectiveExpiryRaw(member));
  return member;
}

async function ensureMemberSchema(env) {
  if (memberSchemaReady) {
    return;
  }

  var db = await notionFetch("/databases/" + env.NOTION_DATABASE_MEMBERS, env.NOTION_TOKEN, {
    method: "GET"
  });
  var props = db.properties || {};
  var patch = {};

  if (!props["體驗贈送日"]) {
    patch["體驗贈送日"] = { date: {} };
  }
  if (!props["系統記錄堂數"]) {
    patch["系統記錄堂數"] = { number: {} };
  }
  if (!props["低堂數已提醒"]) {
    patch["低堂數已提醒"] = { checkbox: {} };
  }
  if (!props["老師權限"]) {
    patch["老師權限"] = {
      select: {
        options: [
          { name: "無", color: "default" },
          { name: "待審核", color: "yellow" },
          { name: "已核准", color: "green" }
        ]
      }
    };
  }

  if (Object.keys(patch).length) {
    await notionFetch("/databases/" + env.NOTION_DATABASE_MEMBERS, env.NOTION_TOKEN, {
      method: "PATCH",
      body: JSON.stringify({ properties: patch })
    });
  }

  memberSchemaReady = true;
}

async function processMemberLifecycle(env, member) {
  await ensureMemberSchema(env);
  var patch = {};
  var credits = member.credits;
  var recorded = member.systemRecordedCredits;

  if (recorded === null) {
    patch["系統記錄堂數"] = { number: credits };
    member.systemRecordedCredits = credits;
    recorded = credits;
  }

  if (isTrialMember(member)) {
    var trialEnd = getTrialExpiryDate(member.trialGiftRaw);
    if (member.expiresRaw !== trialEnd) {
      patch["到期日"] = { date: { start: trialEnd } };
      member.expiresRaw = trialEnd;
    }
  }

  if (shouldExtendPurchaseExpiry(member, credits)) {
    var purchaseExpiry = addDays(isoToday(), 90);
    patch["到期日"] = { date: { start: purchaseExpiry } };
    patch["系統記錄堂數"] = { number: credits };
    patch["體驗贈送日"] = { date: null };
    patch["低堂數已提醒"] = { checkbox: false };
    member.expiresRaw = purchaseExpiry;
    member.systemRecordedCredits = credits;
    member.trialGiftRaw = "";
    member.lowCreditNotified = false;
  }

  if (credits > 3 && member.lowCreditNotified) {
    patch["低堂數已提醒"] = { checkbox: false };
    member.lowCreditNotified = false;
  }

  if (Object.keys(patch).length) {
    await updatePage(env.NOTION_TOKEN, member.id, patch);
  }

  member.expiresAt = formatDateZh(getEffectiveExpiryRaw(member));
  return member;
}

function buildClosureLabel(remark) {
  var text = (remark || "").trim();
  if (/進修/.test(text) && /停課/.test(text)) {
    return "老師進修 停課";
  }
  if (/停課/.test(text)) {
    return "停課";
  }
  if (/休假/.test(text)) {
    return "休假";
  }
  return text.slice(0, 16) || "停課";
}

function parseCoursePage(page) {
  var props = page.properties || {};
  var dateRaw = getCourseDate(props);
  var courseTime = getCourseTime(props);
  var rawTitle = getTitle(props, "課程名稱");
  var remark = getRichText(props, "備註");
  var hasCapacity = Object.prototype.hasOwnProperty.call(props, "名額");
  var hasEnrolled = Object.prototype.hasOwnProperty.call(props, "已報名");
  var hasStatus = Object.prototype.hasOwnProperty.call(props, "狀態");
  var statusValue = getSelectOrStatus(props, "狀態");
  var title = applyTimePeriodToCourseTitle(rawTitle, courseTime);
  var isHoliday = /停課|休假|取消|未開課|進修/.test(remark);
  var isIncomplete = !rawTitle.trim() || !courseTime.trim();
  var isClosed = (hasStatus && statusValue !== "開放") || isHoliday || isIncomplete;
  var isClosure = isHoliday && Boolean(dateRaw);

  return {
    id: page.id,
    title: title,
    date: dateRaw,
    time: courseTime,
    instructor: getRichText(props, "老師")
      || parseInstructorFromTitle(rawTitle)
      || "佳貞老師",
    capacity: hasCapacity ? getNumber(props, "名額") : 12,
    enrolled: hasEnrolled ? getNumber(props, "已報名") : 0,
    status: isClosed ? "closed" : "open",
    notionStatus: statusValue || (isClosed ? "停課" : "開放"),
    remark: remark,
    hasEnrolled: hasEnrolled,
    isClosure: isClosure,
    closureLabel: isClosure ? buildClosureLabel(remark) : ""
  };
}

async function queryDatabase(token, databaseId, body) {
  var results = [];
  var cursor = undefined;

  do {
    var payload = Object.assign({}, body || {}, cursor ? { start_cursor: cursor } : {});
    var data = await notionFetch("/databases/" + databaseId + "/query", token, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

export async function getMemberByUserId(env, userId) {
  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_MEMBERS, {
    filter: buildMemberUserIdFilter(userId),
    page_size: 1
  });

  if (!pages.length) {
    return null;
  }

  var member = parseMemberPage(pages[0]);
  return processMemberLifecycle(env, member);
}

export async function getOrCreateMember(env, userId, displayName) {
  var existing = await getMemberByUserId(env, userId);
  var cleanName = (displayName || "").trim().slice(0, 100);

  if (existing) {
    if (cleanName && existing.displayName !== cleanName) {
      await updatePage(env.NOTION_TOKEN, existing.id, {
        "學員姓名": { rich_text: [{ text: { content: cleanName } }] }
      });
      existing.displayName = cleanName;
    }

    if (cleanName) {
      await syncBookingRecordsForMember(env, userId, cleanName);
    }

    existing = await processMemberLifecycle(env, existing);
    return { member: existing, created: false };
  }

  var name = cleanName || "LINE學員";

  var page = await createPage(env.NOTION_TOKEN, env.NOTION_DATABASE_MEMBERS, {
    "預約編號": { title: [{ text: { content: userId } }] },
    "學員姓名": { rich_text: [{ text: { content: name } }] },
    "剩餘堂數": { number: 0 },
    "系統記錄堂數": { number: 0 },
    "狀態": { select: { name: "有效" } }
  });

  var member = parseMemberPage(page);
  member.systemRecordedCredits = 0;
  return {
    member: member,
    created: true
  };
}

export async function getCoursesByMonth(env, year, month) {
  var monthStr = String(month).padStart(2, "0");
  var start = year + "-" + monthStr + "-01";
  var lastDay = new Date(year, month, 0).getDate();
  var end = year + "-" + monthStr + "-" + String(lastDay).padStart(2, "0");

  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_COURSES, {
    filter: {
      and: [
        { property: "日期", date: { on_or_after: start } },
        { property: "日期", date: { on_or_before: end } }
      ]
    },
    sorts: [
      { property: "日期", direction: "ascending" }
    ]
  });

  return pages.map(parseCoursePage).filter(function (c) {
    if (!c.date) {
      return false;
    }
    if (c.status === "open") {
      return true;
    }
    return c.isClosure;
  });
}

export async function getActiveBookingsByUser(env, userId) {
  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_BOOKINGS, {
    filter: {
      and: [
        { property: "LINE userId", rich_text: { equals: userId } },
        { property: "狀態", select: { equals: "已確認" } }
      ]
    }
  });

  return pages.map(function (page) {
    var props = page.properties || {};
    return {
      id: page.id,
      bookingKey: getTitle(props, "預約編號"),
      userId: getTextOrTitle(props, "LINE userId"),
      courseId: getRichText(props, "課程ID"),
      status: getSelectOrStatus(props, "狀態")
    };
  });
}

export async function getBookingByUserAndCourse(env, userId, courseId) {
  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_BOOKINGS, {
    filter: {
      and: [
        { property: "LINE userId", rich_text: { equals: userId } },
        { property: "課程ID", rich_text: { equals: courseId } },
        { property: "狀態", select: { equals: "已確認" } }
      ]
    },
    page_size: 1
  });

  return pages.length ? pages[0] : null;
}

function buildBookingTitle(member, course) {
  var dateLabel = course.date || "";
  if (dateLabel.length >= 10) {
    dateLabel = dateLabel.slice(5).replace("-", "/");
  }
  var timeLabel = course.time || "";
  return member.displayName + "｜" + course.title + "｜" + dateLabel + " " + timeLabel;
}

function buildBookingTitleFromRecord(displayName, courseName, classTime) {
  var classTimeStr = (classTime || "").trim();
  var date = "";
  var time = "";

  if (classTimeStr.indexOf(" ") !== -1) {
    var parts = classTimeStr.split(" ");
    date = parts[0];
    time = parts.slice(1).join(" ");
  } else {
    time = classTimeStr;
  }

  var dateLabel = date.length >= 10 ? date.slice(5).replace("-", "/") : date;
  return (displayName + "｜" + courseName + "｜" + dateLabel + " " + time).trim().slice(0, 200);
}

async function syncBookingRecordsForMember(env, userId, displayName) {
  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_BOOKINGS, {
    filter: {
      property: "LINE userId",
      rich_text: { equals: userId }
    }
  });

  for (var i = 0; i < pages.length; i++) {
    var page = pages[i];
    var props = page.properties || {};
    var currentName = getRichText(props, "學員姓名");

    if (currentName === displayName) {
      continue;
    }

    var courseName = getRichText(props, "課程名稱");
    var classTime = getRichText(props, "上課時間");
    var bookingTitle = buildBookingTitleFromRecord(displayName, courseName, classTime);

    await updatePage(env.NOTION_TOKEN, page.id, {
      "預約編號": { title: [{ text: { content: bookingTitle } }] },
      "學員姓名": { rich_text: [{ text: { content: displayName } }] }
    });
  }
}

async function updatePage(token, pageId, properties) {
  return notionFetch("/pages/" + pageId, token, {
    method: "PATCH",
    body: JSON.stringify({ properties: properties })
  });
}

async function createPage(token, databaseId, properties) {
  return notionFetch("/pages", token, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: properties
    })
  });
}

function isMemberExpired(member) {
  return isMemberExpiredByRules(member);
}

export async function bookCourse(env, userId, courseId) {
  var member = await getMemberByUserId(env, userId);

  if (!member) {
    throw new Error("找不到學員資料，請聯絡工作室協助註冊");
  }

  if (member.status !== "active") {
    throw new Error("您的帳號尚在審核中，請聯絡工作室");
  }

  if (isMemberExpired(member)) {
    if (isTrialMember(member)) {
      throw new Error("體驗課已過期，請聯絡工作室購買正式課程（贈送後兩週內有效）");
    }
    throw new Error("您的方案已過期，請聯絡工作室續約");
  }

  if (member.credits <= 0) {
    throw new Error("堂數不足，無法預約");
  }

  var existing = await getBookingByUserAndCourse(env, userId, courseId);
  if (existing) {
    throw new Error("您已預約過這堂課");
  }

  var coursePage = await notionFetch("/pages/" + courseId, env.NOTION_TOKEN, { method: "GET" });
  var course = parseCoursePage(coursePage);

  if (course.status !== "open") {
    throw new Error("這堂課已關閉預約");
  }

  if (course.enrolled >= course.capacity) {
    throw new Error("這堂課已額滿");
  }

  validateTrialBooking(member, course.date);

  var bookingTitle = buildBookingTitle(member, course).trim().slice(0, 200);
  var creditsLeft = member.credits - 1;

  await createPage(env.NOTION_TOKEN, env.NOTION_DATABASE_BOOKINGS, {
    "預約編號": { title: [{ text: { content: bookingTitle } }] },
    "學員姓名": { rich_text: [{ text: { content: member.displayName } }] },
    "課程名稱": { rich_text: [{ text: { content: course.title } }] },
    "上課時間": { rich_text: [{ text: { content: ((course.date || "") + " " + (course.time || "")).trim() } }] },
    "LINE userId": { rich_text: [{ text: { content: userId } }] },
    "課程ID": { rich_text: [{ text: { content: courseId } }] },
    "狀態": { select: { name: "已確認" } }
  });

  await updatePage(env.NOTION_TOKEN, member.id, {
    "剩餘堂數": { number: creditsLeft },
    "系統記錄堂數": { number: creditsLeft }
  });

  if (course.hasEnrolled) {
    await updatePage(env.NOTION_TOKEN, courseId, {
      "已報名": { number: course.enrolled + 1 }
    });
  }

  var sent = await maybeNotifyLowCredits(env, member, creditsLeft);
  if (sent) {
    await updatePage(env.NOTION_TOKEN, member.id, {
      "低堂數已提醒": { checkbox: true }
    });
  }

  return {
    ok: true,
    message: "預約成功",
    creditsLeft: creditsLeft
  };
}

export async function cancelBooking(env, userId, courseId) {
  var bookingPage = await getBookingByUserAndCourse(env, userId, courseId);

  if (!bookingPage) {
    throw new Error("找不到這堂課的預約紀錄");
  }

  var member = await getMemberByUserId(env, userId);
  if (!member) {
    throw new Error("找不到學員資料");
  }

  var coursePage = await notionFetch("/pages/" + courseId, env.NOTION_TOKEN, { method: "GET" });
  var course = parseCoursePage(coursePage);

  await updatePage(env.NOTION_TOKEN, bookingPage.id, {
    "狀態": { select: { name: "已取消" } }
  });

  await updatePage(env.NOTION_TOKEN, member.id, {
    "剩餘堂數": { number: member.credits + 1 },
    "系統記錄堂數": { number: member.credits + 1 }
  });

  if (course.hasEnrolled) {
    await updatePage(env.NOTION_TOKEN, courseId, {
      "已報名": { number: Math.max(0, course.enrolled - 1) }
    });
  }

  return {
    ok: true,
    message: "已取消預約，堂數已退還",
    creditsLeft: member.credits + 1
  };
}

async function getConfirmedBookingsByCourseIds(env, courseIds) {
  if (!courseIds.length) {
    return [];
  }

  var courseFilters = courseIds.map(function (courseId) {
    return { property: "課程ID", rich_text: { equals: courseId } };
  });

  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_BOOKINGS, {
    filter: {
      and: [
        buildStatusFilter("狀態", "已確認"),
        { or: courseFilters }
      ]
    }
  });

  return pages.map(function (page) {
    var props = page.properties || {};
    return {
      id: page.id,
      userId: getTextOrTitle(props, "LINE userId"),
      courseId: getRichText(props, "課程ID")
    };
  });
}

async function getMembersMapByUserIds(env, userIds) {
  var unique = [];
  var seen = {};

  userIds.forEach(function (id) {
    if (id && !seen[id]) {
      seen[id] = true;
      unique.push(id);
    }
  });

  if (!unique.length) {
    return new Map();
  }

  var memberFilters = unique.map(function (userId) {
    return buildMemberUserIdFilter(userId);
  });

  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_MEMBERS, {
    filter: { or: memberFilters }
  });

  var map = new Map();

  pages.forEach(function (page) {
    var member = parseMemberPage(page);
    if (member.userId) {
      map.set(member.userId, member);
    }
  });

  return map;
}

function getCourseApiStatus(course) {
  if (course.isClosure) {
    return "停課";
  }

  if (course.notionStatus) {
    return course.notionStatus;
  }

  return course.status === "open" ? "開放" : "關閉";
}

function getCourseApiNote(course) {
  if (course.isClosure && course.closureLabel) {
    return course.closureLabel;
  }

  return (course.remark || "").trim();
}

function sortCoursesByTime(courses) {
  return courses.slice().sort(function (a, b) {
    var hourA = parseStartHour(a.time);
    var hourB = parseStartHour(b.time);

    if (hourA === null && hourB === null) {
      return 0;
    }
    if (hourA === null) {
      return 1;
    }
    if (hourB === null) {
      return -1;
    }

    if (hourA !== hourB) {
      return hourA - hourB;
    }

    return String(a.time || "").localeCompare(String(b.time || ""));
  });
}

export async function getCoursesByDate(env, dateIso) {
  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_COURSES, {
    filter: {
      or: [
        { property: "日期", date: { equals: dateIso } },
        { property: "上課日期", date: { equals: dateIso } }
      ]
    },
    sorts: [
      { property: "日期", direction: "ascending" }
    ]
  });

  return sortCoursesByTime(
    pages
      .map(parseCoursePage)
      .filter(function (course) {
        return course.date === dateIso;
      })
  );
}

export async function isTeacherApprovedInNotion(env, userId) {
  var member = await getMemberByUserId(env, userId);
  return Boolean(member && member.teacherRole === "已核准");
}

export async function getTeacherAccessStatus(env, userId) {
  await ensureMemberSchema(env);

  if (parseTeacherUserIds(env.TEACHER_LINE_USER_IDS).indexOf(userId) !== -1) {
    return {
      teacherRole: "已核准",
      canAccess: true,
      source: "env"
    };
  }

  var member = await getMemberByUserId(env, userId);
  var teacherRole = member ? member.teacherRole : "無";

  return {
    teacherRole: teacherRole,
    canAccess: teacherRole === "已核准",
    source: "notion"
  };
}

function parseTeacherUserIds(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
}

export async function requestTeacherAccess(env, userId, displayName) {
  await ensureMemberSchema(env);

  if (parseTeacherUserIds(env.TEACHER_LINE_USER_IDS).indexOf(userId) !== -1) {
    return {
      ok: true,
      status: "approved",
      message: "您已具備老師查看權限"
    };
  }

  var result = await getOrCreateMember(env, userId, displayName);
  var member = result.member;

  if (member.teacherRole === "已核准") {
    return {
      ok: true,
      status: "approved",
      message: "您已具備老師查看權限"
    };
  }

  if (member.teacherRole === "待審核") {
    return {
      ok: true,
      status: "pending",
      message: "申請審核中，請等候工作室核准"
    };
  }

  await updatePage(env.NOTION_TOKEN, member.id, {
    "老師權限": { select: { name: "待審核" } }
  });

  return {
    ok: true,
    status: "submitted",
    message: "已送出申請，工作室核准後會以 LINE 通知您",
    member: {
      id: member.id,
      userId: member.userId,
      displayName: member.displayName
    }
  };
}

export async function getPendingTeacherRequests(env) {
  await ensureMemberSchema(env);

  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_MEMBERS, {
    filter: buildStatusFilter("老師權限", "待審核"),
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }]
  });

  return pages.map(function (page) {
    var member = parseMemberPage(page);
    return {
      memberId: member.id,
      userId: member.userId,
      displayName: member.displayName,
      teacherRole: member.teacherRole
    };
  });
}

export async function approveTeacherRequest(env, memberId) {
  await ensureMemberSchema(env);
  await updatePage(env.NOTION_TOKEN, memberId, {
    "老師權限": { select: { name: "已核准" } }
  });

  var page = await notionFetch("/pages/" + memberId, env.NOTION_TOKEN, { method: "GET" });
  var member = parseMemberPage(page);

  return {
    ok: true,
    member: {
      id: member.id,
      userId: member.userId,
      displayName: member.displayName,
      teacherRole: "已核准"
    }
  };
}

export async function getTeacherScheduleForDate(env, dateIso) {
  var courses = await getCoursesByDate(env, dateIso);
  var courseIds = courses.map(function (course) { return course.id; });
  var bookings = await getConfirmedBookingsByCourseIds(env, courseIds);
  var userIds = bookings.map(function (booking) { return booking.userId; });
  var membersMap = await getMembersMapByUserIds(env, userIds);
  var bookingsByCourse = new Map();

  bookings.forEach(function (booking) {
    if (!bookingsByCourse.has(booking.courseId)) {
      bookingsByCourse.set(booking.courseId, []);
    }
    bookingsByCourse.get(booking.courseId).push(booking);
  });

  return courses.map(function (course) {
    var courseBookings = bookingsByCourse.get(course.id) || [];
    var students = courseBookings.map(function (booking) {
      var member = membersMap.get(booking.userId);
      var name = member
        ? member.displayName
        : (booking.userId || "未知學員");
      var type = "正式";

      if (!member) {
        type = "未知";
      } else if (isTrialMember(member)) {
        type = "體驗";
      }

      return {
        name: name,
        type: type
      };
    });

    return {
      courseId: course.id,
      time: course.time || "—",
      title: course.title || "未命名課程",
      capacity: course.capacity,
      enrolled: course.enrolled,
      status: getCourseApiStatus(course),
      students: students,
      note: getCourseApiNote(course)
    };
  });
}

export function ensureNotionEnv(env) {
  if (!env.NOTION_TOKEN) throw new Error("NOTION_TOKEN 未設定");
  if (!env.NOTION_DATABASE_MEMBERS) throw new Error("NOTION_DATABASE_MEMBERS 未設定");
  if (!env.NOTION_DATABASE_COURSES) throw new Error("NOTION_DATABASE_COURSES 未設定");
  if (!env.NOTION_DATABASE_BOOKINGS) throw new Error("NOTION_DATABASE_BOOKINGS 未設定");
}

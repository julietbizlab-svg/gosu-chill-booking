/**
 * 高手揪派 — Notion 資料庫操作
 *
 * 三個資料庫欄位名稱請與 Notion 完全一致：
 *
 * 【學員 Members】
 *   LINE userId (title) | 姓名 (text) | 剩餘堂數 (number) | 到期日 (date) | 狀態 (select: 有效/待審)
 *
 * 【課程 Courses】
 *   課程名稱 (title) | 上課日期 (date) | 上課時間 (text) | 老師 (text)
 *   名額 (number) | 已報名 (number) | 狀態 (select: 開放/關閉)
 *
 * 【預約 Bookings】
 *   預約編號 (title) | LINE userId (text) | 課程ID (text) | 狀態 (select: 已確認/已取消)
 */

var NOTION_VERSION = "2022-06-28";

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

function parseMemberPage(page) {
  var props = page.properties || {};
  var expiresRaw = getDateFlexible(props);

  return {
    id: page.id,
    userId: getTextOrTitle(props, "LINE userId"),
    displayName: getRichText(props, "姓名")
      || getRichText(props, "學員姓名")
      || getRichText(props, "学员姓名")
      || getTitle(props, "姓名")
      || getTextOrTitle(props, "LINE userId"),
    credits: getNumber(props, "剩餘堂數"),
    expiresAt: formatDateZh(expiresRaw),
    expiresRaw: expiresRaw,
    status: getSelectOrStatus(props, "狀態") === "有效" ? "active" : "pending"
  };
}

function parseCoursePage(page) {
  var props = page.properties || {};
  var dateRaw = getDate(props, "上課日期");

  return {
    id: page.id,
    title: getTitle(props, "課程名稱"),
    date: dateRaw,
    time: getRichText(props, "上課時間"),
    instructor: getRichText(props, "老師"),
    capacity: getNumber(props, "名額"),
    enrolled: getNumber(props, "已報名"),
    status: getSelectOrStatus(props, "狀態") === "開放" ? "open" : "closed"
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
    filter: buildTextOrTitleFilter("LINE userId", userId),
    page_size: 1
  });

  if (!pages.length) {
    return null;
  }

  return parseMemberPage(pages[0]);
}

export async function getCoursesByMonth(env, year, month) {
  var monthStr = String(month).padStart(2, "0");
  var start = year + "-" + monthStr + "-01";
  var lastDay = new Date(year, month, 0).getDate();
  var end = year + "-" + monthStr + "-" + String(lastDay).padStart(2, "0");

  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_COURSES, {
    filter: {
      and: [
        { property: "上課日期", date: { on_or_after: start } },
        { property: "上課日期", date: { on_or_before: end } },
        buildStatusFilter("狀態", "開放")
      ]
    },
    sorts: [
      { property: "上課日期", direction: "ascending" }
    ]
  });

  return pages.map(parseCoursePage).filter(function (c) { return c.status === "open"; });
}

export async function getActiveBookingsByUser(env, userId) {
  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_BOOKINGS, {
    filter: {
      and: [
        buildTextOrTitleFilter("LINE userId", userId),
        buildStatusFilter("狀態", "已確認")
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
  var bookingKey = courseId + "_" + userId;
  var pages = await queryDatabase(env.NOTION_TOKEN, env.NOTION_DATABASE_BOOKINGS, {
    filter: {
      and: [
        { property: "預約編號", title: { equals: bookingKey } },
        buildStatusFilter("狀態", "已確認")
      ]
    },
    page_size: 1
  });

  return pages.length ? pages[0] : null;
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
  if (!member.expiresRaw) return false;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var expires = new Date(member.expiresRaw + "T00:00:00");
  return expires < today;
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

  var bookingKey = courseId + "_" + userId;

  await createPage(env.NOTION_TOKEN, env.NOTION_DATABASE_BOOKINGS, {
    "預約編號": { title: [{ text: { content: bookingKey } }] },
    "LINE userId": { rich_text: [{ text: { content: userId } }] },
    "課程ID": { rich_text: [{ text: { content: courseId } }] },
    "狀態": { select: { name: "已確認" } }
  });

  await updatePage(env.NOTION_TOKEN, member.id, {
    "剩餘堂數": { number: member.credits - 1 }
  });

  await updatePage(env.NOTION_TOKEN, courseId, {
    "已報名": { number: course.enrolled + 1 }
  });

  return {
    ok: true,
    message: "預約成功",
    creditsLeft: member.credits - 1
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
    "剩餘堂數": { number: member.credits + 1 }
  });

  await updatePage(env.NOTION_TOKEN, courseId, {
    "已報名": { number: Math.max(0, course.enrolled - 1) }
  });

  return {
    ok: true,
    message: "已取消預約，堂數已退還",
    creditsLeft: member.credits + 1
  };
}

export function ensureNotionEnv(env) {
  if (!env.NOTION_TOKEN) throw new Error("NOTION_TOKEN 未設定");
  if (!env.NOTION_DATABASE_MEMBERS) throw new Error("NOTION_DATABASE_MEMBERS 未設定");
  if (!env.NOTION_DATABASE_COURSES) throw new Error("NOTION_DATABASE_COURSES 未設定");
  if (!env.NOTION_DATABASE_BOOKINGS) throw new Error("NOTION_DATABASE_BOOKINGS 未設定");
}

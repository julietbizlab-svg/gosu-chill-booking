import { sendLinePush } from "./line-push.js";
import { parseAdminUserIds } from "./teacher-auth.js";

function getAdminApproveUrl() {
  return "https://liff.line.me/2010530394-zbVNU8Pq/approve.html";
}

function getTeacherPageUrl() {
  return "https://liff.line.me/2010530394-zbVNU8Pq/teacher-schedule.html";
}

export async function notifyAdminsTeacherRequest(env, member) {
  var adminIds = parseAdminUserIds(env.ADMIN_LINE_USER_IDS);

  if (!adminIds.length) {
    console.warn("[teacher-request] ADMIN_LINE_USER_IDS 未設定，略過通知");
    return false;
  }

  var text =
    "【老師權限申請】\n" +
    (member.displayName || "LINE 使用者") + " 申請開通「今日預約」查看權限。\n\n" +
    "請點開啟核准：\n" +
    getAdminApproveUrl();

  var sentAny = false;

  for (var i = 0; i < adminIds.length; i++) {
    var sent = await sendLinePush(env, adminIds[i], text);
    if (sent) {
      sentAny = true;
    }
  }

  return sentAny;
}

export async function notifyTeacherApproved(env, member) {
  if (!member || !member.userId) {
    return false;
  }

  var text =
    (member.displayName || "老師") + " 您好，\n" +
    "工作室已核准您的「今日預約」查看權限。\n\n" +
    "請點開啟：\n" +
    getTeacherPageUrl();

  return sendLinePush(env, member.userId, text);
}

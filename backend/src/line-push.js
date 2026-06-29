export async function sendLinePush(env, userId, text) {
  var token = env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    console.warn("[LINE] LINE_CHANNEL_ACCESS_TOKEN 未設定，略過推播");
    return false;
  }

  var response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: text }]
    })
  });

  if (!response.ok) {
    var body = await response.text();
    console.error("[LINE] 推播失敗", response.status, body);
    return false;
  }

  return true;
}

export async function maybeNotifyLowCredits(env, member, creditsLeft) {
  if (creditsLeft !== 3 || member.lowCreditNotified) {
    return;
  }

  var text =
    member.displayName + " 您好，您在高手揪派的剩餘堂數只剩 3 堂了。\n" +
    "歡迎再向工作室購買課程，我們課堂見！";

  var sent = await sendLinePush(env, member.userId, text);
  return sent;
}

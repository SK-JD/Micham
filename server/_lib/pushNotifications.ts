import webPush, { type PushSubscription } from "web-push";
import { adminDb } from "./supabaseAdmin.js";

type NotificationPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

let configured = false;

function configureWebPush() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@micham.app";
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export async function sendPushToUser(userId: string, payload: NotificationPayload) {
  if (!configureWebPush()) return { sent: 0, skipped: true };
  const db = adminDb();
  const { data, error } = await db
    .from("micham_push_subscriptions")
    .select("id, subscription")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) throw error;

  let sent = 0;
  for (const row of data ?? []) {
    try {
      await webPush.sendNotification(row.subscription as PushSubscription, JSON.stringify({
        title: payload.title,
        body: payload.body,
        tag: payload.tag,
        url: payload.url || "/",
        icon: "/icons/Micham_app_logo.svg",
        badge: "/icons/Micham_app_logo.svg",
      }));
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
      await db
        .from("micham_push_subscriptions")
        .update({
          active: statusCode === 404 || statusCode === 410 ? false : true,
          last_error: error instanceof Error ? error.message.slice(0, 400) : "Push delivery failed.",
        })
        .eq("id", row.id);
    }
  }
  return { sent, skipped: false };
}

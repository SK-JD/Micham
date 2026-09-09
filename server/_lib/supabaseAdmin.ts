import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { requiredEnv } from "./env.js";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

export function adminDb() {
  const serverKey = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serverKey) throw new Error("Missing server environment variable: SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(requiredEnv("SUPABASE_URL"), serverKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket as never,
    },
  });
}

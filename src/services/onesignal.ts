/**
 * OneSignal Web Push Service
 * Handles initialization and push token management for iPhone PWA
 */

import { supabase } from "@/integrations/supabase/client";

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || "df7c293f-d521-419d-9cbb-2843520ce5c4";
const PUSH_ENABLED_KEY = "push_notifications_enabled";
const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalInstance) => void>;
    OneSignal?: OneSignalInstance;
  }
}

interface OneSignalInstance {
  __initialized?: boolean;
  init: (config: OneSignalConfig) => Promise<void>;
  Notifications: {
    permission: boolean;
    requestPermission: () => Promise<void>;
    addEventListener: (event: string, callback: (granted: boolean) => void) => void;
  };
  User: {
    PushSubscription: {
      optIn: () => Promise<void>;
      optOut: () => Promise<void>;
      id: string | null;
    };
    addTag: (key: string, value: string) => Promise<void>;
  };
  login: (externalId: string, jwt?: string) => Promise<void>;
  logout: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface OneSignalConfig {
  appId: string;
  safari_web_id?: string;
  notifyButton?: { enable: boolean };
  allowLocalhostAsSecureOrigin?: boolean;
  serviceWorkerParam?: { scope: string };
  serviceWorkerPath?: string;
}

let isInitialized = false;
let oneSignalInstance: OneSignalInstance | null = null;
let initializedUserId: string | null = null;

/**
 * Load OneSignal SDK dynamically
 */
function loadOneSignalSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.OneSignal) {
      resolve();
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    
    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load OneSignal SDK"));
    document.head.appendChild(script);
  });
}

/**
 * Initialize OneSignal
 */
export async function initOneSignal(userId: string): Promise<void> {
  if (isInitialized && oneSignalInstance) {
    // OneSignal recommends login on every app open and whenever the account
    // changes. Skipping here can route a shared device's pushes to the prior user.
    await oneSignalInstance.login(userId);
    initializedUserId = userId;
    return;
  }
  if (window.OneSignal?.__initialized) {
    console.log("[OneSignal] SDK already initialized externally, reusing");
    oneSignalInstance = window.OneSignal;
    await oneSignalInstance.login(userId);
    initializedUserId = userId;
    isInitialized = true;
    return;
  }
  if (!ONESIGNAL_APP_ID) {
    console.error("OneSignal App ID not configured. VITE_ONESIGNAL_APP_ID is:", ONESIGNAL_APP_ID);
    throw new Error("OneSignal App ID mangler. Sjekk at VITE_ONESIGNAL_APP_ID er konfigurert.");
  }

  console.log("[OneSignal] Starting init with appId:", ONESIGNAL_APP_ID?.substring(0, 8) + "...");

  try {
    await loadOneSignalSDK();
    console.log("[OneSignal] SDK script loaded");

    await new Promise<void>((resolve, reject) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          oneSignalInstance = OneSignal;
          
          try {
            await OneSignal.init({
              appId: ONESIGNAL_APP_ID,
              allowLocalhostAsSecureOrigin: true,
              serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
              serviceWorkerParam: { scope: '/push/onesignal/' },
              notifyButton: { enable: false },
            });
            console.log("[OneSignal] SDK initialized");
          } catch (initErr: unknown) {
            // "SDK already initialized" is not a real error - just reuse the instance
            if (errorMessage(initErr).includes('already initialized')) {
              console.log("[OneSignal] SDK was already initialized, reusing");
            } else {
              throw initErr;
            }
          }

          // Login with user's external ID
          try {
            await OneSignal.login(userId);
            initializedUserId = userId;
            console.log("[OneSignal] Logged in as", userId.substring(0, 8) + "...");
          } catch (loginErr: unknown) {
            console.warn("[OneSignal] Login warning:", errorMessage(loginErr));
          }
          
          isInitialized = true;
          resolve();
        } catch (innerError) {
          console.error("[OneSignal] Init inner error:", innerError);
          reject(innerError);
        }
      });
    });

    console.log("[OneSignal] Fully initialized and ready");
  } catch (error) {
    console.error("[OneSignal] Init failed:", error);
    throw error;
  }
}

/** Detach the browser subscription from the signed-out account. */
export async function logoutOneSignal(): Promise<void> {
  if (!oneSignalInstance || !initializedUserId) return;
  try {
    await oneSignalInstance.logout();
  } finally {
    initializedUserId = null;
  }
}

/**
 * Check if running as standalone PWA
 */
export function isStandalonePWA(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator;
}

/**
 * Check if user has enabled push in localStorage
 */
export function isPushEnabled(): boolean {
  return localStorage.getItem(PUSH_ENABLED_KEY) === "true";
}

/**
 * Request push permission and register token
 */
export async function enablePush(userId: string, displayName: string): Promise<boolean> {
  if (!oneSignalInstance) {
    console.warn("OneSignal not initialized");
    return false;
  }

  try {
    // Request permission
    await oneSignalInstance.Notifications.requestPermission();
    
    if (!oneSignalInstance.Notifications.permission) {
      console.log("Push permission denied");
      return false;
    }

    // Opt in to push
    await oneSignalInstance.User.PushSubscription.optIn();
    
    // Get push subscription ID
    const pushToken = oneSignalInstance.User.PushSubscription.id;
    
    if (pushToken) {
      // Save to both tables for compatibility
      await Promise.all([
        savePushToken(userId, displayName, pushToken),
        savePushTokenRecord(userId, pushToken),
      ]);
      localStorage.setItem(PUSH_ENABLED_KEY, "true");
      console.log("Push notifications enabled");
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error enabling push:", error);
    return false;
  }
}

/**
 * Disable push notifications
 */
export async function disablePush(userId: string): Promise<void> {
  if (oneSignalInstance) {
    try {
      await oneSignalInstance.User.PushSubscription.optOut();
    } catch (error) {
      console.error("Error opting out:", error);
    }
  }
  
  // Remove from both tables
  await Promise.all([
    removePushToken(userId),
    removePushTokenRecord(userId),
  ]);
  localStorage.setItem(PUSH_ENABLED_KEY, "false");
  console.log("Push notifications disabled");
}

/**
 * Save push token to members table
 */
async function savePushToken(userId: string, displayName: string, pushToken: string): Promise<void> {
  const { error } = await supabase
    .from("members")
    .upsert(
      {
        user_id: userId,
        display_name: displayName,
        thread_id: DEFAULT_THREAD_ID,
        push_token: pushToken,
      },
      { onConflict: "user_id,thread_id" }
    );

  if (error) {
    throw new Error(`Kunne ikke lagre push-medlemskap: ${error.message}`);
  }
}

/**
 * Remove push token from members table
 */
async function removePushToken(userId: string): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ push_token: null })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Kunne ikke fjerne push-medlemskap: ${error.message}`);
  }
}

/**
 * Save push token to the canonical push registry used by server notifications.
 */
async function savePushTokenRecord(userId: string, playerId: string): Promise<void> {
  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      {
        user_id: userId,
        player_id: playerId,
        device_type: "web",
      },
      { onConflict: "user_id,player_id" }
    );

  if (error) {
    throw new Error(`Kunne ikke lagre push-token: ${error.message}`);
  }
}

/**
 * Remove push token from push_tokens table
 */
async function removePushTokenRecord(userId: string): Promise<void> {
  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Kunne ikke fjerne push-token: ${error.message}`);
  }
}

/**
 * Send push notification after a message insert succeeds.
 * The edge function loads the message/profile server-side using message_id
 * and enforces caller identity, so no preview/sender_name from the client is trusted.
 */
export async function triggerPushNotification(
  threadId: string,
  senderId: string,
  messageId: string,
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: {
        thread_id: threadId,
        sender_id: senderId,
        message_id: messageId,
      },
    });

    if (error) {
      console.error("Error triggering push notification:", error);
    }
  } catch (error) {
    console.error("Error calling push notification function:", error);
  }
}

export const oneSignalService = {
  init: initOneSignal,
  isStandalonePWA,
  isPushSupported,
  isPushEnabled,
  enablePush,
  disablePush,
  triggerPushNotification,
  logout: logoutOneSignal,
};

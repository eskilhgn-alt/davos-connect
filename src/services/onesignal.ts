/**
 * OneSignal Web Push Service
 * Handles initialization and push token management for iPhone PWA
 */

import { supabase } from "@/integrations/supabase/client";

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;
const PUSH_ENABLED_KEY = "push_notifications_enabled";
const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalInstance) => void>;
    OneSignal?: OneSignalInstance;
  }
}

interface OneSignalInstance {
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
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
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
  if (isInitialized) return;
  if (!ONESIGNAL_APP_ID) {
    console.warn("OneSignal App ID not configured");
    return;
  }

  try {
    await loadOneSignalSDK();

    await new Promise<void>((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        oneSignalInstance = OneSignal;
        
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerParam: { scope: "/" },
          notifyButton: { enable: false },
        });

        // Login with user's external ID
        await OneSignal.login(userId);
        
        isInitialized = true;
        resolve();
      });
    });

    console.log("OneSignal initialized successfully");
  } catch (error) {
    console.error("Error initializing OneSignal:", error);
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
      // Save to database
      await savePushToken(userId, displayName, pushToken);
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
  
  // Remove from database
  await removePushToken(userId);
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
    console.error("Error saving push token:", error);
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
    console.error("Error removing push token:", error);
  }
}

/**
 * Send push notification when a message is sent
 */
export async function triggerPushNotification(
  threadId: string,
  senderId: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: {
        thread_id: threadId,
        sender_id: senderId,
        sender_name: senderName,
        message_preview: messagePreview,
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
};

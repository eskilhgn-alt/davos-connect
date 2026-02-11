/**
 * errorToast – Global error handler with "Rapporter" + close button
 * Mobile-first: compact, dismissable, positioned for iPhone PWA
 * Usage: import { errorToast } from "@/utils/errorToast"; errorToast("Noe gikk galt");
 */

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export async function sendErrorToAdmin(message: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("bug_reports").insert({
    user_id: user.id,
    message: `[Auto-rapport] ${message}`,
    page_url: window.location.href,
    user_agent: navigator.userAgent,
  });
}

export function errorToast(message: string, options?: { description?: string }) {
  // Auto-log every error to bug_reports
  const fullMsg = `${message}${options?.description ? ` – ${options.description}` : ""}`;
  sendErrorToAdmin(fullMsg).catch(() => {});

  toast.error(message, {
    description: options?.description,
    duration: 6000,
    dismissible: true,
    closeButton: true,
  });
}

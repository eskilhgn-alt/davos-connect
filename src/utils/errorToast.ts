/**
 * errorToast – Global error handler with "Send to admin" capability
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
  toast.error(message, {
    description: options?.description,
    duration: 8000,
    action: {
      label: "Rapporter",
      onClick: async () => {
        await sendErrorToAdmin(`${message}${options?.description ? ` – ${options.description}` : ""}`);
        toast.success("Feilrapport sendt til admin");
      },
    },
  });
}

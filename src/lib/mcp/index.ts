import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get_my_profile";
import listRecentChat from "./tools/list_recent_chat";
import postChatMessage from "./tools/post_chat_message";

// Bygg direkte supabase.co-issuer fra prosjekt-ref (aldri fra SUPABASE_URL, som er .lovable.cloud-proxyen).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "guttahutte-mcp",
  title: "GüttaHütte",
  version: "0.2.0",
  instructions:
    "Verktøy for GüttaHütte-appen. Brukeren logger inn med sin egen konto via OAuth og alle kall kjører som den brukeren (RLS gjelder). Bruk `get_my_profile` for egen profil, `list_recent_chat_messages` for å lese nylige chat-meldinger, og `post_chat_message` for å sende en melding til gruppechatten.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listRecentChat, postChatMessage],
});

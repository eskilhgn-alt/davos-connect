import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get_my_profile";
import listRecentChat from "./tools/list_recent_chat";
import postChatMessage from "./tools/post_chat_message";
import getActiveTrip from "./tools/get_active_trip";
import listAgenda from "./tools/list_agenda";
import listRecentMedia from "./tools/list_recent_media";

// Direkte supabase.co-issuer fra prosjekt-ref (aldri .lovable.cloud-proxyen).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "guttahutte",
  title: "GüttaHütte",
  version: "0.3.0",
  instructions:
    "Verktøy for GüttaHütte, en privat turapp for en vennegjeng. Brukeren logger inn med egen konto; alle kall kjører som den brukeren og gjelder bare den aktive turen brukeren er medlem av. Arkiverte turer er skrivebeskyttet. Bruk get_active_trip for turinfo, list_agenda for plan, list_recent_chat_messages og post_chat_message for chatten, og list_recent_media for oversikt over Stories og Minner. Svar på norsk.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getActiveTrip, listAgenda, listRecentChat, postChatMessage, listRecentMedia, getMyProfile],
});

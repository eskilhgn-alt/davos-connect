import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get_my_profile";
import getMyShotTokens from "./tools/get_my_shot_tokens";
import getShotLeaderboard from "./tools/get_shot_leaderboard";
import getPointsLeaderboard from "./tools/get_points_leaderboard";
import listRecentChat from "./tools/list_recent_chat";
import postChatMessage from "./tools/post_chat_message";

// Bygg direkte supabase.co-issuer fra prosjekt-ref (aldri fra SUPABASE_URL, som er .lovable.cloud-proxyen).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "guttahutte-mcp",
  title: "GüttaHütte",
  version: "0.1.0",
  instructions:
    "Verktøy for GüttaHütte-appen. Brukeren logger inn med sin egen konto via OAuth, og alle verktøy kjører som den brukeren (RLS gjelder). Bruk `get_my_profile` og `get_my_shot_tokens` for personlig data, toppliste-verktøyene for gruppestatistikk, `list_recent_chat_messages` for å lese chat, og `post_chat_message` for å sende meldinger.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getMyProfile,
    getMyShotTokens,
    getShotLeaderboard,
    getPointsLeaderboard,
    listRecentChat,
    postChatMessage,
  ],
});

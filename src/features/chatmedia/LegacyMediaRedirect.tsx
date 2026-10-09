/**
 * CHAT-MEDIA-01: gamle /galleri og /historier-lenker sendes til panelene i Chat.
 * story=<id> bevares slik at riktig story åpnes i Chat.
 */
import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";

export type ChatPanel = "stories" | "minner";

export function chatPanelHref(panel: ChatPanel, search = ""): string {
  const incoming = new URLSearchParams(search);
  const next = new URLSearchParams({ panel });
  const story = incoming.get("story");
  if (panel === "stories" && story) next.set("story", story);
  return `/chat?${next.toString()}`;
}

export const LegacyMediaRedirect: React.FC<{ panel: ChatPanel }> = ({ panel }) => {
  const { search } = useLocation();
  return <Navigate to={chatPanelHref(panel, search)} replace />;
};

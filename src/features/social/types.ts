import type { ShotDraw, ShotParticipant } from "@/features/shot/types";
export interface SocialEvent {
  id: string;
  trip_id: string;
  kind: string;
  actor_id: string | null;
  target_id: string | null;
  source_id: string;
  title: string;
  body: string;
  created_at: string;
  ended_at: string | null;
}
export interface SocialDraw extends ShotDraw {
  kind: "draw" | "headshot";
  response: "taken" | "declined" | null;
  responded_at: string | null;
}
export interface SocialNotice {
  id: string;
  event_id: string;
  read_at: string | null;
  dismissed_at: string | null;
  event: SocialEvent;
}
export interface SocialRight {
  id: string;
  user_id: string;
  local_day: string;
  expires_at: string;
  consumed_by: string | null;
  reason: "leader" | "random";
}
export interface SocialStat {
  user_id: string;
  draws: number;
  headshots: number;
  taken: number;
  declined: number;
  draws_today: number;
  headshots_today: number;
  taken_today: number;
  declined_today: number;
}
export interface SocialState {
  trip_id: string;
  server_now: string;
  trip_day: string;
  writable: boolean;
  starts_today: number;
  unread_count: number;
  members: { id: string; name: string }[];
  events: SocialEvent[];
  notifications: SocialNotice[];
  active_vibe: SocialEvent | null;
  draws: SocialDraw[];
  participants: (ShotParticipant & { draw_id: string })[];
  rights: SocialRight[];
  stats: SocialStat[];
}
export interface SocialCommand {
  action:
    | "vibe_start"
    | "vibe_end"
    | "shot_start"
    | "headshot"
    | "respond"
    | "read"
    | "dismiss";
  source_id?: string;
  target_id?: string;
  text?: string;
}

export interface HistoryCursor {
  before: string;
  id: string;
}
export interface HistoryPage<T> {
  items: T[];
  cursor: HistoryCursor | null;
}

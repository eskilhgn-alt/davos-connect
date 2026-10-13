import * as React from "react";
import { OlderHistory, useSocialHistory } from "./history";
import type { SocialNotice } from "./types";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSocial, useOptionalSocial } from "./SocialProvider";
export function SocialHeaderInbox() {
  const social = useOptionalSocial();
  return social?.state ? <NotificationInbox /> : null;
}
export function NotificationInbox() {
  const { state, act, pending, error } = useSocial();
  const [history, setHistory] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const paged = useSocialHistory<SocialNotice>(
    "notifications",
    state?.notifications ?? [],
  );
  const notices = paged.items;
  const unread = state?.unread_count ?? notices.filter((n) => !n.read_at && !n.dismissed_at).length;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="tap-target relative"
          aria-label={`Varsler${unread ? `, ${unread} uleste` : ""}`}
        >
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute right-0 top-0 rounded-full bg-primary px-1 text-xs text-primary-foreground">
              {unread}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogTitle>Varsler</DialogTitle>
        <button
          className="min-h-11 text-sm underline"
          onClick={() => setHistory((v) => !v)}
        >
          {history ? "Vis åpne varsler" : "Vis også lukkede varsler"}
        </button>
        {error && <p role="alert">{error}</p>}
        {notices
          .filter((n) => history || !n.dismissed_at)
          .map((n) => (
            <article key={n.id} className="space-y-2 border-b py-3">
              <p className={n.read_at ? "" : "font-semibold"}>{n.event.body}</p>
              <time className="text-xs">
                {new Date(n.event.created_at).toLocaleString("nb-NO")}
              </time>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="min-h-11 underline"
                  to={`${n.event.kind === "vibe" ? "/stemning" : "/shot"}?trip=${n.event.trip_id}&event=${n.event.id}`}
                  onClick={() => {
                    setOpen(false);
                    if (state?.writable)
                      void act({ action: "read", source_id: n.id });
                  }}
                >
                  Åpne
                </Link>
                {state?.writable && !n.read_at && (
                  <button
                    disabled={pending}
                    className="min-h-11 underline"
                    onClick={() =>
                      void act({ action: "read", source_id: n.id })
                    }
                  >
                    Merk lest
                  </button>
                )}
                {state?.writable && !n.dismissed_at && (
                  <button
                    disabled={pending}
                    className="min-h-11 underline"
                    onClick={() =>
                      void act({ action: "dismiss", source_id: n.id })
                    }
                  >
                    Lukk varsel
                  </button>
                )}
              </div>
            </article>
          ))}
        <OlderHistory history={paged} />
        {!notices.length && <p>Ingen varsler ennå.</p>}
      </DialogContent>
    </Dialog>
  );
}

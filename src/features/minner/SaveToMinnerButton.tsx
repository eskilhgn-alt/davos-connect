/**
 * "Lagre i Minner" — explicit, server-authorised copy of a story or own chat
 * attachment into Minner. Confirms only after the RPC returns a matching row.
 */
import * as React from "react";
import { BookmarkPlus, Check, Loader2, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type SaveSource = { kind: "story"; id: string } | { kind: "attachment"; id: string };
type State = "idle" | "saving" | "saved" | "error";

export async function saveToMinner(src: SaveSource): Promise<void> {
  const { data, error } =
    src.kind === "story"
      ? await supabase.rpc("rpc_save_story_to_minner" as never, { p_story_id: src.id } as never)
      : await supabase.rpc("rpc_save_attachment_to_minner" as never, { p_attachment_id: src.id } as never);
  if (error) throw new Error(error.message);
  const row = data as { id?: string; source_story_id?: string | null; source_message_id?: string | null } | null;
  if (!row?.id) throw new Error("no_row");
  if (src.kind === "story" && row.source_story_id !== src.id) throw new Error("provenance_conflict");
}

export const SaveToMinnerButton: React.FC<{ source: SaveSource; variant?: "chat" | "overlay"; className?: string }> = ({
  source,
  variant = "chat",
  className,
}) => {
  const [state, setState] = React.useState<State>("idle");
  const busy = React.useRef(false);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy.current || state === "saved") return;
    busy.current = true;
    setState("saving");
    try {
      await saveToMinner(source);
      setState("saved");
    } catch {
      setState("error");
    } finally {
      busy.current = false;
    }
  };

  const label =
    state === "saving" ? "Lagrer…" : state === "saved" ? "Lagret i Minner" : state === "error" ? "Feilet – prøv igjen" : "Lagre i Minner";
  const Icon = state === "saving" ? Loader2 : state === "saved" ? Check : state === "error" ? RotateCw : BookmarkPlus;

  return (
    <button
      type="button"
      data-story-control="1"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={state === "saving" || state === "saved"}
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full text-xs font-medium disabled:opacity-80",
        variant === "overlay" ? "bg-black/40 text-white backdrop-blur-sm" : "text-muted-foreground",
        state === "error" && "text-destructive",
        className,
      )}
    >
      <Icon size={16} aria-hidden className={state === "saving" ? "animate-spin" : undefined} />
      {label}
    </button>
  );
};

/**
 * ChatPollCard – Inline poll card rendered in chat messages
 * Shows poll question, status, vote counts, and a link to the poll
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Vote, Crown, X, Clock, ChevronRight } from "lucide-react";

interface ChatPollCardProps {
  pollId: string;
  pollEvent: "created" | "ended" | "cancelled" | "reminder";
  messageText: string;
}

export const ChatPollCard: React.FC<ChatPollCardProps> = ({ pollId, pollEvent, messageText }) => {
  const navigate = useNavigate();

  const lines = messageText.split("\n");
  const question = lines[0] || "";
  const result = lines.length > 1 ? lines.slice(1).join("\n") : "";

  const getIcon = () => {
    switch (pollEvent) {
      case "created": return <Vote size={16} className="text-primary" />;
      case "ended": return <Crown size={16} className="text-primary" />;
      case "cancelled": return <X size={16} className="text-destructive" />;
      case "reminder": return <Clock size={16} className="text-amber-500" />;
      default: return <Vote size={16} className="text-primary" />;
    }
  };

  const getLabel = () => {
    switch (pollEvent) {
      case "created": return "Ny avstemming";
      case "ended": return "Avgjort";
      case "cancelled": return "Kansellert";
      case "reminder": return "Påminnelse";
      default: return "Avstemming";
    }
  };

  return (
    <button
      onClick={() => navigate("/poll")}
      className={cn(
        "w-full max-w-[280px] rounded-2xl overflow-hidden text-left",
        "bg-muted/80 border border-border",
        "active:scale-[0.98] transition-transform"
      )}
    >
      <div className="px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {getLabel()}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
          {question}
        </p>
        {result && (
          <p className="text-xs text-muted-foreground leading-snug">
            {result}
          </p>
        )}
        <div className="flex items-center justify-end gap-1 text-xs text-primary font-medium pt-0.5">
          {pollEvent === "created" || pollEvent === "reminder" ? "Stem nå" : "Se resultater"}
          <ChevronRight size={12} />
        </div>
      </div>
    </button>
  );
};

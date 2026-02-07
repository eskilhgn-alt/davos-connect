import * as React from "react";
import { format, setHours, setMinutes } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AgendaEvent } from "@/hooks/useAgenda";

const COLORS = [
  { value: "primary", label: "Blå", css: "bg-primary" },
  { value: "destructive", label: "Rød", css: "bg-destructive" },
  { value: "accent", label: "Grå", css: "bg-accent" },
  { value: "yellow", label: "Gul", css: "bg-[hsl(var(--davos-yellow))]" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (title: string, description: string, startAt: Date, endAt: Date, color: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  initialDate?: Date;
  initialHour?: number;
  editEvent?: AgendaEvent | null;
}

export const AgendaEventDialog: React.FC<Props> = ({
  open, onClose, onSave, onDelete, initialDate, initialHour, editEvent,
}) => {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [startHour, setStartHour] = React.useState("12");
  const [startMin, setStartMin] = React.useState("00");
  const [endHour, setEndHour] = React.useState("13");
  const [endMin, setEndMin] = React.useState("00");
  const [color, setColor] = React.useState("primary");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title);
      setDescription(editEvent.description ?? "");
      const s = new Date(editEvent.start_at);
      const e = new Date(editEvent.end_at);
      setStartHour(String(s.getHours()).padStart(2, "0"));
      setStartMin(String(s.getMinutes()).padStart(2, "0"));
      setEndHour(String(e.getHours()).padStart(2, "0"));
      setEndMin(String(e.getMinutes()).padStart(2, "0"));
      setColor(editEvent.color ?? "primary");
    } else {
      setTitle("");
      setDescription("");
      const h = initialHour ?? 12;
      setStartHour(String(h).padStart(2, "0"));
      setStartMin("00");
      setEndHour(String(Math.min(h + 1, 23)).padStart(2, "0"));
      setEndMin("00");
      setColor("primary");
    }
  }, [editEvent, initialHour, open]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const baseDate = editEvent ? new Date(editEvent.start_at) : (initialDate ?? new Date());
    const startAt = setMinutes(setHours(new Date(baseDate), parseInt(startHour)), parseInt(startMin));
    const endAt = setMinutes(setHours(new Date(baseDate), parseInt(endHour)), parseInt(endMin));
    startAt.setSeconds(0, 0);
    endAt.setSeconds(0, 0);
    await onSave(title.trim(), description.trim(), startAt, endAt, color);
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>{editEvent ? "Rediger hendelse" : "Ny hendelse"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {initialDate && (
            <p className="text-xs text-muted-foreground">
              {format(editEvent ? new Date(editEvent.start_at) : initialDate, "EEEE d. MMMM", { locale: nb })}
            </p>
          )}

          <Input
            placeholder="Tittel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <Textarea
            placeholder="Beskrivelse (valgfritt)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />

          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-1">
              <Input className="w-14 text-center" value={startHour} onChange={(e) => setStartHour(e.target.value)} maxLength={2} />
              <span>:</span>
              <Input className="w-14 text-center" value={startMin} onChange={(e) => setStartMin(e.target.value)} maxLength={2} />
            </div>
            <span className="text-muted-foreground text-sm">–</span>
            <div className="flex items-center gap-1">
              <Input className="w-14 text-center" value={endHour} onChange={(e) => setEndHour(e.target.value)} maxLength={2} />
              <span>:</span>
              <Input className="w-14 text-center" value={endMin} onChange={(e) => setEndMin(e.target.value)} maxLength={2} />
            </div>
          </div>

          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`w-8 h-8 rounded-full ${c.css} border-2 transition-all ${
                  color === c.value ? "border-foreground scale-110" : "border-transparent"
                }`}
                aria-label={c.label}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2">
          {editEvent && onDelete && (
            <Button variant="ghost" size="sm" className="text-destructive mr-auto" onClick={async () => { await onDelete(); onClose(); }}>
              Slett
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Avbryt</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Lagrer…" : "Lagre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

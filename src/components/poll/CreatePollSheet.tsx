/**
 * CreatePollSheet – Bottom sheet for creating a new poll
 */

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Loader2 } from "lucide-react";

interface CreatePollSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    question: string,
    options: string[],
    settings: {
      requireAll: boolean;
      sendPushOnCreate: boolean;
      sendPushOnResolved: boolean;
      deadlineMinutes: number | null;
    }
  ) => Promise<void>;
}

const DEADLINE_OPTIONS = [
  { label: "Ingen", value: null },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 time", value: 60 },
  { label: "2 timer", value: 120 },
  { label: "I kveld", value: 480 },
] as const;

export const CreatePollSheet: React.FC<CreatePollSheetProps> = ({
  open,
  onOpenChange,
  onSubmit,
}) => {
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const [requireAll, setRequireAll] = React.useState(false);
  const [sendPushCreate, setSendPushCreate] = React.useState(true);
  const [sendPushResolved, setSendPushResolved] = React.useState(true);
  const [deadlineMinutes, setDeadlineMinutes] = React.useState<number | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const canSubmit = question.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;

  const addOption = () => {
    if (options.length < 8) setOptions([...options, ""]);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, value: string) => {
    const next = [...options];
    next[idx] = value;
    setOptions(next);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    await onSubmit(question, options.filter((o) => o.trim()), {
      requireAll,
      sendPushOnCreate: sendPushCreate,
      sendPushOnResolved: sendPushResolved,
      deadlineMinutes,
    });
    setSubmitting(false);
    // Reset
    setQuestion("");
    setOptions(["", ""]);
    setRequireAll(false);
    setDeadlineMinutes(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-heading">Ny avstemming</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pt-4 pb-6">
          {/* Question */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Spørsmål</label>
            <DavosInput
              placeholder="Hva skal vi stemme over?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              autoFocus
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Alternativer</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <DavosInput
                    placeholder={`Alternativ ${i + 1}`}
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    className="flex-1"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(i)}
                      className="tap-target text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 8 && (
                <button
                  onClick={addOption}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus size={14} /> Legg til alternativ
                </button>
              )}
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Tidsfrist</label>
            <div className="flex flex-wrap gap-1.5">
              {DEADLINE_OPTIONS.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setDeadlineMinutes(d.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    deadlineMinutes === d.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Alle må svare</p>
                <p className="text-xs text-muted-foreground">Avsluttes automatisk når alle har stemt</p>
              </div>
              <Switch checked={requireAll} onCheckedChange={setRequireAll} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Push ved opprettelse</p>
                <p className="text-xs text-muted-foreground">Varsle alle om ny avstemming</p>
              </div>
              <Switch checked={sendPushCreate} onCheckedChange={setSendPushCreate} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Push ved resultat</p>
                <p className="text-xs text-muted-foreground">Varsle alle når det er avgjort</p>
              </div>
              <Switch checked={sendPushResolved} onCheckedChange={setSendPushResolved} />
            </div>
          </div>

          <DavosButton
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Opprett avstemming
          </DavosButton>
        </div>
      </SheetContent>
    </Sheet>
  );
};

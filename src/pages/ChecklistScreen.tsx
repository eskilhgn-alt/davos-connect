/**
 * ChecklistScreen – Shared packing list / checklist for the trip
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { BrandCard, BrandCardContent } from "@/components/ui/brand-card";
import { BrandInput } from "@/components/ui/brand-input";
import { BrandButton } from "@/components/ui/brand-button";
import { BrandEmptyState } from "@/components/ui/brand-empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  title: string;
  checked: boolean;
  checked_by: string | null;
  created_by: string;
  created_at: string;
}

export const ChecklistScreen: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = React.useState<ChecklistItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newItem, setNewItem] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from("checklist_items")
      .select("*")
      .order("checked", { ascending: true })
      .order("created_at", { ascending: true });
    setItems((data as ChecklistItem[]) || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Realtime
  React.useEffect(() => {
    const ch = supabase
      .channel("checklist-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const handleAdd = async () => {
    if (!newItem.trim() || !user) return;
    setAdding(true);
    const { error } = await supabase.from("checklist_items").insert({
      title: newItem.trim(),
      created_by: user.id,
    });
    setAdding(false);
    if (error) { errorToast("Kunne ikke legge til"); return; }
    setNewItem("");
    toast.success("Lagt til! ✅");
  };

  const handleToggle = async (item: ChecklistItem) => {
    const newChecked = !item.checked;
    await supabase.from("checklist_items").update({
      checked: newChecked,
      checked_by: newChecked ? user?.id : null,
    }).eq("id", item.id);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("checklist_items").delete().eq("id", id);
    if (error) errorToast("Kunne ikke slette");
  };

  const checkedCount = items.filter(i => i.checked).length;

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Pakkeliste"
        subtitle={items.length > 0 ? `${checkedCount}/${items.length} huket av` : "Delt sjekkliste"}
        leftAction={<BackButton fallbackPath="/hjem" />}
      />
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
        <div className="p-4 space-y-4 pb-10">
          {/* Add new item */}
          <div className="flex gap-2">
            <BrandInput
              placeholder="Legg til ting å huske..."
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="flex-1"
            />
            <BrandButton onClick={handleAdd} disabled={adding || !newItem.trim()} size="sm" className="h-11 px-3">
              {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            </BrandButton>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <BrandEmptyState
              icon={ListChecks}
              title="Ingen ting på listen ennå"
              description="Legg til ting alle bør huske å ta med"
            />
          ) : (
            <BrandCard>
              <BrandCardContent className="p-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg transition-colors",
                      item.checked && "opacity-60"
                    )}
                  >
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={() => handleToggle(item)}
                    />
                    <span className={cn(
                      "flex-1 text-sm text-foreground",
                      item.checked && "line-through text-muted-foreground"
                    )}>
                      {item.title}
                    </span>
                    {(item.created_by === user?.id) && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </BrandCardContent>
            </BrandCard>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChecklistScreen;

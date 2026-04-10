/**
 * ShotTokenOverview – Shows all users' token balances
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Coins } from "lucide-react";

interface TokenEntry {
  user_id: string;
  display_name: string;
  balance: number;
}

export const ShotTokenOverview: React.FC = () => {
  const [data, setData] = React.useState<TokenEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const load = async () => {
      const { data: result } = await supabase.rpc("rpc_get_all_shot_tokens");
      if (result) setData(result as unknown as TokenEntry[]);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <section>
      <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Coins size={14} />
        Token-oversikt
      </h2>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">Ingen data</p>
      ) : (
        <div className="space-y-0">
          {data.map((entry) => (
            <div
              key={entry.user_id}
              className="flex items-center justify-between py-2 px-2 border-b border-border last:border-0"
            >
              <span className="text-sm text-foreground truncate">{entry.display_name}</span>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i < entry.balance ? "bg-foreground" : "bg-border"
                    }`}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1 tabular-nums">
                  {entry.balance}/5
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

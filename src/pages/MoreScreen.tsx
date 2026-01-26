import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { DavosListRowSkeleton } from "@/components/ui/davos-skeleton";
import { DavosListRow } from "@/components/ui/davos-list-row";
import { moreMenuItems } from "@/config/moreMenu";

type ScreenState = "ready" | "loading" | "error";

export const MoreScreen: React.FC = () => {
  const [state] = React.useState<ScreenState>("ready");

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader title="Mer" subtitle="Innstillinger & info" />
      
      <div className="flex-1">
        {state === "loading" && (
          <div className="w-full">
            {Array.from({ length: 6 }).map((_, i) => (
              <DavosListRowSkeleton key={i} />
            ))}
          </div>
        )}
        
        {state === "error" && (
          <div className="flex-1 flex items-center justify-center">
            <DavosErrorState onRetry={() => {}} />
          </div>
        )}
        
        {state === "ready" && (
          <div className="divide-y divide-border">
            {moreMenuItems.map((item) => (
              <DavosListRow
                key={item.title}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MoreScreen;

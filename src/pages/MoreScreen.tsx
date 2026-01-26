import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { DavosListRowSkeleton } from "@/components/ui/davos-skeleton";
import { DavosListRow } from "@/components/ui/davos-list-row";
import { Settings, Users, Trophy, CloudSun, Bell, HelpCircle } from "lucide-react";

type ScreenState = "ready" | "loading" | "error";

const menuItems = [
  { icon: Users, title: "Gruppen", subtitle: "Se alle deltakere" },
  { icon: Trophy, title: "Utfordringer", subtitle: "Ski-challenges & poeng" },
  { icon: CloudSun, title: "Værmelding", subtitle: "Davos Klosters" },
  { icon: Bell, title: "Varsler", subtitle: "Push-innstillinger" },
  { icon: Settings, title: "Innstillinger", subtitle: "Profil & preferanser" },
  { icon: HelpCircle, title: "Hjelp", subtitle: "FAQ & support" },
];

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
            {menuItems.map((item) => (
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

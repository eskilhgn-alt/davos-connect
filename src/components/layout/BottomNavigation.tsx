import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MessageCircle, CloudSun, Map, Newspaper, MoreHorizontal, LucideIcon } from "lucide-react";

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  { icon: MessageCircle, label: "Chat", path: "/" },
  { icon: CloudSun, label: "Vær", path: "/vaer" },
  { icon: Map, label: "Kart", path: "/kart" },
  { icon: MoreHorizontal, label: "Mer", path: "/mer" },
];

export const BottomNavigation: React.FC = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="bg-primary shadow-nav border-t border-primary/20">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 tap-target px-4 py-2 transition-colors",
                  isActive ? "text-accent" : "text-primary-foreground/70 hover:text-primary-foreground"
                )}
              >
                <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                <span className="font-body text-xs font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

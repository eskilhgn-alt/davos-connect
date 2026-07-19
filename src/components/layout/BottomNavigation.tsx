import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, MessageCircle, Map as MapIcon, MoreHorizontal, LucideIcon } from "lucide-react";
import { useAppBadges } from "@/hooks/useAppBadges";

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  /** Path prefixes that should also count as "active" for this tab. */
  match?: string[];
  badgeKey?: "chat" | "mer";
}

const navItems: NavItem[] = [
  { icon: Home, label: "Hjem", path: "/hjem" },
  { icon: MessageCircle, label: "Chat", path: "/chat", badgeKey: "chat" },
  { icon: MapIcon, label: "Kart", path: "/kart", match: ["/kart", "/magnus"] },
  {
    icon: MoreHorizontal,
    label: "Mer",
    path: "/mer",
    match: [
      "/mer",
      "/agenda",
      "/poll",
      "/runder",
      "/roomies",
      "/galleri",
      "/historier",
      "/innstillinger",
      "/admin",
      "/alle",
      "/shot",
      "/tokens",
      "/faktasjekker",
      "/webcams",
    ],
    badgeKey: "mer",
  },
];

export const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const badges = useAppBadges();
  const [isKeyboardOpen, setIsKeyboardOpen] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsKeyboardOpen(document.documentElement.dataset.keyboard === "open");
    check();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === "data-keyboard") check();
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-keyboard"],
    });
    return () => observer.disconnect();
  }, []);

  if (isKeyboardOpen) return null;

  const merBadge =
    (badges.agenda || 0) + (badges.polls || 0) + (badges.runder || 0) + (badges.shot || 0);

  const isActive = (item: NavItem) => {
    const paths = item.match ?? [item.path];
    return paths.some(
      (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
    );
  };

  return (
    <nav data-bottom-nav="true" className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="bg-background/95 backdrop-blur-md border-t border-border">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const active = isActive(item);
            const badgeCount =
              item.badgeKey === "chat" ? badges.chat : item.badgeKey === "mer" ? merBadge : 0;
            const showBadge = badgeCount > 0;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 tap-target px-4 py-1.5 transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <div className="relative">
                  <item.icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                  {showBadge && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold px-1 leading-none">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className={cn("text-[10px]", active ? "font-semibold" : "font-medium")}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

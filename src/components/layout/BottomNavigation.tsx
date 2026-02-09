import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, MessageCircle, CloudSun, Radio, MoreHorizontal, LucideIcon } from "lucide-react";
import { useAppBadges } from "@/hooks/useAppBadges";

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  badge?: boolean;
}

const navItems: NavItem[] = [
  { icon: Home, label: "Hjem", path: "/hjem" },
  { icon: MessageCircle, label: "Chat", path: "/chat", badge: true },
  { icon: CloudSun, label: "Vær", path: "/vaer" },
  { icon: Radio, label: "Live", path: "/live" },
  { icon: MoreHorizontal, label: "Mer", path: "/mer" },
];

export const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const badges = useAppBadges();
  const [isKeyboardOpen, setIsKeyboardOpen] = React.useState(false);
  const isHome = location.pathname === "/" || location.pathname === "/hjem";

  React.useEffect(() => {
    const checkKeyboard = () => {
      const keyboardOpen = document.documentElement.dataset.keyboard === 'open';
      setIsKeyboardOpen(keyboardOpen);
    };

    checkKeyboard();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-keyboard') {
          checkKeyboard();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-keyboard'],
    });

    return () => observer.disconnect();
  }, []);

  if (isKeyboardOpen || isHome) {
    return null;
  }

  return (
    <nav data-bottom-nav="true" className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="bg-background/95 backdrop-blur-md border-t border-border">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const badgeCount = item.path === "/chat" ? badges.chat : 0;
            const showBadge = item.badge && badgeCount > 0;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 tap-target px-4 py-1.5 transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <div className="relative">
                  <item.icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                  {showBadge && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold px-1 leading-none">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className={cn("text-[10px]", isActive ? "font-semibold" : "font-medium")}>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

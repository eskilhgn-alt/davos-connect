import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, MessageCircle, CloudSun, Radio, MoreHorizontal, LucideIcon } from "lucide-react";
import { useUnreadCount } from "@/hooks/useUnreadCount";

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
  const unreadCount = useUnreadCount();
  const [isKeyboardOpen, setIsKeyboardOpen] = React.useState(false);

  // Watch for keyboard state changes via data-keyboard attribute
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

  if (isKeyboardOpen) {
    return null;
  }

  return (
    <nav data-bottom-nav="true" className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="bg-primary shadow-nav border-t border-primary/20">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const showBadge = item.badge && unreadCount > 0;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 tap-target px-4 py-2 transition-colors",
                  isActive ? "text-accent" : "text-primary-foreground/70 hover:text-primary-foreground"
                )}
              >
                <div className="relative">
                  <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
                <span className="font-body text-xs font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

import { Users, Settings, Shield, LucideIcon } from "lucide-react";

export interface MenuItem {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  path?: string;
  requiresAdmin?: boolean;
}

export const moreMenuItems: MenuItem[] = [
  { icon: Users, title: "Alle", subtitle: "Se alle deltakere", path: "/gruppe" },
  { icon: Settings, title: "Innstillinger", subtitle: "Varsler & info", path: "/innstillinger" },
  { icon: Shield, title: "Admin", subtitle: "Brukeradministrasjon", path: "/admin", requiresAdmin: true },
];

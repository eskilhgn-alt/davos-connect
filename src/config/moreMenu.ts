import { Users, Image, Bell, Info, Shield, LucideIcon } from "lucide-react";

export interface MenuItem {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  path?: string;
  requiresAdmin?: boolean;
}

export const moreMenuItems: MenuItem[] = [
  { icon: Image, title: "Galleri", subtitle: "Bilder & videoer delt i chat", path: "/galleri" },
  { icon: Users, title: "Gruppen", subtitle: "Se alle deltakere", path: "/gruppe" },
  { icon: Bell, title: "Varsler", subtitle: "Push-innstillinger", path: "/varsler" },
  { icon: Info, title: "Info", subtitle: "Om appen & sikkerhet", path: "/info" },
  { icon: Shield, title: "Admin", subtitle: "Brukeradministrasjon", path: "/admin", requiresAdmin: true },
];

import { Settings, Users, Trophy, CloudSun, Bell, HelpCircle, LucideIcon } from "lucide-react";

export interface MenuItem {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  path?: string;
}

export const moreMenuItems: MenuItem[] = [
  { icon: Users, title: "Gruppen", subtitle: "Se alle deltakere" },
  { icon: Trophy, title: "Utfordringer", subtitle: "Ski-challenges & poeng" },
  { icon: CloudSun, title: "Værmelding", subtitle: "Davos Klosters" },
  { icon: Bell, title: "Varsler", subtitle: "Push-innstillinger" },
  { icon: Settings, title: "Innstillinger", subtitle: "Profil & preferanser" },
  { icon: HelpCircle, title: "Hjelp", subtitle: "FAQ & support" },
];

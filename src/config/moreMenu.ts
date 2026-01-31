import { Settings, Users, Trophy, CloudSun, Bell, HelpCircle, Image, LucideIcon } from "lucide-react";

export interface MenuItem {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  path?: string;
}

export const moreMenuItems: MenuItem[] = [
  { icon: Image, title: "Galleri", subtitle: "Bilder & videoer delt i chat", path: "/galleri" },
  { icon: Users, title: "Gruppen", subtitle: "Se alle deltakere" },
  { icon: Trophy, title: "Utfordringer", subtitle: "Ski-challenges & poeng" },
  { icon: CloudSun, title: "Værmelding", subtitle: "Davos Klosters", path: "/vaer" },
  { icon: Bell, title: "Varsler", subtitle: "Push-innstillinger", path: "/varsler" },
  { icon: Settings, title: "Innstillinger", subtitle: "Profil & preferanser" },
  { icon: HelpCircle, title: "Hjelp", subtitle: "FAQ & support" },
];

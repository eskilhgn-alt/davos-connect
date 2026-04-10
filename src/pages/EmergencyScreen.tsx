/**
 * EmergencyScreen – Nødinfo og viktige kontakter for Davos
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { Phone, MapPin, Shield, Heart, Mountain, AlertTriangle } from "lucide-react";

interface ContactCard {
  icon: React.ElementType;
  title: string;
  items: { label: string; value: string; href?: string }[];
  accent?: boolean;
}

const CONTACTS: ContactCard[] = [
  {
    icon: AlertTriangle,
    title: "Nødnumre",
    accent: true,
    items: [
      { label: "Nødnummer (politi)", value: "112", href: "tel:112" },
      { label: "Brann", value: "118", href: "tel:118" },
      { label: "Ambulanse", value: "144", href: "tel:144" },
      { label: "Rega (luftambulanse)", value: "1414", href: "tel:1414" },
    ],
  },
  {
    icon: Heart,
    title: "Sykehus & Lege",
    items: [
      { label: "Spital Davos", value: "+41 81 414 88 88", href: "tel:+41814148888" },
      { label: "Adresse", value: "Promenade 4, 7270 Davos" },
    ],
  },
  {
    icon: Mountain,
    title: "Skipatruljer & Redning",
    items: [
      { label: "Pistenrettungsdienst Davos", value: "+41 81 415 21 00", href: "tel:+41814152100" },
      { label: "Parsenn/Jakobshorn pistetelefon", value: "+41 81 415 21 21", href: "tel:+41814152121" },
      { label: "Skredvarsel (SLF)", value: "slf.ch", href: "https://www.slf.ch" },
    ],
  },
  {
    icon: Shield,
    title: "Politi & Ambassade",
    items: [
      { label: "Kantonspolizei Graubünden", value: "+41 81 257 71 11", href: "tel:+41812577111" },
      { label: "Norsk ambassade Bern", value: "+41 31 310 55 55", href: "tel:+41313105555" },
    ],
  },
  {
    icon: MapPin,
    title: "Nyttige adresser",
    items: [
      { label: "Davos Tourismus", value: "Talstrasse 41, 7270 Davos", href: "https://maps.google.com/?q=Davos+Tourismus" },
      { label: "Apotek (TopPharm)", value: "Promenade 60, 7270 Davos", href: "https://maps.google.com/?q=TopPharm+Davos" },
      { label: "Nærmeste matbutikk (Coop)", value: "Promenade 73, Davos", href: "https://maps.google.com/?q=Coop+Davos+Promenade" },
    ],
  },
];

export const EmergencyScreen: React.FC = () => (
  <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
    <AppHeader
      title="Nødinfo"
      subtitle="Viktige kontakter i Davos"
      leftAction={<BackButton fallbackPath="/hjem" />}
    />
    <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
      <div className="p-4 space-y-3 pb-10">
        {/* Important banner */}
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Ved nødsituasjon – ring alltid 112 først</p>
            <p className="text-xs text-muted-foreground mt-1">Alle numre er sveitsiske. Fungerer fra norsk mobil med landkode.</p>
          </div>
        </div>

        {CONTACTS.map((card, idx) => (
          <DavosCard key={idx}>
            <DavosCardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <card.icon size={18} className={card.accent ? "text-destructive" : "text-primary"} />
                <h3 className="font-heading font-semibold text-foreground text-sm">{card.title}</h3>
              </div>
              <div className="space-y-2">
                {card.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground flex-1">{item.label}</span>
                    {item.href ? (
                      <a
                        href={item.href}
                        target={item.href.startsWith("http") ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-primary underline underline-offset-2 shrink-0"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-foreground shrink-0">{item.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </DavosCardContent>
          </DavosCard>
        ))}
      </div>
    </div>
  </div>
);

export default EmergencyScreen;

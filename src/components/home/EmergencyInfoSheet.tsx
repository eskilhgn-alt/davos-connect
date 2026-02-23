/**
 * EmergencyInfoSheet — Nødinfo popup for Davos, Sveits
 * Shown at bottom of home screen as a subtle link
 */
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { Phone, MapPin, Shield, Heart, Mountain, AlertTriangle, Pill } from "lucide-react";

interface ContactCard {
  icon: React.ElementType;
  title: string;
  items: { label: string; value: string; href?: string }[];
  accent?: boolean;
}

const CONTACTS: ContactCard[] = [
  {
    icon: AlertTriangle,
    title: "Nødnumre (Sveits)",
    accent: true,
    items: [
      { label: "Politi", value: "117", href: "tel:117" },
      { label: "Brann", value: "118", href: "tel:118" },
      { label: "Ambulanse", value: "144", href: "tel:144" },
      { label: "Rega (luftambulanse)", value: "1414", href: "tel:1414" },
      { label: "Europeisk nødnummer", value: "112", href: "tel:112" },
    ],
  },
  {
    icon: Heart,
    title: "Sykehus & Legevakt",
    items: [
      { label: "Spital Davos (24t akuttmottak)", value: "+41 81 414 88 88", href: "tel:+41814148888" },
      { label: "Adresse", value: "Promenade 4, 7270 Davos Platz" },
      { label: "Legevakt Davos (24t)", value: "+41 844 003 003", href: "tel:+41844003003" },
    ],
  },
  {
    icon: Mountain,
    title: "Skipatrulje & Redning",
    items: [
      { label: "Pistenrettungsdienst Davos", value: "+41 81 415 21 00", href: "tel:+41814152100" },
      { label: "Skredvarsel (SLF)", value: "slf.ch", href: "https://www.slf.ch/en" },
    ],
  },
  {
    icon: Pill,
    title: "Apotek",
    items: [
      { label: "TopPharm Amavita", value: "Promenade 60, Davos Platz", href: "https://maps.google.com/?q=TopPharm+Amavita+Davos+Promenade+60" },
    ],
  },
  {
    icon: Shield,
    title: "Politi & Ambassade",
    items: [
      { label: "Kantonspolizei Graubünden", value: "+41 81 257 71 11", href: "tel:+41812577111" },
      { label: "Norsk ambassade (Bern)", value: "+41 31 310 55 55", href: "tel:+41313105555" },
    ],
  },
  {
    icon: MapPin,
    title: "Nyttige steder",
    items: [
      { label: "Davos Tourismus", value: "Talstrasse 41, Davos Platz", href: "https://maps.google.com/?q=Davos+Tourismus+Talstrasse+41" },
      { label: "Coop Davos", value: "Promenade 73, Davos Platz", href: "https://maps.google.com/?q=Coop+Davos+Promenade+73" },
      { label: "Migros Davos", value: "Promenade 37, Davos Platz", href: "https://maps.google.com/?q=Migros+Davos+Promenade" },
    ],
  },
];

interface EmergencyInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EmergencyInfoSheet: React.FC<EmergencyInfoSheetProps> = ({ open, onOpenChange }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl overflow-y-auto">
      <SheetHeader>
        <SheetTitle className="font-heading text-base flex items-center gap-2">
          <AlertTriangle size={18} className="text-destructive" />
          Nødinfo – Davos, Sveits
        </SheetTitle>
      </SheetHeader>

      <div className="mt-4 space-y-3 pb-6">
        {/* Important banner */}
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 flex items-start gap-3">
          <Phone size={16} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground">Ved nødsituasjon – ring 112 eller 144</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Sveitsiske numre. Fungerer fra norsk mobil.</p>
          </div>
        </div>

        {CONTACTS.map((card, idx) => (
          <DavosCard key={idx}>
            <DavosCardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <card.icon size={16} className={card.accent ? "text-destructive" : "text-primary"} />
                <h3 className="font-heading font-semibold text-foreground text-xs">{card.title}</h3>
              </div>
              <div className="space-y-1.5">
                {card.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground flex-1">{item.label}</span>
                    {item.href ? (
                      <a
                        href={item.href}
                        target={item.href.startsWith("http") ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-primary underline underline-offset-2 shrink-0"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-foreground shrink-0">{item.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </DavosCardContent>
          </DavosCard>
        ))}
      </div>
    </SheetContent>
  </Sheet>
);

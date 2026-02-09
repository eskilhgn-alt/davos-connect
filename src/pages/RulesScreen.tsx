/**
 * RulesScreen — All app rules, point systems, and game mechanics
 * Accessible from Faktasjekker and home screen
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import {
  Star,
  Target,
  Flame,
  Mountain,
  Shield,
  Users,
  Timer,
  Award,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RuleSection {
  icon: React.ElementType;
  title: string;
  rules: { what: string; why: string; how: string }[];
}

const SECTIONS: RuleSection[] = [
  {
    icon: Star,
    title: "Poengsystem",
    rules: [
      { what: "Chat-melding: 1 poeng", why: "Belønner aktivt engasjement i gruppa", how: "Send en melding i chatten. Poeng tildeles automatisk daglig." },
      { what: "Bilde/video i chat: 3 poeng", why: "Media beriker samtalen og skaper minner", how: "Del et bilde eller video i chatten." },
      { what: "Story: 2 poeng", why: "Stories gir visuelt innhold til hele gruppa", how: "Publiser en story fra hjemskjermen." },
      { what: "Starte shot-runde: 3 poeng", why: "Den som starter runden tar initiativet", how: "Trykk på den røde knappen på Shot-skjermen." },
      { what: "Ta shot (utført): 4 poeng", why: "Å faktisk ta shotten er det modigste du gjør", how: "Bli trukket, ta shotten, og få den bekreftet av vitne." },
      { what: "Bekrefte som vitne: 1 poeng", why: "Vitner sikrer rettferdighet i spillet", how: "Bli valgt som vitne og bekreft at shotten ble tatt." },
      { what: "Skikjøring: 2p per 100m nedstigning", why: "Belønner aktivt skibruk", how: "Kjør med posisjonstjenester på. System registrerer automatisk over 1500 moh og >10 km/t." },
      { what: "Agenda-hendelser: 0 poeng", why: "Å opprette hendelser er en tjeneste, ikke en konkurranse", how: "Opprett hendelser fritt uten poengpåvirkning." },
    ],
  },
  {
    icon: Target,
    title: "Shoot Your Shot",
    rules: [
      { what: "Alle aktive brukere er alltid med i trekningen", why: "Ingen kan gjemme seg – alle er med", how: "Systemet inkluderer alle aktive profiler automatisk." },
      { what: "En runde koster 1 token", why: "Tokens begrenser spam, men hoarding er lov", how: "Trykk den røde knappen. 1 token trekkes fra saldoen din." },
      { what: "Vektet trekning for rettferdighet", why: "De som har blitt trukket mye nylig, har lavere sjanse", how: "Formelen: 1/(1 + 0.3 × antall nylige trekninger). Alle har en sjanse." },
      { what: "15 minutter til å ta shotten", why: "En rimelig frist som holder tempoet oppe", how: "Etter trekning starter nedtellingen. Ta shotten og velg et vitne." },
      { what: "Vitne har 15 minutter til å bekrefte", why: "Sikrer at noen verifiserer at det faktisk skjedde", how: "Vitnet mottar varsel og bekrefter eller avslår i appen." },
    ],
  },
  {
    icon: Shield,
    title: "Nekting & Straff",
    rules: [
      { what: "Nekting = 2 straffeshots + FEIG-varsel", why: "Feiging skal ha konsekvenser – og hele gruppa skal vite det", how: "Trykk 'Nekter' → push sendes til alle med ditt navn, og 2 straffeshots registreres." },
      { what: "Straffeshot-frist: 15 minutter", why: "Du får en sjanse til å gjøre opp for deg", how: "Ta straffeshottene innen fristen vises i appen." },
      { what: "Overskridelse = automatisk ban", why: "Konsekvens for å ikke følge reglene", how: "Etter 15 min uten registrert straffeshot, blokkeres kontoen til admin opphever den." },
      { what: "Dispute: vitne avslår → admin avgjør", why: "Forhindrer urettferdige straffer", how: "Vitne velger grunn for avslag, saken sendes til admin for avgjørelse." },
    ],
  },
  {
    icon: Award,
    title: "Tokens & Frikort",
    rules: [
      { what: "Startbalanse: 5 tokens", why: "Alle starter likt", how: "Nye brukere får 5 tokens automatisk." },
      { what: "+1 token per dag (maks 5)", why: "Jevn påfyll sikrer at alle kan spille", how: "Tokens fylles automatisk på, opptil 5." },
      { what: "Frikort: skip en runde uten straff", why: "Belønning for ski-vinnere og spesielle prestasjoner", how: "Bruk frikort når du er trukket for å slippe shotten denne gangen." },
      { what: "Bonustoken ved urettferdig trekning", why: "Kompensasjon for de som trekkes oftere enn andre", how: "Systemet gir +1 token automatisk hvis du leder med 2+ trekninger." },
    ],
  },
  {
    icon: Flame,
    title: "Streaks",
    rules: [
      { what: "1 dag streak = 1 aktiv handling per dag", why: "Konsistens belønnes over tid", how: "Send melding, del media, post story, eller start en shot-runde." },
      { what: "Streak vises på hjemskjermen", why: "Motivasjon og sosial prestisje", how: "Din streak og topp-streaks vises automatisk." },
      { what: "Streak brytes ved inaktiv dag", why: "Hold momentum – mist det, og start på nytt", how: "Hvis du ikke gjør noen handling en hel dag, nullstilles streaken." },
    ],
  },
  {
    icon: Mountain,
    title: "Ski-gamification",
    rules: [
      { what: "Sporing over 1500 moh & >10 km/t", why: "Filtrerer ut gåing og heis – kun aktiv nedkjøring teller", how: "Ha posisjon aktivert. Appen registrerer automatisk." },
      { what: "Daglig vinner: mest høydemeter", why: "Konkurranse om å kjøre mest i løpet av dagen", how: "Den med mest nedstigning over 100m kvalifiserer. Minimum 100m for å kvalifisere." },
      { what: "Vinner velger: frikort eller +1 token", why: "Fleksibel belønning tilpasset spillerens strategi", how: "Pop-up i appen lar vinneren velge belønning." },
    ],
  },
  {
    icon: Users,
    title: "Globalt vs. Privat",
    rules: [
      { what: "Globalt: Chat, topplister, streaks, shots, stories, galleri, kart", why: "Fellesskapsopplevelse – alle ser det samme", how: "Alt du poster eller gjør er synlig for hele crewet." },
      { what: "Privat: Tokens, frikort, kontoinnstillinger", why: "Personlige ressurser og valg er ditt ansvar", how: "Kun du ser din saldo og dine innstillinger." },
      { what: "Admin: Admin-panel, audit-log, notater", why: "Administrasjon må være beskyttet for rettferdig styring", how: "Kun admin-brukere har tilgang til disse verktøyene." },
    ],
  },
];

export const RulesScreen: React.FC = () => {
  const [openIdx, setOpenIdx] = React.useState<number | null>(0);

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Regler & Poeng"
        subtitle="Hva, hvorfor og hvordan"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="p-4 space-y-3 pb-20">
          {SECTIONS.map((section, sIdx) => {
            const isOpen = openIdx === sIdx;
            const Icon = section.icon;
            return (
              <DavosCard key={sIdx}>
                <button
                  onClick={() => setOpenIdx(isOpen ? null : sIdx)}
                  className="w-full"
                >
                  <DavosCardContent className="p-4 flex items-center gap-3">
                    <Icon size={20} className="text-primary flex-shrink-0" />
                    <span className="font-heading text-sm font-semibold text-foreground flex-1 text-left">
                      {section.title}
                    </span>
                    <ChevronDown
                      size={16}
                      className={cn(
                        "text-muted-foreground transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </DavosCardContent>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {section.rules.map((rule, rIdx) => (
                      <div
                        key={rIdx}
                        className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {rule.what}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">Hvorfor:</span>{" "}
                          {rule.why}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">Hvordan:</span>{" "}
                          {rule.how}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </DavosCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RulesScreen;

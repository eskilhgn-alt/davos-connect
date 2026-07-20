/**
 * AvalancheInfoSheet — Tappable educational explanations for avalanche terms.
 * Everything explained in simple Norwegian for people who know nothing about avalanches.
 */
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- content database ---------- */
export type InfoTopic =
  | "danger_scale"
  | "danger_1" | "danger_2" | "danger_3" | "danger_4" | "danger_5"
  | "new_snow" | "wind_slab" | "persistent_weak_layers" | "wet_snow"
  | "gliding_snow" | "cornices" | "no_distinct_avalanche_problem" | "favourable_situation"
  | "aspects"
  | "elevation"
  | "what_is_avalanche"
  | "safety_tips";

interface InfoEntry {
  title: string;
  emoji: string;
  body: string;
}

const INFO: Record<InfoTopic, InfoEntry> = {
  what_is_avalanche: {
    title: "Hva er et skred?",
    emoji: "🏔️",
    body: "Et snøskred er en masse med snø som løsner og sklir nedover en fjellside. Det kan utløses naturlig (av vind, nedbør eller temperaturendring) eller av mennesker som går eller kjører i bratt terreng.\n\nSkred er svært farlige – selv små skred kan begrave en person. Derfor er det viktig å forstå skredvarselet før man beveger seg utenfor preparerte løyper.",
  },
  danger_scale: {
    title: "Den europeiske fareskalaen",
    emoji: "📊",
    body: "Fareskalaen går fra 1 til 5 og beskriver hvor sannsynlig det er at det går skred:\n\n🟢 1 – Liten: Det er generelt trygge forhold. Skred kan bare utløses i ekstremt bratt terreng.\n\n🟡 2 – Moderat: Forholdene er stort sett gode, men vær forsiktig i bratt terreng med ugunstig eksponering.\n\n🟠 3 – Betydelig: Her begynner det å bli farlig. Skred kan utløses av enkeltpersoner i bratt terreng. Erfaring i skredsikkerhet er nødvendig.\n\n🔴 4 – Stor: Svært farlige forhold. Naturlige skred er sannsynlige. Hold dere unna bratt terreng!\n\n⚫ 5 – Meget stor: Ekstreme forhold med mange store naturlige skred. Hold dere til sikrede områder!",
  },
  danger_1: {
    title: "Faregrad 1 – Liten",
    emoji: "🟢",
    body: "Det er generelt trygge forhold. Skred kan bare utløses i ekstremt bratt, ugunstig terreng (>40°). Du kan ferdes relativt trygt i fjellterreng, men bruk alltid sunn fornuft.\n\n💡 Selv på faregrad 1 bør du ha med skredutstyr (sender/mottaker, spade, søkestang) hvis du går utenfor løypene.",
  },
  danger_2: {
    title: "Faregrad 2 – Moderat",
    emoji: "🟡",
    body: "Forholdene er stort sett OK, men det finnes svake punkter i snødekket. Skred kan utløses av stor tilleggsbelastning (flere personer tett sammen) i bratt, ugunstig terreng.\n\n💡 Unngå de bratteste partiene, spesielt i himmelretninger som er nevnt i varselet. Velg forsiktige ruter.",
  },
  danger_3: {
    title: "Faregrad 3 – Betydelig",
    emoji: "🟠",
    body: "⚠️ NÅ blir det farlig! Skred kan utløses selv av én person i bratt terreng (>30°). Naturlige skred kan forekomme.\n\nDette er den faregraden der de fleste skredulykker skjer, fordi mange undervurderer faren.\n\n💡 Kun erfarne folk med skredsikkerhetskunnskap bør ferdes i bratt terreng. Alle andre bør holde seg til merkede løyper og stier.",
  },
  danger_4: {
    title: "Faregrad 4 – Stor",
    emoji: "🔴",
    body: "🚨 SVÆRT FARLIG! Naturlige skred er sannsynlige, også store. Skred kan utløses svært lett av personer.\n\n💡 Hold dere UNNA alt bratt terreng! Bruk kun preparerte løyper og sikrede stier. Selv flatere terreng nær bratte fjellsider kan være utsatt for utløpssoner.",
  },
  danger_5: {
    title: "Faregrad 5 – Meget stor",
    emoji: "⚫",
    body: "☠️ EKSTREMT FARLIG! Mange store naturlige skred forventes, også i uvanlig terreng. Skred kan nå langt ned i daler.\n\n💡 Hold dere INNE eller kun i bebyggelse/sikrede områder. Veier kan bli stengt. Følg lokale myndigheters instruksjoner!",
  },
  new_snow: {
    title: "Nysnø – skredproblem",
    emoji: "❄️",
    body: "Når det snør mye på kort tid, legger det seg et tungt lag oppå det gamle snødekket. Denne ekstra vekten kan være nok til å utløse skred.\n\n💡 Jo mer nysnø, og jo mer vind under snøfallet, desto farligere er det. Vent gjerne 1-2 dager etter kraftig snøfall før du går i bratt terreng.",
  },
  wind_slab: {
    title: "Fokksnø – skredproblem",
    emoji: "💨",
    body: "Vind transporterer snø og legger den i kompakte «plater» (fokksnøflak) på lesiden av rygger og topper. Disse platene kan være svært ustabile og lett utløses av en person.\n\n💡 Fokksnøflak er ofte vanskelige å se. Se etter vindtegn (skavler, rifler i snøen). Unngå leheng etter perioder med sterk vind.",
  },
  persistent_weak_layers: {
    title: "Vedvarende svake lag",
    emoji: "⚠️",
    body: "Dypt nede i snødekket kan det finnes svake, sukkerlignende krystaller som har dannet seg over tid. Disse lagene kan kollapse som et korthus når de belastes.\n\nDette er det mest lumske skredproblemet fordi:\n• Det kan vare i uker eller måneder\n• Skredene kan bli svært store\n• Det er vanskelig å vurdere stabiliteten\n\n💡 Vær spesielt forsiktig når dette problemet er nevnt. Selv erfarne kan bli overrasket.",
  },
  wet_snow: {
    title: "Våt snø – skredproblem",
    emoji: "💧",
    body: "Når det blir varmt (solskinn, regn, plussgrader), trenger vann ned i snødekket og svekker det. Våtsnøskred er tunge og ødeleggende.\n\n💡 Tidspunktet er viktig! Våtsnøskred er vanligst midt på dagen og ettermiddag. Start tidlig om morgenen når snøen fortsatt er frosset, og vær tilbake før det blir for varmt.",
  },
  gliding_snow: {
    title: "Glidesnø – skredproblem",
    emoji: "🏔️",
    body: "Hele snødekket kan gli sakte nedover på glatte, bratte underlag (gress, glatt fjell). Du kan se «fiskegap» – åpne sprekker i snøen – som tegn på glidesnø.\n\n💡 Unngå å oppholde deg under fiskegap! Glidesnøskred kan utløses når som helst, og er umulige å forutsi nøyaktig.",
  },
  cornices: {
    title: "Skavler",
    emoji: "🗻",
    body: "Skavler er overheng av snø som bygger seg opp på vindsiden av rygger og topper. De kan bli svært store og bryte av uten forvarsel.\n\n💡 Hold god avstand fra kanten av rygger! Skavler kan også utløse skred i henget under når de faller.",
  },
  no_distinct_avalanche_problem: {
    title: "Ingen tydelig skredproblem",
    emoji: "✅",
    body: "Det er ingen dominerende skredproblem akkurat nå. Snødekket er relativt stabilt.\n\n💡 Dette betyr IKKE at det er 100% trygt. Bruk alltid sunn fornuft, og vær spesielt forsiktig i ekstremt bratt terreng.",
  },
  favourable_situation: {
    title: "Gunstig situasjon",
    emoji: "☀️",
    body: "Forholdene er gode! Snødekket er generelt stabilt, og det er liten skredfare.\n\n💡 Nyt turen, men ha alltid med skredutstyr utenfor løypene – værforholdene kan endre seg raskt i fjellet.",
  },
  aspects: {
    title: "Himmelretninger (eksponering)",
    emoji: "🧭",
    body: "Himmelretningen en fjellside vender mot har stor betydning for skredfaren:\n\n• Nordsider (N, NØ, NV): Kald snø som holder seg ustabil lenger. Ofte fokksnø.\n• Sørsider (S, SØ, SV): Sol varmer snøen → våtsnøproblemer, spesielt om våren.\n• Vindsider: Snøen blåser bort.\n• Lesider: Snøen samles og danner farlige fokksnøflak.\n\nNår varselet sier at spesifikke himmelretninger er utsatt, betyr det at bratte fjellsider som vender den veien er ekstra farlige.\n\n💡 De markerte (oransje) retningene i kompassrosen viser hvor du bør være mest forsiktig.",
  },
  elevation: {
    title: "Høydegrenser",
    emoji: "⛰️",
    body: "Skredfaren kan variere med høyde over havet:\n\n• Over en viss høyde: Ofte kaldere, mer vind og nysnø → mer fokksnø og vedvarende svake lag.\n• Under en viss høyde: Ofte varmere → mer våtsnø- og glidesnøproblemer.\n\nTregrensen (rundt tregrensen) er en viktig referanse: Over tregrensen er terrenget mer utsatt for vind og skred.\n\n💡 Sjekk hvilke høydegrenser som gjelder i varselet, og tilpass rutevalget ditt deretter.",
  },
  safety_tips: {
    title: "Sikkerhetstips",
    emoji: "🛡️",
    body: "Grunnleggende skredsikkerhet:\n\n1️⃣ Sjekk skredvarselet FØR du drar ut\n2️⃣ Ha alltid med skredutstyr utenfor løypene: sender/mottaker, spade, søkestang\n3️⃣ Gå aldri alene i skredterreng\n4️⃣ Lær å bruke skredutstyret – øv jevnlig!\n5️⃣ Unngå terreng brattere enn 30° ved faregrad 3+\n6️⃣ Kjør/gå én og én over bratte partier\n7️⃣ Hold avstand mellom hverandre i oppstigninger\n8️⃣ Vurder lokale tegn: fersk snøskredaktivitet, «wumpf»-lyder, skytende sprekker\n9️⃣ Når du er i tvil – snu!\n\n📞 I Frankrike: ring 112 ved akutt fare. I Val Thorens kan skipatruljen nås på +33 4 79 00 01 80.",
  },
};

/* ---------- InfoButton component ---------- */
export const InfoButton: React.FC<{
  topic: InfoTopic;
  size?: number;
  className?: string;
}> = ({ topic, size = 14, className }) => {
  const [open, setOpen] = React.useState(false);
  const entry = INFO[topic];
  if (!entry) return null;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-muted/60 hover:bg-muted transition-colors",
          size <= 14 ? "w-5 h-5" : "w-6 h-6",
          className,
        )}
        aria-label={`Info om ${entry.title}`}
      >
        <Info size={size} className="text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <span className="text-2xl">{entry.emoji}</span>
              {entry.title}
            </SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto max-h-[65vh] pb-safe">
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
              {entry.body}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

/* ---------- Quick info banner ---------- */
export const AvalancheEducationBanner: React.FC = () => {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-4 mt-2 flex items-center gap-2 rounded-xl bg-muted/50 border border-border p-3 text-left"
      >
        <span className="text-lg">📚</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">Ny til skredvarsler?</p>
          <p className="text-[11px] text-muted-foreground">Trykk her for å lære hva alt betyr</p>
        </div>
        <Info size={16} className="text-muted-foreground shrink-0" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
          <SheetHeader className="text-left pb-2">
            <SheetTitle>📚 Forstå skredvarselet</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto max-h-[65vh] pb-safe space-y-3">
            {(["what_is_avalanche", "danger_scale", "aspects", "elevation", "safety_tips"] as InfoTopic[]).map((topic) => {
              const e = INFO[topic];
              return (
                <InfoButton key={topic} topic={topic} size={16} className="hidden" />
              );
            })}
            {(["what_is_avalanche", "danger_scale", "aspects", "elevation", "safety_tips"] as InfoTopic[]).map((topic) => {
              const e = INFO[topic];
              return (
                <TopicRow key={topic} topic={topic} entry={e} />
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

const TopicRow: React.FC<{ topic: InfoTopic; entry: InfoEntry }> = ({ topic, entry }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-xl bg-card border border-border p-3 text-left"
      >
        <span className="text-xl">{entry.emoji}</span>
        <span className="text-sm font-medium text-foreground flex-1">{entry.title}</span>
        <Info size={14} className="text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <span className="text-2xl">{entry.emoji}</span>
              {entry.title}
            </SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto max-h-[65vh] pb-safe">
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
              {entry.body}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

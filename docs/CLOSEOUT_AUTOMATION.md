# Avslutningsoppdrag — frosset automasjonskontrakt

Automasjon: `6a670cc678b48191bc7868930c30c0c4` — «Ferdigstill GüttaHütte».

## Oppdraget

Dette er en **ferdigstillelse**, ikke løpende nyutvikling. Ingen nye funksjoner,
ingen redesign, ingen gjenopplivet legacy. Nye ønsker venter på nytt oppdrag.

Tillatt arbeid:
1. Fullføre det som faktisk er påbegynt.
2. Fjerne bekreftet ubrukt funksjonalitet og kode.
3. Rydde og teste de beholdte hovedflytene.

Shot v2 beholdes og holdes strengt adskilt fra legacy. Historiske brukerdata
bevares alltid.

## Rekkefølge

1. **SYNC-01** — importer og verifiser siste kode fra GitHub før noe annet.
2. **SAVE-01** — «Lagre tur» i turinnstillingene verifisert i faktisk app.
3. **Port 0** — turmodell, authz, isolert SQL-harness.
4. Turbundet dataintegritet.
5. Beholdte basisflyter.
6. Shot v2 (pending).
7. Legacy-opprydding.
8. Mobil-/sluttkontroll.
9. **STOP-01** — selvstopp.

## Budsjett

- Maks **fem** gratis daglige byggekreditter per runde. Respekter månedstaket.
- Ingen kjøp, oppgradering eller auto-top-up. Ikke Plan, Max eller /goal.
- Ingen dobbeltjobber.
- Reserver alltid nok kreditt til commit og verifisering før runden er tom.

## Verifisering per runde

- `bunx vitest run` (hele settet)
- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run build`
- `bash supabase/tests/port0/run.sh` når SQL er berørt
- Preview-kontroll av flyten som ble endret

Ingen påstand om beståtte tester som ikke faktisk er kjørt i samme runde.

## Rapportering

Hver runde avsluttes med: eksakt commit, hvilke kontroller som ble kjørt og
resultatet av dem, presise åpne punkter, og faktisk `cost_credits`.

## Selvstopp

Automasjonen deaktiverer seg selv når `docs/CLOSEOUT_BACKLOG.md` er verifisert
lukket. Når bare manuell godkjenning, fysisk enhetstest eller tilgang gjenstår
etter alt selvstendig arbeid: **pause med konkret restliste**. Det kalles ikke
ferdig.

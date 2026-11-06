# ChatGPT i GüttaHütte – to spor

## Viktig å vite
- ChatGPT Pro-kontoen din dekker bruk inne i ChatGPT. Den betaler ikke for bygging her og ikke for AI inne i appen.
- AI inne i appen bruker OpenAI-modeller via Lovable, uten egen nøkkel. Det trekkes fra arbeidsområdets lille gratis AI-kvote (månedlig). Når den er brukt opp, stopper AI-funksjonen med en tydelig melding. Ingen kjøp.
- Byggeregelen gjelder fortsatt: høyst fem faktisk tilgjengelige gratis kreditter per døgn og én avgrenset Build per steg. Ingen Plan/Max.

## Spor 1 – ChatGPT styrer appen (finnes delvis allerede)
Appen har allerede en ChatGPT-kobling med innlogging. Hver person logger inn med sin egen konto, og samme tilgangsregler gjelder. Den har tre verktøy: min profil, les nylig chat og send chatmelding. Den ble laget før flerturmodellen og må oppdateres.

Steg:
1. Kontroller at de tre verktøyene bare viser og skriver i den aktive turen. De skal respektere arkiv (skrivebeskyttet), godkjent medlemskap og ban.
2. Legg til verktøy som bare leser:
   - aktiv tur (destinasjon, datoer bare hvis de er satt, tidssone, valuta)
   - agenda og tidslinje
   - Stories og Minner fra siste døgn (bare tekst og metadata, ingen filer)
3. Ingen admin-, slette-, push- eller posisjonsverktøy. Crew og posisjoner holdes utenfor.
4. Når appen publiseres neste gang med din godkjenning, legger du til koblingen i ChatGPT under Innstillinger → Apps/Connectors. Adressen får du da.

## Spor 2 – AI-funksjoner inne i appen
Forslag til første funksjon, som er liten og trygg: **«Hva har skjedd?»** i Chat. Den lager et kort norsk sammendrag av meldingene i den aktive turen siden du sist var inne. Den bruker bare data du allerede har tilgang til. Ingen lagring av AI-svar og ingen push.

Mulige senere funksjoner (ikke i denne runden):
- Turassistent som svarer på spørsmål om agenda, vær og praktisk info
- Forslag til dagsplan ut fra været

## Rekkefølge og kostnad
1. Build A (spor 1, steg 1–3) + manifest-kontroll
2. Build B («Hva har skjedd?»)
3. Publisering bare etter egen godkjenning

## Tekniske detaljer
- MCP: `src/lib/mcp` med `defineMcp`, OAuth-issuer finnes allerede. Navnet rettes til `guttahutte` (tittel uendret). Hvert verktøy i egen fil, brukerens eget token og RLS gjelder (ingen service-role). Kjør manifestuttrekk etter endringer. Edge-funksjonen `mcp` deployes bare ved publisering.
- WebMCP: valgfritt, og hoppes over i denne runden for å spare kreditter.
- AI: ny Edge-funksjon `chat-summary` med JWT-validering og trip-medlemskapssjekk i en brukerscopet klient. Lovable AI Gateway Responses (`openai/gpt-6-astra`, reasoning low), strømmet svar. 402/403/429 vises på norsk uten automatisk gjentakelse. `LOVABLE_API_KEY` opprettes hvis den mangler.
- Tester: Vitest for knappetilstander og arkiv (skjult) og for edge-validering. Deretter tsc og build.
- Ingen DB-skjemaendring, ingen push, ingen frontendpublisering uten godkjenning.

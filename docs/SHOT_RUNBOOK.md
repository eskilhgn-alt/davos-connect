# Shot v2 — gjeldende vei

Oppdatert 14. oktober 2026. **Forberedt, ikke aktivert.**

Den samlede sosiale pakken erstatter de UAPPLISERTE augustforslagene
`20260810_shot_draws.sql` og `20260811_shot_background_sweep.sql`.
Disse gamle forslagene og `functions/shot-draw` skal ikke deployes sammen med
ny `functions/social`. De er beholdt som historisk kilde og eksisterende testbevis.
Dagens database har ingen shot_draws/social_events; sjekk dette ferskt før aktivering.

- Ny klient: SocialShotScreen, features/social; fairness-verifikatoren gjenbrukes.
- Ny SQL: `supabase/migrations-pending/20261013221627_social_v2_prepared.sql`.
- Ny Edge: `supabase/functions/social` (SOCIAL_ENABLED må uttrykkelig være true).
- Felles outbox, mottakerkvitteringer, VIBE, Shot og Headshot har samme transaksjonsgrunnlag.
- Den historiske chat-outboxen `notification_dispatches` og dens datarader endres ikke.
- Detaljerte porter og rekkefølge: [SOCIAL_ACTIVATION.md](SOCIAL_ACTIVATION.md).
- Nåværende bevis og begrensninger: [SOCIAL_PREPARATION_20261014.md](SOCIAL_PREPARATION_20261014.md).

Ingen klient kan velge vinner eller fullføre trekningen. Ti sekunder kommer fra
server; Edge-fastvei og ettsekunds databasejobb er planlagt, men faktisk deployet
tidsgaranti er ikke bevist lokalt. Headshot er målrettet og er ikke med i 1/N-auditen.
Ved feil deaktiveres sosial Edge og de to nye jobbene; behold alle hendelser,
rettigheter, kvitteringer og outboxrader. Ikke åpne legacy som fallback.

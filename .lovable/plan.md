

## Plan: Fyll på tokens og send push til alle

### Status nå
- **Token-balanse per bruker:**
  - Eskil: 0, Andygator: 5, Dawgen: 7, MGZ: 6, Jonaldo: 8, Fiffen: 13, Larsi: 19, OddvarB: 21, Haabru: 24
- **Push-tokens:** Alle 9 brukere har registrerte push-tokens. Alle kan motta push.

### Steg

1. **Fyll på tokens** – Sett alle brukere til minimum 10 tokens (eller et annet tall du ønsker). De som allerede har mer beholder sitt. Oppdatering via `shot_tokens`-tabellen + `token_ledger`-oppføring for sporbarhet.

2. **Send push til alle** – Bruk `shot-push` Edge Function til å sende en push-melding til alle brukere om at tokens er fylt på.

### Detaljer
- Eskil (0), Andygator (5), Dawgen (7), MGZ (6), Jonaldo (8) vil bli fylt opp til 10
- Fiffen (13), Larsi (19), OddvarB (21), Haabru (24) beholder sine nåværende verdier
- Push-melding: f.eks. "🎰 Tokens påfylt! Alle har nå minst 10 tokens"

Vil du at alle skal settes til et bestemt tall (f.eks. 10, 15, 20), eller at alle får et fast tillegg (f.eks. +10)?


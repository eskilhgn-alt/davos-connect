# Native sosialtest — 24.10.2026

Forberedelseskode: bcb8439598262b7527900decda72b4b916721791.
Verifisert CI-commit: 83ee2b81bfa35e917321c61c71c9503f4f14f8d2.
Kjøring: https://github.com/eskilhgn-alt/davos-connect/actions/runs/40136558495
Jobb: 120999203983. Resultat success, slutt 21:59:30 UTC / 23:59:30 Europe/Oslo.

PostgreSQL 17.11, Node 22.23.3, vanlig runner-bruker UID 1001.
49/49 kontroller: de 44 tidligere SQL-kontrollene og fem reelle samtidighetsscenarier:
- Åtte samtidige starter med samme nøkkel gir én trekning.
- To finaliserere gir ett resultat og én vinner.
- Konkurrerende outbox-workers deler ikke samme leveranse.
- To starter konkurrerer om femte dagsplass; kun én lykkes.
- To økter kan ikke forbruke samme Headshot to ganger.

Første to CI-kjøringer stoppet før SQL fordi maskinen manglet PostgreSQL 17.
Arbeidsflyten installerer nå PostgreSQL 17 fra PostgreSQLs pakkearkiv hvis nødvendig.
Den kjører bare på egen testgren, har contents:read, ingen produksjonshemmeligheter,
ingen deploy og ingen produksjons-URL. Testdatabasen er en midlertidig lokal
Unix-socket-database som fjernes etter kjøring. Ingen cache/artifact-upload.
Standard GitHub-runner i offentlig repo; 0 Lovable-kreditter.

Dette beviser ikke deployet Edge, ekte JWT-integrasjon, faktisk serverlatens,
pushmottak, to enheter eller iPhone/PWA. Aktiv Lovable/main er uendret 4638474.
Sosialpakken er fortsatt forberedt, ikke aktiv. Følg SOCIAL_ACTIVATION.md videre.

To gårsdags-fixtures er rettet fra current_date til eksplisitt Europe/Paris.
Ny kjøring etter rettingen: https://github.com/eskilhgn-alt/davos-connect/actions/runs/40136672887
Testet commit b4a0f04b267b575330422631f6ccb7fed6dba05d, jobb 120999537074: success.
App-/SQL-funksjonalitet er uendret; bare testdatoer og CI/dokumentasjon endret.

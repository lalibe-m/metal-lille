# Agenda Metal Lille

Web app mobile qui liste les concerts metal et hard rock à venir dans les salles de la métropole lilloise (plus le Métaphone à Oignies). Elle s'installe sur l'écran d'accueil et marche hors ligne avec les dernières données chargées.

## Mise à jour

Le workflow `.github/workflows/update.yml` tourne chaque nuit (04:17 UTC), à chaque push sur `main`, et à la main depuis l'onglet Actions (« Run workflow »). Il relit les agendas, écrit `docs/concerts.json` s'il a changé, puis publie `docs/` sur GitHub Pages.

Sources :

| Source | Rôle |
| --- | --- |
| lille.concerts-metal.com | Source principale : concerts metal de la région avec le genre de chaque groupe, filtrés sur la métropole |
| The Black Lab (API WordPress) | Heure, prix, billetterie |
| L'Aéronef, Le Grand Mix | Heure, billetterie, complet ; Le Grand Mix ajoute aussi ses concerts étiquetés « metal » |
| La Cave aux Poètes | Billetterie ; ajoute ses concerts dont le genre est metal |
| Le Métaphone (9-9bis) | Heure, billetterie ; ajoute ses concerts metal |

Quand une source échoue, ses concerts déjà connus restent affichés, l'app le signale en pied de page et le workflow affiche un avertissement. Le workflow échoue seulement si toutes les sources échouent.

## Corrections à la main

`data/overrides.json` :

- `add` : concerts qu'aucune source ne publie. Ils disparaissent d'eux-mêmes une fois la date passée. Une source qui publie le même concert vient compléter heure, prix et billetterie.
- `exclude` : expressions régulières testées sur le nom du groupe principal (en minuscules, sans accents).
- `includeTitles` : par source (`black-lab`, `aeronef`…), expressions régulières de titres à inclure même sans genre metal.
- `patch` : champs à forcer, par identifiant de concert (celui de `docs/concerts.json`).

## En local

```bash
npm install
npm run update   # relit les sources et écrit docs/concerts.json
npm run serve    # sert l'app sur http://localhost:8080
```

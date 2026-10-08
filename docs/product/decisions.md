# Décisions — Nettio

> Issues de la discussion du 2026-10-08 entre l'auteur et son agent. Nettio est **repris de zéro**
> (« On va reprendre nettio complètement de zéro ») : aucune règle, aucun écran, aucune charte de
> la version de juillet 2026 n'est une source. Ce fichier, `model.md`, `fonctionnalites.md`,
> `experience.md`, `strategie.md`, `voix.md`, `referentiels.md` et `exploitation.md` sont la vérité
> du produit ; le reste du dépôt est écrit en anglais.

## La douleur

> **Le patron d'un pressing ne sait pas s'il gagne réellement de l'argent.**

Dit par l'auteur, qui parle d'un pilote réel : « ils se basent sur les prix forfaitaires, or ça
peut être différent en fonction de ce qui est utilisé et du travail fait — à moins que ce soit une
stratégie initiale ». Un forfait de douze pièces coûte autre chose selon qu'il contient douze
chemises ou six costumes ; le cahier ne le dit jamais.

## La seule chose à livrer

Que le patron lise, chaque soir et chaque mois, **ce qu'il gagne et sur quoi** — avec des chiffres
qu'il peut vérifier dans sa caisse.

Cela exige trois saisies, et seulement trois :

1. **tout l'argent** : chaque encaissement, chaque dépense, chaque charge, et ce qu'il prend pour
   lui ;
2. **le contenu réel de chaque dépôt**, même sous forfait : combien de pièces, de quel type, quel
   service ;
3. **une fiche de coût** par type de pièce et par service, établie avec lui.

Tout le reste du produit sert à rendre ces trois saisies supportables (la voix, la photo, la
messagerie) ou en découle (l'atelier, les clients, les agences).

## Pour qui

- **Celui qui paie** : le propriétaire du pressing. Il achète « je sais si je gagne ».
- **Ceux qui s'en servent** : réception, caisse, atelier, livreur, gérant, comptable — et les
  clients du pressing, qui n'installent rien et reçoivent tout sur WhatsApp ou Telegram.
- **Trois tailles, un seul modèle** : le pressing qui démarre (souvent une personne seule), le
  pressing installé, la chaîne à plusieurs points. L'Europe n'est pas dans la promesse (TVA, caisse
  certifiée, carte) ; le modèle ne la ferme pas.

## Un outil complet, vendu seul

Nettio est une app métier commercialisée seule : abonnement par le Compte Kete, sans Kete
Enterprise. La frontière du produit complet est `fonctionnalites.md`, rôle par rôle.

## Ce que le pressing règle lui-même

« Permets qu'un pressing puisse configurer ce qu'il faut et avoir des schémas graphiques qui
montrent le flux. » Six réglages portent la flexibilité, et chacun se lit sur un schéma :

1. **Le profil** : je démarre, pressing installé, plusieurs points ; seul ou en équipe.
2. **Les points** : comptoir, centre de traitement, ou les deux.
3. **Les services et leur parcours** : chaque service a ses étapes d'atelier, dans son ordre.
4. **Les prix** : à la pièce, au kilo, forfait, grille par client.
5. **Le grain du suivi** : au sac ou à la pièce.
6. **Les rôles et leurs droits** : cochés par le patron, sans redéploiement.

## Canaux

Toujours WhatsApp **et** Telegram, derrière un même port ; le SMS et l'impression en secours. Le
client du pressing parle à son pressing, pas à Nettio.

## L'intelligence

- La voix et la photo en entrée ; « Demander » sur chaque écran et par messagerie ; le relevé du
  soir. Nettio s'ouvre aux copilotes (MCP et ses vues) avec les droits de la personne.
- **Les chiffres sont calculés par le code, jamais par le modèle.** Le modèle entend, lit et
  formule.
- On ne vend pas « de l'IA » au gérant ; il achète sa réponse.
- Un agent n'encaisse, n'annule et ne remet jamais seul : il prépare, une personne valide.

## Jamais

- Fixer ou conseiller un prix à la place du patron. Nettio montre ce que coûte un choix ; un forfait
  vendu à perte peut être une stratégie.
- Écrire aux clients du pressing sans que le pressing l'ait décidé.
- Utiliser les chiffres d'un pressing ailleurs : ni moyenne, ni comparaison, ni revente.
- Inventer une preuve : aucun témoignage, aucun chiffre d'usage tant qu'il n'existe pas.

## Indicateur d'usage

- 90 % des dépôts d'une semaine passent par Nettio ;
- le patron lit son relevé du soir sans appeler ;
- il prend une décision à partir d'un chiffre (garder, changer ou arrêter un forfait, en le
  sachant).

## Ce qui n'est pas encore su

- **Aucune parole du gérant pilote n'est consignée.** La question bloquante du canevas reste
  ouverte : « l'usager a-t-il déjà écrit ce qu'il veut ? »
- **La preuve de la phase 0 n'est pas faite** : la marge de chaque forfait du pilote, calculée à la
  main sur un mois de son cahier et de ses factures. S'il est surpris, la douleur est confirmée ;
  s'il hausse les épaules, ce n'est pas la sienne.
- Les fiches de coût réelles (peser la lessive, chronométrer un repassage) : seules celles du
  pilote valent.
- Si le patron accepte de saisir ses charges et ses retraits personnels.
- La fidélité de lecture d'un vocal dans un comptoir bruyant.
- Le prix de Nettio.

## Décisions techniques (tranchées par la doctrine Kete)

- App Kete en TypeScript sur le gabarit `kete-core` (D-016, D-034) ; Compte Kete pour l'identité et
  l'abonnement ; Kete Cockpit pour les évènements ; Postgres (Neon), une base par app, RLS par
  organisation dans la migration créatrice.
- **Design** : `@kete/design` tel qu'il existe, design `kete`. Pas de charte propre.
- **Schémas de flux** : `@xyflow/react`, habillé des jetons de `@kete/design`
  (`docs/decisions/0002`).
- Les paquets `@kete/*` se prennent à leurs versions publiées. Ce que le châssis n'a pas encore
  (adaptateurs WhatsApp et Telegram, hors-ligne, assistant dans l'app) est écrit dans Nettio derrière
  les ports du châssis, puis remonté à `kete-core` par une issue.

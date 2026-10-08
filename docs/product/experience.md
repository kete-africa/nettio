# Expérience — qui voit quoi, et comment

> Le design est `@kete/design`, design `kete`, tel qu'il existe : `Shell`, `NavSection`, `NavItem`,
> `TabBar`, `PageHeader`, `KpiGrid`, `DataTable`, `RowList`, `Drawer`, `FormPage`, `Tag`,
> `EmptyState`. Nettio n'a ni charte ni composant de base à lui ; ce qu'il ajoute (la saisie d'un
> dépôt, le schéma du pressing) n'emploie que les jetons sémantiques.

## Les personnes

| Persona | Appareil | Sa question | Son écran d'accueil |
|---|---|---|---|
| **Afi, patronne** | téléphone le soir, ordinateur le dimanche | « Est-ce que je gagne ? » | Aujourd'hui, puis Argent |
| **Kossi, gérant** | téléphone au comptoir | « Qu'est-ce qui coince ? » | Aujourd'hui |
| **Mawuli, réception** | téléphone ou tablette partagée | « Je sers vite, sans erreur » | Nouveau dépôt |
| **Essi, caisse** | tablette | « Ma caisse tombe juste » | Caisse |
| **Yao, atelier** | téléphone posé près de la table | « Quoi maintenant ? » | Atelier |
| **Koffi, livreur** | téléphone, d'une main | « Ma prochaine course » | Tournée (phase 5) |
| **Mme Lawson, comptable** | ordinateur | « Des chiffres propres » | Argent, en lecture |
| **Le client** | sa messagerie | « C'est prêt ? » | Aucun écran : WhatsApp ou Telegram |
| **Ama, seule dans son pressing** | téléphone | tout à la fois | Aujourd'hui, tout sur un écran |

## La navigation

Une seule barre, filtrée par les droits : on ne voit jamais une entrée qu'on ne peut pas ouvrir.

```
Comptoir     Aujourd'hui · Nouveau dépôt · Dépôts · Clients
Atelier      File de l'atelier
Argent       Caisse · Dépenses · Résultat · Coûts et marges
Pressing     Schéma · Catalogue · Points · Équipe et droits · Messages · Réglages
             Journal
```

Sur téléphone, la barre d'onglets : **Aujourd'hui · Dépôts · ＋ (nouveau dépôt, surélevé) ·
Atelier ou Caisse · Plus**. L'onglet du milieu est le geste du métier.

## Les règles d'écran

1. **Un écran, une question.** « Aujourd'hui » répond à « où en est ma journée » ; le résultat du
   mois est ailleurs.
2. **Trois touches pour un dépôt courant** : le numéro du client, les pièces, « Encaisser ».
3. **Le pouce** : les gestes fréquents en bas, à 48 px au moins ; le texte en `body`, jamais plus
   petit pour un montant.
4. **Un chiffre n'est jamais seul** : son unité, sa période, et « comment c'est calculé » à portée.
5. **Rien n'est caché derrière une couleur** : chaque état a son mot (`Tag`).
6. **L'erreur dit trois choses** : ce qui s'est passé, pourquoi, quoi faire.
7. **Le vide est une invitation** : chaque liste vide dit le geste qui la remplit.
8. **Ce qu'un agent a préparé se voit** (`AgentState`, `VerificationCard`) et attend une personne.

## Les écrans de référence

### Aujourd'hui (téléphone)

```
┌──────────────────────────────┐
│ Aujourd'hui      jeu. 8 oct. │
│ Point : Agoè (A)           ▾ │
├──────────────────────────────┤
│ ENCAISSÉ        DÉPÔTS       │
│ 48 500 F CFA    14           │
│ PRÊTS           DEHORS       │
│ 9 à retirer     63 000 F CFA │
├──────────────────────────────┤
│ À FAIRE                      │
│ ▪ 3 dépôts promis aujourd'hui│
│   pas encore prêts         › │
│ ▪ 2 prêts dorment depuis     │
│   plus de 30 jours         › │
│ ▪ Caisse ouverte, non comptée│
├──────────────────────────────┤
│ DERNIERS DÉPÔTS              │
│ A-0412 Mme Adjovi   5 400    │
│        reçu · solde 2 400  › │
│ A-0411 M. Kpodar    3 000    │
│        prêt · payé         › │
├──────────────────────────────┤
│  ⌂     ☰     (＋)    ▤    ⋯  │
│ Jour  Dépôts        Caisse   │
└──────────────────────────────┘
```

### Nouveau dépôt (téléphone)

```
┌──────────────────────────────┐
│ ‹ Nouveau dépôt        A-0413│
├──────────────────────────────┤
│ CLIENT                       │
│ [ 90 12 34 56            ]   │
│ Mme Adjovi · 7e dépôt        │
├──────────────────────────────┤
│ SERVICE  [Lavage et repass.▾]│
│ ┌────────┐┌────────┐┌───────┐│
│ │Chemise ││Pantalon││Veste  ││
│ │  500   ││  600   ││ 1 500 ││
│ │ − 4 ＋ ││ − 2 ＋ ││ − 0 ＋││
│ └────────┘└────────┘└───────┘│
├──────────────────────────────┤
│ FORFAIT  [Business 12 pièces]│
│ 6 pièces couvertes sur 12    │
│ EXPRESS  ○   REMISE  [    ]  │
├──────────────────────────────┤
│ Total              5 400     │
│ Prêt le   sam. 10 oct. 17 h  │
│ ⚠ Sous le coût variable      │
│   (5 710) — le patron le sait│
├──────────────────────────────┤
│ [ Enregistrer ] [ Encaisser ]│
└──────────────────────────────┘
```

### Résultat (ordinateur)

```
┌──────────┬───────────────────────────────────────────────────────────────────┐
│ nettio   │ Résultat · octobre 2026                        [‹ sept.] [nov. ›] │
│          ├───────────────────────────────────────────────────────────────────┤
│ COMPTOIR │ ENCAISSÉ        DÉPENSES        RÉSULTAT        VOUS AVEZ PRIS    │
│ Aujourd. │ 1 103 000       848 500         254 500         70 000            │
│ Dépôts   │ F CFA           dont fixes      23 % de         reste 184 500     │
│ Clients  │                 512 000         l'encaissé                        │
│          ├───────────────────────────────────────────────────────────────────┤
│ ATELIER  │ POINT MORT  1 890 pièces ce mois · 73 par jour · vous en êtes à   │
│ File     │             2 240 : le mois est couvert depuis le 24.             │
│          ├───────────────────────────────────────────────────────────────────┤
│ ARGENT   │ FORFAITS            Vendus  Prix    Coût moyen  Marge    Mesuré   │
│ Caisse   │ Business 12 pièces  38      6 000   5 710       + 290    oui      │
│ Dépenses │ Famille 10 kg       21      5 000   5 400       − 400    en partie│
│ Résultat │ Étudiant 8 pièces   12      3 000   —           jamais mesuré     │
│ Coûts    ├───────────────────────────────────────────────────────────────────┤
│          │ Comment c'est calculé : encaissé = paiements − remboursements ;   │
│ PRESSING │ les charges fixes sont réparties au prorata des minutes de travail│
│ Schéma   │                                                                   │
└──────────┴───────────────────────────────────────────────────────────────────┘
```

### Le schéma du pressing

```
 POINTS                         PARCOURS DES SERVICES
 ┌──────────────┐               Lavage et repassage
 │ Agoè (A)     │─ dépôts ─┐    [Tri]→[Lavage]→[Séchage]→[Repassage]→[Contrôle]→[Rangement]
 │ comptoir     │          ▼    Repassage seul
 └──────────────┘   ┌────────────┐          [Repassage]→[Contrôle]→[Rangement]
 ┌──────────────┐   │ Centre (C) │ Linge au kilo
 │ Bè (B)       │──▶│ atelier    │ [Tri]→[Lavage]→[Séchage]→[Emballage]→[Rangement]
 │ comptoir     │   └────────────┘
 └──────────────┘         │         LE DÉPÔT
                          ▼         (Reçu)→(En cours)→(Prêt)→(Retiré)
                    retour au comptoir        └→(Annulé)
```

Le schéma se dessine à partir des réglages (`@xyflow/react`) : toucher une étape, un service ou un
point ouvre son réglage ; chaque changement le redessine.

## Le client du pressing

Il ne voit jamais Nettio. Sa surface est sa messagerie :

```
Pressing Afi — Agoè
Bonjour Mme Adjovi. Dépôt A-0412 reçu : 4 chemises, 2 pantalons
(forfait Business). Total 5 400 F CFA, payé 3 000, reste 2 400.
Prêt samedi 10 octobre à 17 h.
```

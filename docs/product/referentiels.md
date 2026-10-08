# Référentiels — les mots et les valeurs de départ

> Les mots du métier tels que les écrans les disent, les noms du code, et ce que Nettio propose au
> démarrage. Tout est modifiable par le pressing ; rien n'est codé pour un nom.

## Vocabulaire

| À l'écran | Dans le code | Sens |
|---|---|---|
| Dépôt, commande | `order` | Ce qu'un client confie en une fois |
| Pièce | `order_item` (ligne), `article` (type) | Un vêtement ou un linge |
| Service | `service` | Ce qu'on fait à la pièce |
| Parcours | `service_steps` | Les étapes d'atelier d'un service, dans l'ordre |
| Étape | `step` | Un poste de l'atelier |
| Forfait, pack | `pack` | Un prix fixe pour un quota de pièces ou de kilos |
| Point | `site` | Un comptoir, un centre de traitement |
| Acompte, solde | `payment.kind` : `deposit`, `balance` | |
| Caisse du jour | `cash_session` | |
| Dépense, charge | `expense` | Tout ce qui sort |
| Ce que le patron prend | `owner_draw` | |
| Fiche de coût | `cost_sheet` | |
| Dehors | soldes dus | L'argent que les clients doivent |
| Dorment | prêts non retirés | |

## Les étapes de départ (`steps`)

Tri · Détachage · Lavage · Séchage · Repassage · Contrôle · Emballage · Rangement.

## Les services de départ, avec leur parcours

| Service | Nature | Prix | Parcours |
|---|---|---|---|
| Lavage et repassage | atelier | à la pièce | Tri → Lavage → Séchage → Repassage → Contrôle → Rangement |
| Repassage seul | atelier | à la pièce | Repassage → Contrôle → Rangement |
| Nettoyage à sec | atelier | à la pièce | Tri → Détachage → Lavage → Repassage → Contrôle → Rangement |
| Linge au kilo | atelier | au kilo | Tri → Lavage → Séchage → Emballage → Rangement |

## Les pièces de départ (`articles`)

Chemise · Pantalon · Veste · Costume · Robe · Jupe · Pagne · Boubou · Drap · Couette · Rideau ·
Nappe.

Aucun prix n'est proposé : le pressing saisit les siens (ou les photographie). Nettio ne suggère
jamais un tarif.

## Les profils de démarrage

| Profil | Ce que Nettio prépare |
|---|---|
| **Je démarre** | Un point « comptoir et atelier », mode seul proposé, les quatre services, le point mort mis en avant |
| **Pressing installé** | Un point « comptoir et atelier », mode équipe, les quatre services |
| **Plusieurs points** | Un centre de traitement et un comptoir rattaché, mode équipe, les quatre services |

## Les rôles et leurs droits de départ

| Permission | Patron | Gérant | Réception | Caisse | Atelier | Livreur | Comptable |
|---|---|---|---|---|---|---|---|
| `business:read` — voir le pressing (points, catalogue, schéma) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `settings:manage` — régler le pressing | ✓ | | | | | | |
| `catalog:manage` — catalogue, prix, forfaits | ✓ | ✓ | | | | | |
| `staff:manage` — équipe et droits | ✓ | | | | | | |
| `customers:read` | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| `customers:write` | ✓ | ✓ | ✓ | ✓ | | | |
| `orders:read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `orders:create` | ✓ | ✓ | ✓ | | | | |
| `orders:cancel` | ✓ | ✓ | | | | | |
| `orders:discount` — remise au-delà du plafond | ✓ | ✓ | | | | | |
| `orders:release_unpaid` — remettre sans solde payé | ✓ | ✓ | | | | | |
| `payments:collect` — encaisser, remettre | ✓ | ✓ | | ✓ | | ✓ | |
| `payments:refund` | ✓ | ✓ | | | | | |
| `cash:operate` — tenir sa caisse | ✓ | ✓ | | ✓ | | | |
| `workshop:operate` — avancer, signaler | ✓ | ✓ | | | ✓ | | |
| `expenses:write` — dépenses et charges | ✓ | ✓ | | ✓ | | | |
| `money:read` — résultat, marges, coûts | ✓ | | | | | | ✓ |
| `costs:manage` — fiches de coût | ✓ | | | | | | |
| `journal:read` — journal des gestes | ✓ | ✓ | | | | | ✓ |

Le patron garde toujours tous les droits. Pour les autres rôles, il coche et décoche ; une
permission qu'il n'a jamais touchée garde sa valeur de départ.

Plafond de remise sans valideur : 10 % du total pour la réception et la caisse.

## Les moyens de paiement

`cash` espèces · `mobile_money` Mobile Money · `card` carte · `transfer` virement.

## Les catégories de dépenses

| Catégorie | Comportement proposé |
|---|---|
| Loyer | fixe |
| Salaires | fixe (variable si l'atelier est payé à la pièce) |
| Électricité | variable |
| Eau | variable |
| Lessive et produits | variable |
| Emballages (cintres, housses) | variable |
| Entretien et réparations | fixe |
| Usure des machines | fixe |
| Transport | variable |
| Téléphone et internet | fixe |
| Impôts et taxes | fixe |
| Autre | à choisir |

## Les formats

Ceux de la doctrine Kete : `1 103 000 F CFA` (espace des milliers, « F CFA » après le montant,
aucune décimale) ; `30 %` ; `7 août 2026` dans une phrase, `07.08.2026` sur un reçu ; heure de
Lomé.

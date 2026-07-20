# AbiGigs — v4 : le prestataire paie pour publier (paiement manuel Mobile Money)

## Le principe

C'est maintenant le **prestataire** (celui qui propose le service) qui paie pour
que son annonce soit visible — pas le client.

1. Le prestataire remplit le formulaire "Proposer un service"
2. L'annonce est créée mais **invisible** (statut `pending_payment`)
3. L'appli lui affiche ton numéro Mobile Money et le montant à payer
4. Il paie directement sur ton compte, reçoit un SMS avec un code de transaction,
   et le colle dans le formulaire
5. Toi, depuis le dashboard admin (onglet "Demandes de publication"), tu vérifies
   toi-même dans ton appli Mobile Money ou tes SMS que l'argent est bien arrivé,
   puis tu cliques "Confirmer"
6. L'annonce passe automatiquement en `published` — **elle est alors visible
   gratuitement par tous les clients, contact inclus**

Le client ne paie jamais rien : il consulte les annonces et contacte directement
via WhatsApp, en un clic.

⚠️ Comme il n'y a pas de vérification automatique, ne confirme une demande que
si tu as vraiment vu l'argent arriver, pour éviter qu'un faux code de transaction
publie une annonce gratuitement.

## Dashboard admin — ce que tu peux gérer

- **Vue d'ensemble** : revenu total, publications payées, annonces en attente de paiement
- **Annonces** : publier / rejeter / mettre en vedette / supprimer (à la main, en plus du flux de paiement)
- **Demandes de publication** : chaque demande avec le code de transaction fourni, confirmer ou rejeter
- **Paramètres** : ton numéro Mobile Money, l'opérateur, et le prix de publication d'une annonce

## Installation

```
npm install
npm start
```

Il faut **Node.js 22 ou plus récent** (module `node:sqlite` intégré, aucune
compilation native). L'avertissement `SQLite is an experimental feature` au
démarrage est normal, sans impact.

Le serveur sert automatiquement :
- `http://localhost:3000/` → le site public
- `http://localhost:3000/admin.html` → ton dashboard admin

**Structure de dossier attendue :**
```
ton-dossier/
├── server.js
├── db.js
├── package.json
├── .env
└── public/
    ├── index.html
    └── admin.html
```

## Avant de déployer publiquement

- Change `ADMIN_PASSWORD` et `JWT_SECRET` dans ton `.env`
- Configure ton vrai numéro Mobile Money dans l'onglet Paramètres du dashboard
- Déploie sur Render.com ou Railway.app (voir le guide de déploiement séparé)

## Limites connues
- Vérification manuelle → demande ta discipline (vérifier régulièrement l'onglet
  "Demandes de publication")
- Un prestataire malhonnête pourrait entrer un faux code — vérifie toujours la
  réception réelle de l'argent avant de confirmer
- Un seul compte admin, pas de pagination si le volume grossit
- Plus tard, si tu obtiens un compte marchand (CinetPay, PayDunya...), on pourra
  automatiser cette vérification

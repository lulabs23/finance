# Finances — Gestion personnelle

Application web de gestion financière personnelle : transactions multi-catégories, import OCR de relevés bancaires, vue calendrier, analyses, génération de notes de frais.

## Mise en route locale

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:5173

## Build de production

```bash
npm run build
npm run preview
```

Les fichiers prêts à déployer sont dans `dist/`.

## Déploiement sur GitHub Pages

1. Modifie `vite.config.js` : remplace `'/finances/'` par `/<nom-de-ton-repo>/`
2. Pousse ton code sur GitHub
3. Dans Settings → Pages, choisis `Deploy from a branch` → branche `gh-pages`
4. Lance le déploiement :

```bash
npm run deploy
```

L'app sera accessible à `https://<ton-pseudo>.github.io/<nom-du-repo>/`

## Stack

- **Vite** + **React 18**
- **Tailwind CSS** pour le style
- **Recharts** pour les graphiques
- **Lucide React** pour les icônes
- **pdf.js** + **Tesseract.js** chargés via CDN pour l'OCR

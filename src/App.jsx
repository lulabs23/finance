import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Calendar as CalendarIcon, Upload, Download,
  Plus, Trash2, Edit2, X, Check, ChevronLeft, ChevronRight, FileText, Image as ImageIcon,
  Tags, RefreshCw, Receipt, AlertCircle, Search, Home, BarChart3, Clock, FolderOpen,
  CheckCircle2, Circle, Settings, Eye, EyeOff, Building2, User as UserIcon, Pencil, Cloud, Paperclip,
  Briefcase
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// Icônes dessinées localement (indépendantes de la version de lucide-react)
const Svg = ({ size = 24, strokeWidth = 2, className, style, children }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    className={className} style={style} aria-hidden="true">{children}</svg>
);
const ChevronDown = (p) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
const ArrowLeftRight = (p) => <Svg {...p}><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></Svg>;
const SlidersHorizontal = (p) => (
  <Svg {...p}>
    <line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" />
    <line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" />
    <line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" />
    <line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" />
  </Svg>
);

// Affiche l'erreur au lieu d'un écran blanc
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#1c1917' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Erreur d'affichage</h1>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: '#f5f5f4', padding: 12, borderRadius: 6 }}>
          {String((e && (e.stack || e.message)) || e)}
        </pre>
        <button onClick={() => window.location.reload()}
          style={{ marginTop: 12, padding: '8px 14px', border: '1px solid #d6d3d1', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
          Recharger
        </button>
      </div>
    );
  }
}

// ============================================================
// UTILITAIRES
// ============================================================

const uuid = () => 'tx_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

const formatEUR = (n) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v);
};

// Montant compact pour les petites zones (calendrier) : « 12 € », « 12,50 € »
// (sans le symbole si withSymbol = false, pour les lignes serrées de la grille)
const formatMontantCourt = (n, withSymbol = true) => {
  const v = Math.abs(Number(n) || 0);
  const hasCents = Math.round(v * 100) % 100 !== 0;
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(v) + (withSymbol ? ' €' : '');
};

const formatDateFR = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateShort = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

const toISODate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const startOfWeek = (d) => {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1; // Lundi = début de semaine
  x.setDate(x.getDate() - diff);
  return x;
};

const startOfMonth = (d) => {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const addMonths = (d, n) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

// ============================================================
// GIST API — Synchronisation cloud
// ============================================================

const GIST_FILENAME = 'finances-data.json';
const GIST_DESCRIPTION = 'Finances perso — synchronisation';

const gistApi = {
  // Vérifie un token (scope gist) et renvoie le user
  async checkToken(token) {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) throw new Error('Token invalide ou expiré');
    return res.json();
  },

  // Crée un nouveau gist privé contenant le payload
  async create(token, payload) {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
        },
      }),
    });
    if (!res.ok) throw new Error('Création du gist échouée');
    return res.json();
  },

  // Lit le contenu d'un gist
  async read(token, gistId) {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (res.status === 404) throw new Error('Gist introuvable');
    if (!res.ok) throw new Error('Lecture du gist échouée');
    const data = await res.json();
    const file = data.files?.[GIST_FILENAME];
    if (!file) throw new Error(`Fichier "${GIST_FILENAME}" absent du gist`);
    return {
      content: JSON.parse(file.content),
      updatedAt: data.updated_at,
    };
  },

  // Met à jour un gist existant
  async update(token, gistId, payload) {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
        },
      }),
    });
    if (!res.ok) throw new Error('Sauvegarde sur gist échouée');
    return res.json();
  },

  // Cherche les gists existants de l'utilisateur qui correspondent à notre format
  async findExisting(token) {
    const res = await fetch('https://api.github.com/gists?per_page=100', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) return [];
    const list = await res.json();
    return list.filter(g => g.files?.[GIST_FILENAME] && g.description === GIST_DESCRIPTION);
  },
};

// ============================================================
// Catégories par défaut
// ============================================================

const DEFAULT_CATEGORIES = [
  { id: 'cat_alim', name: 'Alimentation', color: '#84a98c' },
  { id: 'cat_courses', name: 'Courses', color: '#a3b18a' },
  { id: 'cat_consommation', name: 'Consommation', color: '#b08968' },
  { id: 'cat_trans', name: 'Transport', color: '#cad2c5' },
  { id: 'cat_loisir', name: 'Loisirs', color: '#a98467' },
  { id: 'cat_soin', name: 'Soin', color: '#d8a48f' },
  { id: 'cat_mode', name: 'Mode', color: '#bb8588' },
  { id: 'cat_travail', name: 'Travail', color: '#52796f' },
  { id: 'cat_productivite', name: 'Productivité', color: '#6d597a' },
  { id: 'cat_abo', name: 'Abonnements', color: '#e07a5f' },
  { id: 'cat_autre', name: 'Autres', color: '#9c9c9c' },
  { id: 'cat_revenu', name: 'Revenu', color: '#3d5a80' },
  { id: 'cat_affaires', name: 'Affaires', color: '#b5935a' },
  { id: 'cat_participation', name: 'Participation', color: '#6d597a' },
];

// Helper : récupère un tableau de categorieIds depuis une transaction,
// avec fallback rétro-compatible sur l'ancien champ categorieId.
const getCatIds = (tx) => {
  if (Array.isArray(tx.categorieIds) && tx.categorieIds.length > 0) return tx.categorieIds;
  if (tx.categorieId) return [tx.categorieId];
  return [];
};

const primaryCatId = (tx) => getCatIds(tx)[0] || null;

// Indique si un revenu est considéré comme déjà reçu sur le compte.
// Rétro-compatibilité : si le champ est absent, on considère le revenu comme reçu
// (comportement historique avant l'introduction du champ).
const isRevenuRecu = (tx) => tx.type !== 'revenu' || tx.recu !== false;

// Registres séparés. Le modèle de données ne change pas (compatibilité avec les
// sauvegardes et le gist existants) :
//   - frais de société   = dépense remboursable de type « societe » (type par défaut historique)
//   - avance à un proche = dépense remboursable de type « proximite »
// Les frais de société ne sont affichés QUE dans la rubrique « Société ».
const isSociete = (tx) => !!tx.remboursable && tx.remboursableType !== 'proximite';
const isProximite = (tx) => !!tx.remboursable && tx.remboursableType === 'proximite';

// Affaires (achat-revente) : toute transaction de la catégorie « Affaires ».
// La rubrique « Affaires » en est une vue dédiée : projet facultatif (`affaire`),
// acheteur d'une vente (`acheteur`), argent arrivé ou non (`recu`).
const isAffaireCat = (c) => c.id === 'cat_affaires' || /^affaires?$/i.test(String(c.name || '').trim());
const isAffaire = (tx, affaireCatIds) => getCatIds(tx).some(id => affaireCatIds.includes(id));

// Revenu de participation : revenu de la catégorie « Participation ». C'est un revenu pour
// le personnel et une dépense pour la société : il figure donc AUSSI dans la rubrique Société,
// comme dépense de la société. C'est le seul cas où une même transaction apparaît à la fois
// dans Société et dans les vues personnelles.
const isParticipationCat = (c) => c.id === 'cat_participation' || /^participations?$/i.test(String(c.name || '').trim());
const isParticipation = (tx, participationCatIds = []) =>
  tx.type === 'revenu' && getCatIds(tx).some(id => participationCatIds.includes(id));

// Créances : ce que les autres me doivent.
//   - une dépense dont tout ou partie est due par quelqu'un (remboursable « proximite »,
//     champ optionnel `montantDu` ; absent = toute la dépense, comme avant) ;
//   - tout revenu en attente (pour une vente de la catégorie « Affaires », le débiteur
//     est l'acheteur), sauf un revenu de participation, suivi dans Société ;
//   - un revenu déjà reçu reste dans la liste, comme réglé, s'il a un débiteur nommé
//     (`duPar`) ou l'ancien marqueur `dette`.
// `duPar` (optionnel) nomme le débiteur ; `dejaRecu` (optionnel) est la part déjà reçue.
const isDetteRevenu = (tx, affaireCatIds = [], participationCatIds = []) =>
  tx.type === 'revenu'
  && Math.abs(Number(tx.montant) || 0) > 0
  && !isParticipation(tx, participationCatIds)
  && (tx.recu === false || !!tx.dette || !!String(tx.duPar || '').trim());
const isDu = (tx, affaireCatIds = [], participationCatIds = []) =>
  isProximite(tx) || isDetteRevenu(tx, affaireCatIds, participationCatIds);
const montantDu = (tx, affaireCatIds = [], participationCatIds = []) => {
  const total = Math.abs(Number(tx.montant) || 0);
  if (isDetteRevenu(tx, affaireCatIds, participationCatIds)) return total;
  if (!isProximite(tx)) return 0;
  const du = Number(tx.montantDu);
  return du > 0 && du < total ? du : total;
};
const debiteurDe = (tx) => String(tx.duPar || tx.acheteur || '').trim();
// ------------------------------------------------------------
// Étalement d'une dépense (abonnements : vélo, IA, salle de sport…)
// La dépense est saisie une fois, à sa date de paiement, avec
//   etalement = { frequence: 'mois' | '4semaines', nombre } ou { frequence, fin: 'YYYY-MM-DD' }.
// Les vues personnelles la répartissent en échéances égales (au centime près) à partir
// de cette date : même jour chaque mois, ou tous les 28 jours, jusqu'au nombre ou à la date de fin.
// ------------------------------------------------------------
const isoVersParties = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return { y, m, d }; };
const ajouterMoisISO = (iso, k) => {
  const { y, m, d } = isoVersParties(iso);
  const idx = (m - 1) + k;
  const yy = y + Math.floor(idx / 12);
  const mm = ((idx % 12) + 12) % 12 + 1;
  const dernierJour = new Date(yy, mm, 0).getDate();
  return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, dernierJour)).padStart(2, '0')}`;
};
const ajouterJoursISO = (iso, n) => { const { y, m, d } = isoVersParties(iso); return toISODate(new Date(y, m - 1, d + n)); };
const datesEtalement = (dateDebut, etal) => {
  if (!etal || !dateDebut) return [dateDebut];
  const pas = (k) => (etal.frequence === '4semaines' ? ajouterJoursISO(dateDebut, 28 * k) : ajouterMoisISO(dateDebut, k));
  const dates = [];
  if (etal.fin) {
    for (let k = 0; k < 600; k++) { const dd = pas(k); if (dd > etal.fin) break; dates.push(dd); }
  } else {
    const n = Math.min(600, Math.max(1, Math.floor(Number(etal.nombre) || 1)));
    for (let k = 0; k < n; k++) dates.push(pas(k));
  }
  return dates.length > 0 ? dates : [dateDebut];
};
// Répartit un total en n montants égaux ; les centimes restants vont aux premières échéances
const repartirMontant = (total, n) => {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const reste = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < reste ? 1 : 0)) / 100);
};
// Étalement saisi dans le formulaire → objet stocké (null si incomplet ou incohérent)
const etalementDuFormulaire = (tx) => {
  const frequence = tx.etalFreq === '4semaines' ? '4semaines' : 'mois';
  if (tx.etalFin === 'date') {
    if (!tx.etalDate || !tx.date || tx.etalDate <= tx.date) return null;
    const e = { frequence, fin: tx.etalDate };
    return datesEtalement(tx.date, e).length >= 2 ? e : null;
  }
  const n = parseInt(String(tx.etalNombre || '').trim(), 10);
  return n >= 2 && n <= 600 ? { frequence, nombre: n } : null;
};

// Part déjà reçue d'un montant encore en attente (remboursement ou encaissement partiel)
const dejaRecu = (tx) => { const v = Number(tx.dejaRecu); return v > 0 ? v : 0; };
const isDuRegle = (tx) => (tx.type === 'revenu' ? tx.recu !== false : !!tx.rembourse);

// ============================================================
// HOOKS UTILITAIRES
// ============================================================

const useScript = (src) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing && existing.dataset.loaded === 'true') {
      setLoaded(true);
      return;
    }
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      document.body.appendChild(script);
    }
    const onLoad = () => { script.dataset.loaded = 'true'; setLoaded(true); };
    const onErr = (e) => setError(e);
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onErr);
    return () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onErr);
    };
  }, [src]);
  return { loaded, error };
};

// ============================================================
// PARSING DES TRANSACTIONS DEPUIS DU TEXTE
// ============================================================

const parseTransactionsFromText = (text, categories = []) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];

  // Regex montants AVEC capture du signe collé éventuel (+/-) :
  //   "+1500,00" → signe "+", montant "1500,00"
  //   "-45,30 €" → signe "-", montant "45,30"
  //   "12,34"    → pas de signe collé
  // Le signe doit être directement collé au chiffre (pas d'espace entre les deux).
  const amountRegex = /([+\-])?(\d{1,3}(?:[\s.]\d{3})*(?:[,.]\d{2}))\s*(?:€|EUR)?/i;

  // Regex dates : 01/02/2024, 01-02-24, 01.02.2024
  const dateRegex = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;

  // Regex catégorie explicite : [1] ou [1,3] ou [2 5] ou [1, 3, 4]
  const catRegex = /\[(\s*\d+(?:\s*[,;\s]\s*\d+)*\s*)\]/;

  // Regex remboursable :
  //   [R]   → société, en attente
  //   [R*]  → société, remboursé   (* / ✓ / + acceptés)
  //   [Rp]  → proximité, en attente
  //   [Rp*] → proximité, remboursé
  const reimbRegex = /\[R(p)?([*✓+])?\]/i;

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    const amountMatch = line.match(amountRegex);
    if (!amountMatch) continue;

    // ---- Date ----
    let dateISO = toISODate(new Date());
    if (dateMatch) {
      let [, dd, mm, yy] = dateMatch;
      if (yy.length === 2) yy = (parseInt(yy) > 50 ? '19' : '20') + yy;
      const d = new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
      if (!isNaN(d.getTime())) dateISO = toISODate(d);
    }

    // ---- Montant + signe collé ----
    const explicitSign = amountMatch[1]; // "+", "-", ou undefined
    const rawAmount = amountMatch[2].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(rawAmount);
    if (isNaN(amount)) continue;

    // ---- Catégorie explicite [N] ou [N,M] ----
    const catMatch = line.match(catRegex);
    let explicitCatIds = null;
    if (catMatch) {
      const indices = catMatch[1].split(/[,;\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const ids = indices
        .map(idx => categories[idx - 1]?.id) // 1-based
        .filter(Boolean);
      if (ids.length > 0) explicitCatIds = Array.from(new Set(ids));
    }

    // ---- Remboursable : [R] = en attente société, [R*] = remboursé société, [Rp] = proximité ----
    const reimbMatch = line.match(reimbRegex);
    const isRemboursable = !!reimbMatch;
    const isProximite = !!(reimbMatch && reimbMatch[1]); // 'p' = proximité
    const isRembourse = !!(reimbMatch && reimbMatch[2]); // suffixe = remboursé

    // ---- Détermination du type ----
    let signedAmount;
    if (explicitSign === '+') {
      signedAmount = Math.abs(amount);
    } else if (explicitSign === '-') {
      signedAmount = -Math.abs(amount);
    } else {
      // Fallback heuristique mots-clés
      const lower = line.toLowerCase();
      const negativeKeywords = ['paiement', 'achat', 'prelevement', 'prélèvement', 'retrait', 'cb '];
      const positiveKeywords = ['virement reçu', 'salaire', 'remboursement', 'credit', 'crédit'];
      const looksNegative = negativeKeywords.some(k => lower.includes(k));
      const looksPositive = positiveKeywords.some(k => lower.includes(k));
      if (looksPositive && !looksNegative) signedAmount = Math.abs(amount);
      else signedAmount = -Math.abs(amount); // défaut : dépense
    }

    const isRevenu = signedAmount >= 0;

    // ---- Catégorie par défaut si pas explicite ----
    let categorieIds;
    if (explicitCatIds) {
      categorieIds = explicitCatIds;
    } else {
      const fallbackId = isRevenu
        ? (categories.find(c => c.id === 'cat_revenu')?.id || categories[0]?.id)
        : (categories.find(c => c.id === 'cat_autre')?.id || categories.find(c => c.id !== 'cat_revenu')?.id || categories[0]?.id);
      categorieIds = fallbackId ? [fallbackId] : [];
    }

    // ---- Libellé : retirer date, montant complet, et marqueurs catégorie/remboursable ----
    let libelle = line
      .replace(dateRegex, '')
      .replace(amountMatch[0], '')
      .replace(catRegex, '')
      .replace(reimbRegex, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!libelle) libelle = 'Transaction sans libellé';

    results.push({
      id: uuid(),
      date: dateISO,
      libelle,
      montant: signedAmount,
      type: isRevenu ? 'revenu' : 'dépense',
      categorieIds,
      remboursable: isRemboursable && !isRevenu,
      remboursableType: isProximite ? 'proximite' : 'societe',
      rembourse: isRemboursable && isRembourse && !isRevenu,
      justificatif: null,
      notes: '',
      _selected: true,
    });
  }
  return results;
};

// ============================================================
// PIÈCES JOINTES (factures / justificatifs)
// ============================================================

// Compresse une image en base64 dataURL :
//   - réduit à max 1200px de large (préserve le ratio)
//   - convertit en JPEG qualité 75% (sauf PDF, gardé tel quel)
// Renvoie un objet : { dataUrl, mimeType, sizeBytes, originalName }
const compressImageFile = (file, maxWidth = 1200, quality = 0.75) => new Promise((resolve, reject) => {
  if (file.type === 'application/pdf') {
    // Les PDF sont stockés tels quels (pas de compression possible côté client sans lib lourde)
    const reader = new FileReader();
    reader.onload = () => resolve({
      dataUrl: reader.result,
      mimeType: 'application/pdf',
      sizeBytes: file.size,
      originalName: file.name,
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
    return;
  }
  if (!file.type.startsWith('image/')) {
    reject(new Error('Format non supporté (image ou PDF uniquement).'));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      // Estimation de la taille : longueur base64 * 0.75
      const sizeBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);
      resolve({ dataUrl, mimeType: 'image/jpeg', sizeBytes, originalName: file.name });
    };
    img.onerror = () => reject(new Error('Image illisible.'));
    img.src = reader.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
};

// ============================================================
// COMPOSANTS UI ATOMIQUES
// ============================================================
// Les couleurs passent par les variables CSS définies dans App (--ink, --line, --pos…),
// ce qui donne le thème sombre sans dupliquer chaque composant.

const Card = ({ children, className = '', ...rest }) => (
  <div className={`f-panel ${className}`} {...rest}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', size = 'md', className = '', type = 'button', disabled, title, ...rest }) => {
  const variants = {
    primary: 'f-btn f-btn-p',
    secondary: 'f-btn',
    outline: 'f-btn',
    ghost: 'f-btn f-btn-g',
    danger: 'f-btn f-btn-d',
  };
  const sizes = { sm: 'f-btn-sm', md: '', lg: 'f-btn-lg' };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${variants[variant] || variants.primary} ${sizes[size] || ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

const IconButton = ({ label, onClick, children, className = '', danger = false, ...rest }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`f-ibtn ${danger ? 'danger' : ''} ${className}`}
    {...rest}
  >
    {children}
  </button>
);

const Input = ({ value, onChange, type = 'text', placeholder, className = '', ...rest }) => (
  <input
    type={type}
    value={value ?? ''}
    onChange={onChange}
    placeholder={placeholder}
    className={`f-field ${className}`}
    {...rest}
  />
);

const Select = ({ value, onChange, children, className = '', ...rest }) => (
  <select
    value={value}
    onChange={onChange}
    className={`f-field f-select ${className}`}
    {...rest}
  >
    {children}
  </select>
);

// Champ avec libellé au-dessus. `as="div"` pour un groupe de boutons (un <label> ne doit
// contenir qu'un seul contrôle).
const Field = ({ label, children, className = '', as = 'label', style }) => {
  const Tag = as;
  return (
    <Tag className={`f-fl ${className}`} style={style}>
      <span className="f-label">{label}</span>
      {children}
    </Tag>
  );
};

// Contrôle segmenté. options : [{ id, label, count?, icon?, tone? }]
// tone : 'dark' | 'pos' | 'ok' | 'wait' — couleur de l'option active (sinon fond clair)
const Seg = ({ options, value, onChange, label, fill = false, className = '' }) => (
  <div className={`f-seg ${fill ? 'f-seg-fill' : ''} ${className}`} role="group" aria-label={label}>
    {options.map(o => {
      const on = value === o.id;
      return (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={on}
          className={`no-touch-grow ${on ? 'on' : ''} ${on && o.tone ? 'tone-' + o.tone : ''}`}
        >
          {o.icon}
          {o.label}
          {o.count !== undefined && <span className="ct">{o.count}</span>}
        </button>
      );
    })}
  </div>
);

const SearchInput = ({ value, onChange, placeholder = 'Rechercher', className = '', style }) => (
  <label className={`f-search ${className}`} style={style}>
    <Search size={15} aria-hidden="true" />
    <input
      type="search"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={placeholder}
      className="f-field"
    />
  </label>
);

const Modal = ({ open, onClose, title, children, size = 'md', footer }) => {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="f-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`f-modal w-full ${sizes[size]} max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="f-modal-h">
          <h3>{title}</h3>
          <IconButton label="Fermer" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="f-modal-b flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="f-modal-f">{footer}</div>}
      </div>
    </div>
  );
};

// En-tête de rubrique : titre, information courte et actions
const PageHeader = ({ title, meta, children }) => (
  <header className="f-page-h">
    <div className="flex items-baseline gap-3 flex-wrap min-w-0">
      <h1>{title}</h1>
      {meta && <span className="t-muted f-num">{meta}</span>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </header>
);

// En-tête d'un panneau
const PanelHead = ({ title, children }) => (
  <div className="f-ph">
    <h2>{title}</h2>
    {children}
  </div>
);

// Bande d'indicateurs séparés par un filet
const Strip = ({ children, min = 220 }) => (
  <div className="f-panel overflow-hidden">
    <div className="f-strip" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}>
      {children}
    </div>
  </div>
);

const Kpi = ({ label, value, sub, valueClass = '', marker, extra }) => (
  <div className="f-kpi">
    <div className="flex items-center justify-between gap-2 min-h-[20px]">
      <span className="f-kpi-l">
        {marker && <span className="f-sq" style={{ background: marker }} />}
        {label}
      </span>
      {extra}
    </div>
    <span className={`f-kpi-v f-num ${valueClass}`}>{value}</span>
    {sub && <span className="f-kpi-s f-num">{sub}</span>}
  </div>
);

// Ligne de répartition : pastille, nom, barre, part et montant
const BarRow = ({ color, name, ratio, pct, amount, amountClass = 't-ink', icon }) => (
  <div className="f-barrow">
    <span className="flex items-center gap-2 min-w-0">
      {icon || <span className="f-sq" style={{ background: color }} />}
      <span className="truncate t-ink">{name}</span>
    </span>
    <span className="f-track"><span style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%`, background: color }} /></span>
    {pct !== undefined && <span className="f-num t-muted text-right">{pct}</span>}
    <span className={`f-num text-right font-medium ${amountClass}`}>{amount}</span>
  </div>
);

const Badge = ({ children, color = '#9c9c9c' }) => (
  <span className="f-cat">
    <span className="f-sq" style={{ backgroundColor: color }} />
    {children}
  </span>
);

const CatBadges = ({ ids, categories, max = 3 }) => {
  if (!ids || ids.length === 0) {
    return <Badge color="#9c9c9c">Sans catégorie</Badge>;
  }
  const display = ids.slice(0, max);
  const remaining = ids.length - max;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {display.map(id => {
        const c = categories.find(c => c.id === id);
        if (!c) return null;
        return <Badge key={id} color={c.color}>{c.name}</Badge>;
      })}
      {remaining > 0 && <span className="t-muted">+{remaining}</span>}
    </span>
  );
};

const PendingBadge = ({ label = 'En attente' }) => (
  <span className="f-badge f-b-wait"><Clock size={11} /> {label}</span>
);

// Rappel, sur une dépense affichée pour sa part personnelle, du montant dû par un tiers
const DuBadge = ({ t }) => {
  if (!(t._du > 0)) return null;
  return (
    <span className={`f-badge ${t._duRegle ? 'f-b-ok' : 'f-b-wait'}`}>
      <UserIcon size={11} /> {formatMontantCourt(t._du)} {t._duRegle ? 'remb.' : (t._du > 1 ? 'dus' : 'dû')}
    </span>
  );
};

// Échéance d'une dépense étalée (ex. 3/12)
const EtalBadge = ({ t }) => {
  if (!t._etal) return null;
  return (
    <span
      className="f-badge f-b-n f-num"
      title={`Échéance ${t._etal.n} sur ${t._etal.nb} · ${formatEUR(t._etal.total)} au total`}
    >
      <RefreshCw size={11} /> {t._etal.n}/{t._etal.nb}
    </span>
  );
};

const ProgressBar = ({ value, max = 100, color = 'var(--ink)' }) => (
  <span className="f-track">
    <span style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
  </span>
);

// Actions d'une ligne : modifier / supprimer
const RowActions = ({ onEdit, onDelete }) => (
  <span className="flex justify-end gap-0.5 shrink-0">
    {onEdit && <IconButton label="Modifier" onClick={onEdit}><Pencil size={14} /></IconButton>}
    {onDelete && <IconButton label="Supprimer" danger onClick={onDelete}><Trash2 size={14} /></IconButton>}
  </span>
);

// Bouton trombone pour ouvrir la facture jointe
const JustifButton = ({ onClick }) => (
  <IconButton label="Voir la facture jointe" onClick={onClick} className="f-ibtn-xs no-touch-grow">
    <Paperclip size={13} />
  </IconButton>
);

const MOIS_LONGS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
// « 2026-11 » → « Novembre 2026 »
const libelleMois = (key) => {
  const [yy, mm] = String(key || '').split('-').map(n => parseInt(n, 10));
  return yy && mm ? `${MOIS_LONGS[mm - 1]} ${yy}` : 'Sans date';
};
// « 2026-11-07 » → « 7 nov. »
const jourMoisCourt = (iso) => {
  const [, mm, dd] = String(iso || '').split('-').map(n => parseInt(n, 10));
  return mm && dd ? `${dd} ${MOIS_COURTS[mm - 1]}` : '';
};
// ============================================================
// PIÈCE JOINTE — sélecteur + viewer
// ============================================================

// Affiche une miniature et permet de visualiser/supprimer la pièce jointe.
// Si pas de pièce jointe, affiche un bouton "Ajouter une facture".
// Le justificatif est de la forme : { dataUrl, mimeType, sizeBytes, originalName }
const JustificatifPicker = ({ value, onChange, label = "Facture ou justificatif" }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      // Limite la taille brute à 10 Mo en entrée
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Fichier trop volumineux (max 10 Mo).');
      }
      const compressed = await compressImageFile(file);
      onChange(compressed);
    } catch (err) {
      setError(err.message || 'Erreur de traitement du fichier.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="f-fl">
      <span className="f-label">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 p-2 pr-2.5 rounded-lg" style={{ border: '1px solid var(--line)' }}>
          {value.mimeType && value.mimeType.startsWith('image/') ? (
            <button type="button" onClick={() => setViewerOpen(true)} className="shrink-0 no-touch-grow" aria-label="Voir la pièce jointe">
              <img
                src={value.dataUrl}
                alt=""
                className="w-11 h-11 object-cover rounded-md"
                style={{ border: '1px solid var(--line)' }}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 no-touch-grow"
              style={{ background: 'var(--n-bg)', color: 'var(--ink-3)' }}
              aria-label="Voir la pièce jointe"
            >
              <FileText size={18} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium t-ink">{value.originalName || 'Pièce jointe'}</p>
            <p className="text-xs t-muted f-num">
              {value.mimeType === 'application/pdf' ? 'PDF' : 'Image'} · {formatFileSize(value.sizeBytes)}
            </p>
          </div>
          <IconButton label="Voir" onClick={() => setViewerOpen(true)}><Eye size={15} /></IconButton>
          <IconButton label="Retirer" danger onClick={() => onChange(null)}><Trash2 size={15} /></IconButton>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="f-drop"
        >
          {busy ? (
            <><RefreshCw size={15} className="animate-spin" /> Traitement…</>
          ) : (
            <><Paperclip size={15} /> Joindre une photo ou un PDF</>
          )}
        </button>
      )}
      {error && <p className="text-xs t-neg">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <JustificatifViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        justificatif={value}
      />
    </div>
  );
};

// Affiche le justificatif en grand. Pour les PDF, propose juste un bouton ouvrir/télécharger.
const JustificatifViewer = ({ open, onClose, justificatif }) => {
  if (!open || !justificatif) return null;
  const isImage = justificatif.mimeType && justificatif.mimeType.startsWith('image/');
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = justificatif.dataUrl;
    a.download = justificatif.originalName || 'facture';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-md" onClick={onClose}>
      <div className="relative max-w-5xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -top-12 right-0 flex gap-2">
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur text-white hover:bg-white/20 transition text-sm"
          >
            <Download size={14} /> Télécharger
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 backdrop-blur text-white hover:bg-white/20 transition"
            title="Fermer"
          >
            <X size={16} />
          </button>
        </div>
        {isImage ? (
          <img
            src={justificatif.dataUrl}
            alt="Justificatif"
            className="max-w-full max-h-[90vh] mx-auto rounded-xl shadow-2xl"
          />
        ) : (
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden h-[85vh]">
            <iframe
              src={justificatif.dataUrl}
              title="Justificatif PDF"
              className="w-full h-full"
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// FORMULAIRE TRANSACTION
// ============================================================

const TransactionForm = ({ initial, categories, onSave, onCancel, defaultDate, personnes = [], projets = [], acheteurs = [] }) => {
  const affaireCatIds = categories.filter(isAffaireCat).map(c => c.id);
  const participationCatIds = categories.filter(isParticipationCat).map(c => c.id);
  const [etalErreur, setEtalErreur] = useState(false);
  const [tx, setTx] = useState(() => {
    if (initial) {
      // Migration : si la transaction n'a que categorieId, on la convertit
      const ids = getCatIds(initial);
      return {
        ...initial,
        categorieIds: ids,
        montantDu: initial.montantDu ?? '',
        duPar: initial.duPar || '',
        dette: !!initial.dette,
        affaire: initial.affaire || '',
        acheteur: initial.acheteur || '',
        quantite: initial.quantite ?? '',
        reduction: initial.reduction ?? '',
        dejaRecu: initial.dejaRecu ?? '',
        etalOn: !!initial.etalement,
        etalFreq: initial.etalement?.frequence === '4semaines' ? '4semaines' : 'mois',
        etalFin: initial.etalement?.fin ? 'date' : 'nombre',
        etalNombre: initial.etalement?.nombre ? String(initial.etalement.nombre) : '12',
        etalDate: initial.etalement?.fin || '',
      };
    }
    return {
      id: uuid(),
      date: defaultDate || toISODate(new Date()),
      libelle: '',
      montant: '',
      type: 'dépense',
      categorieIds: categories[0] ? [categories[0].id] : [],
      remboursable: false,
      remboursableType: 'societe', // 'societe' | 'proximite'
      rembourse: false,
      // Pour les revenus : true = revenu déjà reçu sur le compte ;
      // false = revenu programmé / attendu mais pas encore crédité.
      // Pour les dépenses : non utilisé (toujours considéré comme effectif).
      recu: true,
      justificatif: null,
      notes: '',
      // Créance : part d'une dépense due par un tiers, ou revenu en attente lié à une dette
      montantDu: '',
      duPar: '',
      dette: false,
      // Catégorie « Affaires » : projet d'achat-revente (et acheteur, pour une vente)
      affaire: '',
      acheteur: '',
      // Vente d'une affaire : quantité vendue et réduction accordée
      quantite: '',
      reduction: '',
      // Part déjà reçue d'un montant en attente (remboursement ou encaissement partiel)
      dejaRecu: '',
      // Étalement de la dépense (abonnements)
      etalOn: false,
      etalFreq: 'mois',
      etalFin: 'nombre',
      etalNombre: '12',
      etalDate: '',
    };
  });

  // Vrai dès que la catégorie « Affaires » est cochée : affiche Projet / Acheteur
  const affaireOn = (tx.categorieIds || []).some(id => affaireCatIds.includes(id));

  const handleSubmit = () => {
    if (!tx.libelle.trim()) return;
    const rawAmount = parseFloat(String(tx.montant).replace(',', '.'));
    if (isNaN(rawAmount)) return;
    // Montant nul accepté uniquement pour une vente de la catégorie « Affaires » (don, réduction totale)
    if (rawAmount === 0 && !(tx.type === 'revenu' && affaireOn)) return;
    const finalAmount = tx.type === 'revenu' ? Math.abs(rawAmount) : -Math.abs(rawAmount);

    // Si aucune catégorie sélectionnée → fallback automatique
    let finalCatIds = tx.categorieIds && tx.categorieIds.length > 0
      ? tx.categorieIds
      : (tx.type === 'revenu'
          ? ['cat_revenu']
          : (categories.find(c => c.id === 'cat_autre') ? ['cat_autre'] : [categories[0]?.id].filter(Boolean)));

    const { categorieId, ...rest } = tx; // on retire l'ancien champ legacy
    const out = { ...rest, categorieIds: finalCatIds, montant: finalAmount };

    // Créance : on ne garde que les champs qui ont un sens pour ce type de transaction
    const duPar = String(tx.duPar || '').trim();
    delete out.montantDu;
    delete out.duPar;
    delete out.dette;
    if (out.type === 'revenu') {
      out.remboursable = false;
      out.rembourse = false;
      if (tx.dette) out.dette = true;
      if (duPar) out.duPar = duPar;
      // participation : pas de débiteur (c'est la société), pas de créance
      if (finalCatIds.some(id => participationCatIds.includes(id))) {
        delete out.dette;
        delete out.duPar;
      }
    } else if (out.remboursable && out.remboursableType === 'proximite') {
      const du = parseFloat(String(tx.montantDu ?? '').replace(',', '.'));
      if (du > 0 && du < Math.abs(rawAmount)) out.montantDu = Math.round(du * 100) / 100;
      if (duPar) out.duPar = duPar;
    }

    // Projet et acheteur : conservés seulement avec la catégorie « Affaires »
    const projet = String(tx.affaire || '').trim();
    const acheteur = String(tx.acheteur || '').trim();
    delete out.affaire;
    delete out.acheteur;
    const num = (v) => parseFloat(String(v ?? '').replace(',', '.'));
    const round2 = (v) => Math.round(v * 100) / 100;
    delete out.quantite;
    delete out.reduction;
    if (finalCatIds.some(id => affaireCatIds.includes(id))) {
      if (projet) out.affaire = projet;
      if (num(tx.quantite) > 0) out.quantite = num(tx.quantite);
      if (out.type === 'revenu') {
        if (acheteur) out.acheteur = acheteur;
        if (num(tx.reduction) > 0) out.reduction = round2(num(tx.reduction));
        // vente en attente = créance automatique sur l'acheteur : pas de débiteur à part
        delete out.dette;
        delete out.duPar;
      }
    }

    // Remboursement / encaissement partiel : gardé seulement tant que le montant est en attente
    delete out.dejaRecu;
    const deja = num(tx.dejaRecu);
    if (deja > 0) {
      if (out.type === 'revenu') {
        if (out.recu === false) {
          if (deja >= Math.abs(finalAmount)) out.recu = true;
          else out.dejaRecu = round2(deja);
        }
      } else if (out.remboursable && !out.rembourse) {
        const total = out.remboursableType === 'proximite' && out.montantDu ? out.montantDu : Math.abs(finalAmount);
        if (deja >= total) out.rembourse = true;
        else out.dejaRecu = round2(deja);
      }
    }
    // Étalement : seulement pour une dépense, avec un nombre d'échéances ou une date de fin valides
    ['etalOn', 'etalFreq', 'etalFin', 'etalNombre', 'etalDate', 'etalement'].forEach(k => { delete out[k]; });
    if (out.type === 'dépense' && tx.etalOn) {
      const etal = etalementDuFormulaire(tx);
      if (!etal) { setEtalErreur(true); return; }
      out.etalement = etal;
    }
    onSave(out);
  };

  const toggleCat = (catId) => {
    const current = tx.categorieIds || [];
    if (current.includes(catId)) {
      setTx({ ...tx, categorieIds: current.filter(id => id !== catId) });
    } else {
      setTx({ ...tx, categorieIds: [...current, catId] });
    }
  };

  const choisirDepense = () => {
    const fallback = categories.find(c => c.id !== 'cat_revenu')?.id;
    const next = (tx.categorieIds || []).filter(id => id !== 'cat_revenu');
    setTx({ ...tx, type: 'dépense', categorieIds: next.length > 0 ? next : (fallback ? [fallback] : []) });
  };
  const choisirRevenu = () => setTx({
    ...tx,
    type: 'revenu',
    // une vente garde la catégorie « Affaires » ; sinon catégorie Revenu par défaut
    categorieIds: affaireOn ? (tx.categorieIds || []).filter(id => affaireCatIds.includes(id)) : ['cat_revenu'],
  });

  return (
    <div className="flex flex-col gap-[18px]">
      <Seg
        fill
        label="Type"
        value={tx.type}
        onChange={(v) => (v === 'revenu' ? choisirRevenu() : choisirDepense())}
        options={[
          { id: 'dépense', label: 'Dépense', tone: 'dark' },
          { id: 'revenu', label: 'Revenu', tone: 'pos' },
        ]}
      />

      <Field label="Libellé">
        <Input
          value={tx.libelle}
          onChange={(e) => setTx({ ...tx, libelle: e.target.value })}
          placeholder="Carrefour, Restaurant Le Soleil…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Montant">
          <span className="relative flex items-center">
            <Input
              type="text"
              inputMode="decimal"
              value={tx.montant}
              onChange={(e) => setTx({ ...tx, montant: e.target.value })}
              placeholder="0,00"
              className="f-num"
              style={{ paddingRight: 28, textAlign: 'right' }}
            />
            <span className="absolute right-2.5 t-muted pointer-events-none">€</span>
          </span>
        </Field>
        <Field label="Date">
          <Input type="date" value={tx.date} onChange={(e) => setTx({ ...tx, date: e.target.value })} className="f-num" />
        </Field>
      </div>

      <Field as="div" label="Catégories">
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => {
            const active = (tx.categorieIds || []).includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCat(c.id)}
                aria-pressed={active}
                className="f-chip no-touch-grow"
                style={active ? { borderColor: c.color, backgroundColor: c.color + '2e', fontWeight: 600 } : undefined}
              >
                <span className="f-sq" style={{ backgroundColor: c.color }} />
                {c.name}
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>
      </Field>

      {affaireOn && (
        <div className="f-inset">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Projet">
              <Input
                value={tx.affaire}
                onChange={(e) => setTx({ ...tx, affaire: e.target.value })}
                placeholder="Nom du projet"
                list="finances-projets"
              />
            </Field>
            {tx.type === 'revenu' && (
              <Field label="Acheteur">
                <Input
                  value={tx.acheteur}
                  onChange={(e) => setTx({ ...tx, acheteur: e.target.value })}
                  placeholder="Nom"
                  list="finances-acheteurs"
                />
              </Field>
            )}
            <Field label={tx.type === 'revenu' ? 'Quantité vendue' : 'Quantité achetée'}>
              <Input
                type="text"
                inputMode="decimal"
                value={tx.quantite}
                onChange={(e) => setTx({ ...tx, quantite: e.target.value })}
                placeholder={tx.type === 'revenu' ? '1' : '—'}
                className="f-num"
              />
            </Field>
            {tx.type === 'revenu' && (
              <Field label="Réduction (€)">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={tx.reduction}
                  onChange={(e) => setTx({ ...tx, reduction: e.target.value })}
                  placeholder="0,00"
                  className="f-num"
                />
              </Field>
            )}
          </div>
        </div>
      )}

      {tx.type === 'dépense' && (() => {
        const societe = !!tx.remboursable && tx.remboursableType !== 'proximite';
        const du = !!tx.remboursable && tx.remboursableType === 'proximite';
        const off = { ...tx, remboursable: false, rembourse: false };
        return (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                aria-pressed={societe}
                onClick={() => setTx(societe ? off : { ...tx, remboursable: true, remboursableType: 'societe' })}
                className={`f-toggle ${societe ? 'on' : ''}`}
              >
                <Building2 size={15} /> Société
              </button>
              <button
                type="button"
                aria-pressed={du}
                onClick={() => setTx(du ? off : { ...tx, remboursable: true, remboursableType: 'proximite' })}
                className={`f-toggle ${du ? 'on' : ''}`}
              >
                <UserIcon size={15} /> Créance
              </button>
              <button
                type="button"
                aria-pressed={!!tx.etalOn}
                onClick={() => { setTx({ ...tx, etalOn: !tx.etalOn }); setEtalErreur(false); }}
                className={`f-toggle ${tx.etalOn ? 'on' : ''}`}
              >
                <RefreshCw size={15} /> Amortissement
              </button>
            </div>

            {(societe || du) && (
              <div className="f-inset">
                {du && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Montant dû (€)">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={tx.montantDu}
                        onChange={(e) => setTx({ ...tx, montantDu: e.target.value })}
                        placeholder="Tout le montant"
                        className="f-num"
                      />
                    </Field>
                    <Field label="Débiteur">
                      <Input
                        value={tx.duPar}
                        onChange={(e) => setTx({ ...tx, duPar: e.target.value })}
                        placeholder="Nom"
                        list="finances-personnes"
                      />
                    </Field>
                  </div>
                )}
                <Field as="div" label="Remboursement">
                  <Seg
                    fill
                    label="Remboursement"
                    value={tx.rembourse ? 'oui' : 'non'}
                    onChange={(v) => setTx({ ...tx, rembourse: v === 'oui' })}
                    options={[
                      { id: 'non', label: 'En attente', tone: 'wait', icon: <Clock size={14} /> },
                      { id: 'oui', label: 'Remboursée', tone: 'ok', icon: <CheckCircle2 size={14} /> },
                    ]}
                  />
                </Field>
                {!tx.rembourse && (
                  <Field label="Déjà remboursé (€)" className="sm:w-1/2 sm:pr-1.5">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={tx.dejaRecu}
                      onChange={(e) => setTx({ ...tx, dejaRecu: e.target.value })}
                      placeholder="0,00"
                      className="f-num"
                    />
                  </Field>
                )}
              </div>
            )}

            {tx.etalOn && (() => {
              const maj = (patch) => { setTx({ ...tx, ...patch }); setEtalErreur(false); };
              const etal = etalementDuFormulaire(tx);
              const total = Math.abs(parseFloat(String(tx.montant).replace(',', '.')) || 0);
              const dates = etal ? datesEtalement(tx.date, etal) : [];
              const montants = etal && total > 0 ? repartirMontant(total, dates.length) : [];
              const erreurStyle = etalErreur ? { borderColor: '#f43f5e', boxShadow: '0 0 0 1px #f43f5e' } : undefined;
              return (
                <div className="f-inset">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <Seg
                      fill
                      label="Fréquence"
                      value={tx.etalFreq === '4semaines' ? '4semaines' : 'mois'}
                      onChange={(v) => maj({ etalFreq: v })}
                      options={[{ id: 'mois', label: 'Mensuel' }, { id: '4semaines', label: '4 semaines' }]}
                    />
                    <Seg
                      fill
                      label="Fin de l'amortissement"
                      value={tx.etalFin === 'date' ? 'date' : 'nombre'}
                      onChange={(v) => maj({ etalFin: v })}
                      options={[{ id: 'nombre', label: 'Nombre' }, { id: 'date', label: 'Jusqu’au' }]}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 items-center">
                    {tx.etalFin === 'date' ? (
                      <Input
                        type="date"
                        value={tx.etalDate}
                        min={tx.date}
                        onChange={(e) => maj({ etalDate: e.target.value })}
                        aria-label="Date de fin"
                        className="f-num"
                        style={erreurStyle}
                      />
                    ) : (
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={tx.etalNombre}
                        onChange={(e) => maj({ etalNombre: e.target.value })}
                        placeholder="12"
                        aria-label="Nombre d'échéances"
                        className="f-num"
                        style={erreurStyle}
                      />
                    )}
                    {etal && montants.length > 1 && (
                      <p className="f-num t-ink2">
                        <span className="font-semibold t-ink">{dates.length} × {formatEUR(montants[montants.length - 1])}</span>
                        {' · '}{formatDateFR(dates[0])} → {formatDateFR(dates[dates.length - 1])}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      <datalist id="finances-personnes">
        {personnes.map(p => <option key={p} value={p} />)}
      </datalist>
      <datalist id="finances-projets">
        {projets.map(p => <option key={p} value={p} />)}
      </datalist>
      <datalist id="finances-acheteurs">
        {acheteurs.map(p => <option key={p} value={p} />)}
      </datalist>

      {tx.type === 'revenu' && (() => {
        // Reçu ou en attente. En attente, c'est une créance (débiteur facultatif), sauf pour une
        // vente d'affaire (débiteur = acheteur) ou une participation (suivie dans Société).
        const recu = tx.recu !== false;
        const participationOn = (tx.categorieIds || []).some(id => participationCatIds.includes(id));
        const avecDebiteur = !recu && !affaireOn && !participationOn;
        return (
          <div className="flex flex-col gap-3">
            <Field as="div" label="Encaissement">
              <Seg
                fill
                label="Encaissement"
                value={recu ? 'recu' : 'attente'}
                onChange={(v) => setTx({ ...tx, recu: v === 'recu' })}
                options={[
                  { id: 'recu', label: 'Reçu', tone: 'ok', icon: <CheckCircle2 size={14} /> },
                  { id: 'attente', label: 'En attente', tone: 'wait', icon: <Clock size={14} /> },
                ]}
              />
            </Field>
            {!recu && (
              <div className={`grid gap-3 ${avecDebiteur ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {avecDebiteur && (
                  <Field label="Débiteur">
                    <Input
                      value={tx.duPar}
                      onChange={(e) => setTx({ ...tx, duPar: e.target.value })}
                      placeholder="Nom"
                      list="finances-personnes"
                    />
                  </Field>
                )}
                <Field label="Déjà reçu (€)">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={tx.dejaRecu}
                    onChange={(e) => setTx({ ...tx, dejaRecu: e.target.value })}
                    placeholder="0,00"
                    className="f-num"
                  />
                </Field>
              </div>
            )}
          </div>
        );
      })()}

      <JustificatifPicker
        value={tx.justificatif}
        onChange={(v) => setTx({ ...tx, justificatif: v })}
      />

      <Field label="Notes">
        <textarea
          value={tx.notes}
          onChange={(e) => setTx({ ...tx, notes: e.target.value })}
          rows={2}
          className="f-field resize-none"
          placeholder="Facultatif"
        />
      </Field>

      <div className="f-form-actions">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button onClick={handleSubmit}>Enregistrer</Button>
      </div>
    </div>
  );
};

// ============================================================
// IMPORT OCR / PDF
// ============================================================

const ImportModal = ({ open, onClose, onImport, categories }) => {
  const pdfScript = useScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const tessScript = useScript('https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js');

  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [detected, setDetected] = useState([]);
  const [step, setStep] = useState('upload'); // upload | text | review
  const [openCatPicker, setOpenCatPicker] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open && pdfScript.loaded && window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }, [open, pdfScript.loaded]);

  const reset = () => {
    setFile(null);
    setProgress(0);
    setProgressLabel('');
    setExtractedText('');
    setParsing(false);
    setDetected([]);
    setStep('upload');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setParsing(true);
    setProgress(0);
    setExtractedText('');

    try {
      if (f.type === 'application/pdf') {
        if (!window.pdfjsLib) throw new Error('pdf.js non chargé');
        setProgressLabel('Lecture du PDF…');
        const buf = await f.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          setProgressLabel(`Page ${i} / ${pdf.numPages}`);
          setProgress(Math.round((i / pdf.numPages) * 100));
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(it => it.str).join(' ');
          fullText += pageText + '\n';
        }
        if (fullText.trim().length < 20) {
          fullText += '\n\n⚠️ Très peu de texte détecté. Ce PDF est probablement scanné. Réessayez en l\'enregistrant comme image (PNG/JPG) pour utiliser l\'OCR.';
        }
        setExtractedText(fullText);
      } else if (f.type.startsWith('image/')) {
        if (!window.Tesseract) throw new Error('Tesseract.js non chargé');
        setProgressLabel('Initialisation de l\'OCR…');
        const result = await window.Tesseract.recognize(f, 'fra', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round(m.progress * 100));
              setProgressLabel(`Reconnaissance : ${Math.round(m.progress * 100)}%`);
            } else if (m.status) {
              setProgressLabel(m.status);
            }
          },
        });
        setExtractedText(result.data.text);
      } else {
        throw new Error('Format non supporté. Utilisez PDF ou image (PNG/JPG).');
      }
      setStep('text');
    } catch (err) {
      setExtractedText('Erreur : ' + err.message);
      setStep('text');
    } finally {
      setParsing(false);
      setProgress(100);
    }
  };

  const handleDetect = () => {
    const txs = parseTransactionsFromText(extractedText, categories);
    if (txs.length === 0) {
      alert('Aucune transaction détectée automatiquement. Vous pouvez ajuster le texte ou ajouter manuellement.');
      return;
    }
    setDetected(txs);
    setStep('review');
  };

  const handleConfirm = () => {
    const selected = detected.filter(t => t._selected).map(({ _selected, categorieId, ...rest }) => rest);
    if (selected.length === 0) return;
    onImport(selected);
    handleClose();
  };

  const ready = pdfScript.loaded && tessScript.loaded;

  const etapes = [
    { id: 'upload', label: 'Fichier' },
    { id: 'text', label: 'Texte' },
    { id: 'review', label: 'Vérification' },
  ];
  const etapeIdx = etapes.findIndex(e => e.id === step);
  const nbSelection = detected.filter(t => t._selected).length;
  const majLigne = (idx, patch) => {
    const next = [...detected];
    next[idx] = { ...next[idx], ...patch };
    setDetected(next);
  };

  const footer = step === 'text' ? (
    <>
      <Button variant="secondary" onClick={() => setStep('upload')}>Retour</Button>
      <Button onClick={handleDetect}>Détecter les transactions</Button>
    </>
  ) : step === 'review' ? (
    <>
      <span className="mr-auto f-num t-ink3">{nbSelection} sur {detected.length} sélectionnée{nbSelection > 1 ? 's' : ''}</span>
      <Button variant="secondary" onClick={() => setStep('text')}>Retour au texte</Button>
      <Button onClick={handleConfirm} disabled={nbSelection === 0}>
        Importer {nbSelection} transaction{nbSelection > 1 ? 's' : ''}
      </Button>
    </>
  ) : null;

  return (
    <Modal open={open} onClose={handleClose} title="Importer un document" size="lg" footer={footer}>
      <nav aria-label="Étapes" className="f-steps">
        {etapes.map((e, i) => {
          const cur = i === etapeIdx;
          const done = i < etapeIdx;
          return (
            <React.Fragment key={e.id}>
              {i > 0 && <span className="f-steps-sep" aria-hidden="true" />}
              <span className={`f-step ${cur ? 'cur' : ''} ${done ? 'done' : ''}`} aria-current={cur ? 'step' : undefined}>
                <b>{done ? <Check size={11} /> : i + 1}</b>{e.label}
              </span>
            </React.Fragment>
          );
        })}
      </nav>

      {step === 'upload' && (
        <div className="flex flex-col gap-4">
          {!ready && (
            <div className="flex items-center gap-2 t-muted">
              <RefreshCw size={15} className="animate-spin" />
              Chargement des outils d'analyse…
            </div>
          )}

          <div
            role="button"
            tabIndex={ready ? 0 : -1}
            aria-disabled={!ready}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              if (!ready) return;
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            onClick={() => ready && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && ready) { e.preventDefault(); fileInputRef.current?.click(); }
            }}
            className={`f-dropzone ${ready ? '' : 'is-off'}`}
          >
            <span className="f-dropzone-ic"><Upload size={18} /></span>
            <span className="font-medium t-ink">Déposer un relevé, une facture ou une capture</span>
            <span className="t-ink3">ou <span className="underline underline-offset-2 t-ink">parcourir</span></span>
            <span className="text-xs t-muted">PDF, PNG, JPEG · 10 Mo max.</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => handleFile(e.target.files[0])}
              className="hidden"
            />
          </div>

          {parsing && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between gap-3">
                <span className="t-ink2">{progressLabel}</span>
                <span className="t-muted f-num">{progress} %</span>
              </div>
              <ProgressBar value={progress} />
            </div>
          )}
        </div>
      )}

      {step === 'text' && (
        <div className="flex flex-col gap-4">
          <Field label={<span className="flex justify-between gap-3"><span>Texte extrait</span><span className="t-muted font-normal f-num">{extractedText.length} caractères{file ? ` · ${file.name}` : ''}</span></span>}>
            <textarea
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              rows={12}
              className="f-field f-mono"
              style={{ background: 'var(--surface-2)', fontSize: 12.5 }}
            />
          </Field>

          <details className="f-details">
            <summary>
              Codes de saisie
              <ChevronDown size={14} className="f-details-chev" />
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 px-3.5 pb-3.5 pt-1 text-[12.5px] t-ink2">
              <div className="flex flex-col gap-2">
                <p><code className="f-code">+1500,00</code> revenu · <code className="f-code">-45,30</code> dépense <span className="t-muted">(sans signe : mots-clés, dépense par défaut)</span></p>
                <p><code className="f-code">[3]</code> catégorie · <code className="f-code">[1,3]</code> ou <code className="f-code">[2 5]</code> plusieurs</p>
                <p><code className="f-code">[R]</code> société en attente · <code className="f-code">[R*]</code> remboursée</p>
                <p><code className="f-code">[Rp]</code> proximité en attente · <code className="f-code">[Rp*]</code> remboursée</p>
                <p className="t-muted">Suffixes acceptés : <code className="f-code">*</code> <code className="f-code">+</code> <code className="f-code">✓</code> · dépenses uniquement</p>
                <div className="flex flex-col gap-1 pt-1">
                  <code className="f-code block">15/03/2026 Carrefour [1] -67,50</code>
                  <code className="f-code block">20/03/2026 Train Paris [3] [R] -89,00</code>
                  <code className="f-code block">25/03/2026 Salaire [11] +1850,00</code>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 content-start">
                {categories.map((c, i) => (
                  <span key={c.id} className="flex items-center gap-1.5 min-w-0">
                    <span className="f-mono f-num t-muted w-5 text-right shrink-0">{i + 1}</span>
                    <span className="f-sq" style={{ backgroundColor: c.color }} />
                    <span className="truncate">{c.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </details>
        </div>
      )}

      {step === 'review' && (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[700px] rounded-lg" style={{ border: '1px solid var(--line)' }}>
            <div className="f-rv f-rv-head">
              <span /><span>Date</span><span>Libellé</span><span className="text-right">Montant</span><span>Catégories</span><span>Remboursement</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {detected.map((tx, idx) => (
                <div key={tx.id} className="f-rv" style={{ opacity: tx._selected ? 1 : 0.55 }}>
                  <input
                    type="checkbox"
                    aria-label="Importer cette ligne"
                    checked={tx._selected}
                    onChange={(e) => majLigne(idx, { _selected: e.target.checked })}
                    className="f-check"
                  />
                  <Input
                    type="date"
                    value={tx.date}
                    onChange={(e) => majLigne(idx, { date: e.target.value })}
                    className="f-field-sm f-num"
                    aria-label="Date"
                  />
                  <Input
                    value={tx.libelle}
                    onChange={(e) => majLigne(idx, { libelle: e.target.value })}
                    className="f-field-sm"
                    aria-label="Libellé"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={tx.montant}
                    onChange={(e) => {
                      const montant = parseFloat(e.target.value) || 0;
                      majLigne(idx, { montant, type: montant >= 0 ? 'revenu' : 'dépense' });
                    }}
                    className={`f-field-sm f-num text-right ${tx.type === 'revenu' ? 't-pos' : ''}`}
                    aria-label="Montant"
                  />
                  <div className="relative min-w-0">
                    <button
                      type="button"
                      onClick={() => setOpenCatPicker(openCatPicker === idx ? null : idx)}
                      className="f-field f-field-sm flex items-center gap-1.5 text-left no-touch-grow"
                      aria-expanded={openCatPicker === idx}
                    >
                      {(tx.categorieIds || []).length > 0 && (
                        <span className="flex gap-0.5 shrink-0">
                          {(tx.categorieIds || []).slice(0, 3).map(id => (
                            <span key={id} className="f-sq" style={{ backgroundColor: categories.find(c => c.id === id)?.color || '#9c9c9c' }} />
                          ))}
                        </span>
                      )}
                      <span className="truncate">
                        {(tx.categorieIds || []).length === 0
                          ? <span className="t-faint">Aucune</span>
                          : (tx.categorieIds || []).length === 1
                            ? categories.find(c => c.id === tx.categorieIds[0])?.name || '—'
                            : `${tx.categorieIds.length} catégories`}
                      </span>
                    </button>
                    {openCatPicker === idx && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenCatPicker(null)} />
                        <div className="f-pop absolute right-0 top-full mt-1 z-20 w-56 p-1.5 max-h-60 overflow-y-auto">
                          {categories.map(c => {
                            const ids = tx.categorieIds || [];
                            const active = ids.includes(c.id);
                            return (
                              <label key={c.id} className="f-pop-item">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => majLigne(idx, { categorieIds: active ? ids.filter(id => id !== c.id) : [...ids, c.id] })}
                                  className="f-check"
                                />
                                <span className="f-sq" style={{ backgroundColor: c.color }} />
                                <span className="truncate t-ink">{c.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  <select
                    value={tx.type === 'revenu' ? 'none' : (tx.remboursable ? (tx.rembourse ? 'paid' : 'pending') : 'none')}
                    disabled={tx.type === 'revenu'}
                    onChange={(e) => {
                      const v = e.target.value;
                      majLigne(idx, { remboursable: v !== 'none', rembourse: v === 'paid' });
                    }}
                    className="f-field f-select f-field-sm"
                    aria-label="Remboursement"
                    title={tx.type === 'revenu' ? 'Non applicable aux revenus' : 'Statut de remboursement'}
                  >
                    <option value="none">Non remboursable</option>
                    <option value="pending">En attente</option>
                    <option value="paid">Remboursée</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ============================================================
// VUES TEMPORELLES
// ============================================================

const TimeViews = ({ transactions, categories, isDark = false }) => {
  const [period, setPeriod] = useState('month'); // weeks | month | quarter | year | all | custom
  const [customStart, setCustomStart] = useState(toISODate(addMonths(new Date(), -3)));
  const [customEnd, setCustomEnd] = useState(toISODate(new Date()));

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';
  const getCatName = (id) => categories.find(c => c.id === id)?.name || 'Inconnue';

  // ===== Plage de la période active =====
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    if (period === 'weeks') return { start: addDays(today, -27), end: tomorrow, label: '4 dernières semaines' };
    if (period === 'month') return { start: startOfMonth(today), end: tomorrow, label: 'Ce mois' };
    if (period === 'quarter') return { start: addDays(today, -89), end: tomorrow, label: '3 derniers mois' };
    if (period === 'year') return { start: startOfMonth(addMonths(today, -11)), end: tomorrow, label: '12 derniers mois' };
    if (period === 'custom') {
      const s = startOfDay(new Date(customStart));
      const e = addDays(startOfDay(new Date(customEnd)), 1);
      return { start: s, end: e, label: `${formatDateFR(customStart)} → ${formatDateFR(customEnd)}` };
    }
    // 'all'
    const dates = transactions.map(t => new Date(t.date)).filter(d => !isNaN(d));
    const min = dates.length ? new Date(Math.min(...dates)) : addMonths(today, -12);
    return { start: startOfDay(min), end: tomorrow, label: 'Tout l\'historique' };
  }, [period, customStart, customEnd, transactions]);

  // ===== Filtrage de la période =====
  const inRange = (t) => {
    const d = new Date(t.date);
    return d >= range.start && d < range.end;
  };

  const periodTxs = useMemo(() => transactions.filter(inRange), [transactions, range]);
  const expenses = periodTxs.filter(t => t.type === 'dépense');
  const incomes = periodTxs.filter(t => t.type === 'revenu');

  const totalDepenses = expenses.reduce((s, t) => s + Math.abs(t.montant), 0);
  const totalRevenus = incomes.reduce((s, t) => s + Math.abs(t.montant), 0);
  const solde = totalRevenus - totalDepenses;

  // ===== Période précédente (même durée, juste avant) pour comparatif =====
  const prevRange = useMemo(() => {
    const durationMs = range.end - range.start;
    return { start: new Date(range.start - durationMs), end: range.start };
  }, [range]);

  const prevTxs = useMemo(() => transactions.filter(t => {
    const d = new Date(t.date);
    return d >= prevRange.start && d < prevRange.end;
  }), [transactions, prevRange]);

  const prevDepenses = prevTxs.filter(t => t.type === 'dépense').reduce((s, t) => s + Math.abs(t.montant), 0);
  const prevRevenus = prevTxs.filter(t => t.type === 'revenu').reduce((s, t) => s + Math.abs(t.montant), 0);

  const pct = (current, previous) => {
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  const dDelta = pct(totalDepenses, prevDepenses);
  const rDelta = pct(totalRevenus, prevRevenus);

  // ===== Granularité auto pour la courbe =====
  const granularity = useMemo(() => {
    const days = (range.end - range.start) / (1000 * 60 * 60 * 24);
    if (days <= 35) return 'day';
    if (days <= 120) return 'week';
    return 'month';
  }, [range]);

  const seriesData = useMemo(() => {
    const buckets = new Map();
    const keyOf = (date) => {
      if (granularity === 'day') return toISODate(date);
      if (granularity === 'week') {
        const w = startOfWeek(date);
        return toISODate(w);
      }
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };
    const labelOf = (date) => {
      if (granularity === 'day') return formatDateShort(toISODate(date));
      if (granularity === 'week') return `S ${formatDateShort(toISODate(startOfWeek(date)))}`;
      return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    };

    // Initialiser tous les buckets de la période pour avoir une courbe continue
    let cursor = new Date(range.start);
    while (cursor < range.end) {
      const k = keyOf(cursor);
      if (!buckets.has(k)) buckets.set(k, { key: k, label: labelOf(cursor), revenus: 0, depenses: 0 });
      if (granularity === 'day') cursor = addDays(cursor, 1);
      else if (granularity === 'week') cursor = addDays(cursor, 7);
      else cursor = addMonths(cursor, 1);
    }

    periodTxs.forEach(t => {
      const k = keyOf(new Date(t.date));
      if (!buckets.has(k)) {
        buckets.set(k, { key: k, label: labelOf(new Date(t.date)), revenus: 0, depenses: 0 });
      }
      const b = buckets.get(k);
      if (t.type === 'revenu') b.revenus += Math.abs(t.montant);
      else b.depenses += Math.abs(t.montant);
    });

    return Array.from(buckets.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(b => ({ ...b, revenus: Math.round(b.revenus * 100) / 100, depenses: Math.round(b.depenses * 100) / 100 }));
  }, [periodTxs, range, granularity]);

  // ===== Distribution par catégorie =====
  const distributionFor = (txs) => {
    const totals = {};
    txs.forEach(t => {
      const ids = getCatIds(t);
      if (ids.length === 0) return;
      const share = Math.abs(t.montant) / ids.length;
      ids.forEach(id => { totals[id] = (totals[id] || 0) + share; });
    });
    return Object.entries(totals)
      .map(([id, total]) => ({ name: getCatName(id), value: Math.round(total * 100) / 100, color: getCatColor(id) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  const expDist = useMemo(() => distributionFor(expenses), [expenses, categories]);
  const revDist = useMemo(() => distributionFor(incomes), [incomes, categories]);

  // ===== Top 5 dépenses + revenus =====
  const top5Expenses = useMemo(() =>
    [...expenses].sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)).slice(0, 5),
    [expenses]
  );
  const top5Incomes = useMemo(() =>
    [...incomes].sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)).slice(0, 5),
    [incomes]
  );

  // ===== Indicateurs additionnels =====
  const dayCount = Math.max(1, Math.round((range.end - range.start) / (1000 * 60 * 60 * 24)));
  const avgDailyExp = totalDepenses / dayCount;
  const avgMonthlyExp = avgDailyExp * 30;

  // ===== Sélecteurs période =====
  const periodOptions = [
    { id: 'weeks', label: '4 semaines' },
    { id: 'month', label: 'Ce mois' },
    { id: 'quarter', label: '3 mois' },
    { id: 'year', label: '12 mois' },
    { id: 'all', label: 'Tout' },
    { id: 'custom', label: 'Personnalisé' },
  ];

  const chartColors = isDark
    ? { rev: '#6ee7b7', dep: '#e7e5e4', grid: '#3d3835', axis: '#a8a29e' }
    : { rev: '#047857', dep: '#1c1917', grid: '#f0eeec', axis: '#78716c' };
  const tooltipStyle = {
    borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)',
    color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow)',
  };
  const fmtPct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')} %`;
  const maxOf = (list) => Math.max(1, ...list.map(d => d.value));
  const expMax = maxOf(expDist);
  const revMax = maxOf(revDist);

  const TopList = ({ items, revenu }) => (
    items.length === 0 ? (
      <p className="t-muted text-center py-8">{revenu ? 'Aucun revenu sur la période.' : 'Aucune dépense sur la période.'}</p>
    ) : (
      <div className="flex flex-col">
        {items.map((t, idx) => (
          <div key={t.id} className="f-row f-top">
            <span className="f-num t-muted">{idx + 1}</span>
            <span className="flex flex-col min-w-0">
              <span className="truncate font-medium t-ink">{t.libelle}</span>
              <span className="text-xs t-muted f-num">{formatDateFR(t.date)}</span>
            </span>
            <span className="hidden sm:inline-flex text-xs"><CatBadges ids={getCatIds(t)} categories={categories} max={1} /></span>
            <span className={`f-num text-right font-medium ${revenu ? 't-pos' : 't-ink'}`}>
              {revenu ? '+' : ''}{formatEUR(Math.abs(t.montant))}
            </span>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Analyses"
        meta={`${range.label} · ${periodTxs.length} transaction${periodTxs.length > 1 ? 's' : ''}`}
      >
        <Seg label="Période" value={period} onChange={setPeriod} options={periodOptions} />
      </PageHeader>

      {period === 'custom' && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="f-num" style={{ width: 160 }} aria-label="Début" />
          <span className="t-muted">→</span>
          <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="f-num" style={{ width: 160 }} aria-label="Fin" />
        </div>
      )}

      <Strip min={200}>
        <Kpi
          label="Revenus"
          marker={chartColors.rev}
          value={formatEUR(totalRevenus)}
          valueClass="t-pos"
          extra={rDelta !== null && <span className={`text-xs font-medium f-num ${rDelta >= 0 ? 't-pos' : 't-neg'}`}>{fmtPct(rDelta)}</span>}
          sub={`${formatEUR(prevRevenus)} sur la période précédente`}
        />
        <Kpi
          label="Dépenses"
          marker={chartColors.dep}
          value={formatEUR(totalDepenses)}
          extra={dDelta !== null && <span className={`text-xs font-medium f-num ${dDelta <= 0 ? 't-pos' : 't-neg'}`}>{fmtPct(dDelta)}</span>}
          sub={`${formatEUR(prevDepenses)} sur la période précédente`}
        />
        <Kpi
          label="Solde"
          value={`${solde >= 0 ? '+' : '−'}${formatEUR(Math.abs(solde))}`}
          valueClass={solde >= 0 ? 't-ink' : 't-neg'}
          sub={totalRevenus > 0 ? `Taux d’épargne ${((solde / totalRevenus) * 100).toFixed(1).replace('.', ',')} %` : 'Aucun revenu sur la période'}
        />
      </Strip>

      <Card className="overflow-hidden">
        <PanelHead title="Évolution">
          <div className="flex items-center gap-4 text-xs t-ink3">
            <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-0.5 rounded" style={{ background: chartColors.rev }} /> Revenus</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-0.5 rounded" style={{ background: chartColors.dep }} /> Dépenses</span>
            <span className="t-muted">{granularity === 'day' ? 'Par jour' : granularity === 'week' ? 'Par semaine' : 'Par mois'}</span>
          </div>
        </PanelHead>
        {seriesData.length === 0 ? (
          <p className="t-muted text-center py-10">Aucune transaction sur la période.</p>
        ) : (
          <div className="h-72 px-2 pt-4 pb-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                <CartesianGrid stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="label" stroke={chartColors.axis} fontSize={11} tickMargin={8} tickLine={false} axisLine={{ stroke: chartColors.grid }} />
                <YAxis stroke={chartColors.axis} fontSize={11} tickFormatter={(v) => `${Math.round(v)} €`} width={64} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v, name) => [formatEUR(v), name === 'revenus' ? 'Revenus' : 'Dépenses']}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: 'var(--muted)', marginBottom: 4 }}
                  cursor={{ stroke: chartColors.grid, strokeWidth: 1 }}
                />
                <Line type="monotone" dataKey="revenus" stroke={chartColors.rev} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="depenses" stroke={chartColors.dep} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="f-strip grid-cols-2 md:grid-cols-4" style={{ borderTop: '1px solid var(--line-soft)', background: 'var(--line-soft)' }}>
          <div className="f-kpi" style={{ paddingTop: 12, paddingBottom: 12 }}><span className="text-xs t-muted">Dépense moyenne par jour</span><span className="f-num text-[15px] font-semibold t-ink">{formatEUR(avgDailyExp)}</span></div>
          <div className="f-kpi" style={{ paddingTop: 12, paddingBottom: 12 }}><span className="text-xs t-muted">Dépense moyenne par mois</span><span className="f-num text-[15px] font-semibold t-ink">{formatEUR(avgMonthlyExp)}</span></div>
          <div className="f-kpi" style={{ paddingTop: 12, paddingBottom: 12 }}><span className="text-xs t-muted">Nombre de dépenses</span><span className="f-num text-[15px] font-semibold t-ink">{expenses.length}</span></div>
          <div className="f-kpi" style={{ paddingTop: 12, paddingBottom: 12 }}><span className="text-xs t-muted">Nombre de revenus</span><span className="f-num text-[15px] font-semibold t-pos">{incomes.length}</span></div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <PanelHead title="Dépenses par catégorie"><span className="f-num t-muted">{formatEUR(totalDepenses)}</span></PanelHead>
          {expDist.length === 0 ? (
            <p className="t-muted text-center py-8">Aucune dépense.</p>
          ) : (
            <div className="flex flex-col px-4 py-2">
              {expDist.map(c => (
                <BarRow
                  key={c.name}
                  color={c.color}
                  name={c.name}
                  ratio={c.value / expMax}
                  pct={`${totalDepenses > 0 ? Math.round((c.value / totalDepenses) * 100) : 0} %`}
                  amount={formatEUR(c.value)}
                />
              ))}
            </div>
          )}
        </Card>
        <Card>
          <PanelHead title="Revenus par catégorie"><span className="f-num t-muted">{formatEUR(totalRevenus)}</span></PanelHead>
          {revDist.length === 0 ? (
            <p className="t-muted text-center py-8">Aucun revenu.</p>
          ) : (
            <div className="flex flex-col px-4 py-2">
              {revDist.map(c => (
                <BarRow
                  key={c.name}
                  color={c.color}
                  name={c.name}
                  ratio={c.value / revMax}
                  pct={`${totalRevenus > 0 ? Math.round((c.value / totalRevenus) * 100) : 0} %`}
                  amount={formatEUR(c.value)}
                  amountClass="t-pos"
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card className="overflow-hidden">
          <PanelHead title="Top 5 dépenses" />
          <TopList items={top5Expenses} />
        </Card>
        <Card className="overflow-hidden">
          <PanelHead title="Top 5 revenus" />
          <TopList items={top5Incomes} revenu />
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// CALENDRIER
// ============================================================
// Chaque case affiche TOUTES les transactions du jour, une ligne par transaction,
// colorée selon sa ou ses catégories. La bande « Répartition du mois » sert à la
// fois de légende et de filtre : un clic sur une catégorie la met en avant.

const CalendarView = ({ transactions, categories, onAddTx, onEdit, onDelete }) => {
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [selectedIso, setSelectedIso] = useState(null);
  const [viewingJustif, setViewingJustif] = useState(null);
  const [focusCat, setFocusCat] = useState(null);
  const [mode, setMode] = useState(() => {
    try { return window.localStorage.getItem('finances_cal_mode') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const changeMode = (m) => {
    setMode(m);
    try { window.localStorage.setItem('finances_cal_mode', m); } catch {}
  };

  const monthName = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const todayIso = toISODate(new Date());
  const isCurrentMonth = toISODate(startOfMonth(new Date())) === toISODate(cursor);

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  // Catégories connues d'une transaction (les ids orphelins sont ignorés)
  const knownCatIds = (t) => getCatIds(t).filter(id => catMap[id]);
  const txColors = (t) => {
    const cols = knownCatIds(t).map(id => catMap[id].color);
    return cols.length > 0 ? cols : ['#9c9c9c'];
  };

  const days = useMemo(() => {
    const byDate = {};
    transactions.forEach(t => {
      if (!byDate[t.date]) byDate[t.date] = [];
      byDate[t.date].push(t);
    });
    const first = startOfMonth(cursor);
    const lastDate = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const startWeekday = (first.getDay() + 6) % 7; // Lundi = 0
    const arr = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= lastDate; d++) {
      const dateObj = new Date(first.getFullYear(), first.getMonth(), d);
      const isoStr = toISODate(dateObj);
      // Revenus d'abord, puis dépenses de la plus forte à la plus faible
      const dayTxs = (byDate[isoStr] || []).slice().sort((a, b) => {
        if (a.type !== b.type) return a.type === 'revenu' ? -1 : 1;
        return Math.abs(b.montant) - Math.abs(a.montant);
      });
      const depenses = dayTxs.filter(t => t.type === 'dépense').reduce((s, t) => s + Math.abs(t.montant), 0);
      const revenus = dayTxs.filter(t => t.type === 'revenu').reduce((s, t) => s + Math.abs(t.montant), 0);
      arr.push({
        date: dateObj,
        iso: isoStr,
        depenses,
        revenus,
        nbDepenses: dayTxs.filter(t => t.type === 'dépense').length,
        count: dayTxs.length,
        txs: dayTxs,
      });
    }
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor, transactions]);

  // Découpage en semaines (lignes de 7 jours) avec sous-total
  const weeks = useMemo(() => {
    const rows = [];
    for (let i = 0; i < days.length; i += 7) {
      const cells = days.slice(i, i + 7);
      const real = cells.filter(Boolean);
      rows.push({
        cells,
        depenses: real.reduce((s, d) => s + d.depenses, 0),
        revenus: real.reduce((s, d) => s + d.revenus, 0),
      });
    }
    return rows;
  }, [days]);

  const realDays = days.filter(Boolean);
  const monthRevenus = realDays.reduce((s, d) => s + d.revenus, 0);
  const monthDepenses = realDays.reduce((s, d) => s + d.depenses, 0);
  const monthNet = monthRevenus - monthDepenses;
  const monthCount = realDays.reduce((s, d) => s + d.count, 0);

  // Répartition du mois par catégorie (montant réparti à parts égales si plusieurs catégories,
  // même convention que dans l'onglet Catégories)
  const legend = useMemo(() => {
    const map = {};
    const bump = (id, name, color, key, amount) => {
      if (!map[id]) map[id] = { id, name, color, depenses: 0, revenus: 0 };
      map[id][key] += amount;
    };
    days.filter(Boolean).forEach(d => d.txs.forEach(t => {
      const key = t.type === 'revenu' ? 'revenus' : 'depenses';
      const ids = getCatIds(t).filter(id => catMap[id]);
      if (ids.length === 0) {
        bump('__none', 'Sans catégorie', '#9c9c9c', key, Math.abs(t.montant));
        return;
      }
      const share = Math.abs(t.montant) / ids.length;
      ids.forEach(id => bump(id, catMap[id].name, catMap[id].color, key, share));
    }));
    return Object.values(map).sort((a, b) => (b.depenses - a.depenses) || (b.revenus - a.revenus));
  }, [days, catMap]);

  const matchesFocus = (t) => {
    if (!focusCat) return true;
    const ids = knownCatIds(t);
    if (focusCat === '__none') return ids.length === 0;
    return ids.includes(focusCat);
  };

  const withAlpha = (hex, alphaHex) => (/^#[0-9a-fA-F]{6}$/.test(hex) ? hex + alphaHex : 'rgba(156,156,156,0.18)');
  const stripeBackground = (cols) => {
    if (cols.length === 1) return cols[0];
    const step = 100 / cols.length;
    return `linear-gradient(to bottom, ${cols.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
  };
  const txTitle = (t) => {
    const names = knownCatIds(t).map(id => catMap[id].name).join(', ') || 'Sans catégorie';
    const du = t._du > 0 ? ` · ma part sur ${formatEUR(t._total)}` : '';
    const et = t._etal ? ` · échéance ${t._etal.n}/${t._etal.nb} sur ${formatEUR(t._etal.total)}` : '';
    return `${t.libelle} · ${t.type === 'revenu' ? '+' : '−'}${formatEUR(Math.abs(t.montant))}${du}${et} · ${names}`;
  };

  const selectedDay = selectedIso ? realDays.find(d => d.iso === selectedIso) || null : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calendrier">
        <Seg
          label="Affichage"
          value={mode}
          onChange={changeMode}
          options={[{ id: 'grid', label: 'Grille' }, { id: 'list', label: 'Liste' }]}
        />
      </PageHeader>

      <Card className="overflow-hidden">
        {/* Navigation et totaux du mois */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2.5 md:px-4 py-2.5" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-1">
            <IconButton label="Mois précédent" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft size={16} /></IconButton>
            <h2 className="text-[15px] font-semibold t-ink capitalize w-36 text-center">{monthName}</h2>
            <IconButton label="Mois suivant" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight size={16} /></IconButton>
            {!isCurrentMonth && (
              <Button variant="secondary" size="sm" className="ml-1" onClick={() => setCursor(startOfMonth(new Date()))}>
                Aujourd'hui
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 ml-auto">
            <span className="flex items-baseline gap-2"><span className="t-muted">Revenus</span><span className="f-num text-sm font-semibold t-pos">{formatEUR(monthRevenus)}</span></span>
            <span className="hidden sm:block w-px h-4" style={{ background: 'var(--line)' }} />
            <span className="flex items-baseline gap-2"><span className="t-muted">Dépenses</span><span className="f-num text-sm font-semibold t-ink">{formatEUR(monthDepenses)}</span></span>
            <span className="hidden sm:block w-px h-4" style={{ background: 'var(--line)' }} />
            <span className="flex items-baseline gap-2"><span className="t-muted">Solde</span><span className={`f-num text-sm font-semibold ${monthNet >= 0 ? 't-ink' : 't-neg'}`}>{monthNet >= 0 ? '+' : '−'}{formatEUR(Math.abs(monthNet))}</span></span>
          </div>
        </div>

        {/* Répartition du mois : barre empilée + légende cliquable */}
        <div className="flex flex-col gap-2.5 px-3 md:px-4 pt-3 pb-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold t-ink">Répartition du mois</span>
            <span className="f-num t-muted">{monthCount} transaction{monthCount > 1 ? 's' : ''}</span>
          </div>
          {monthCount === 0 && <p className="t-muted">Aucune transaction ce mois-ci.</p>}
          {monthDepenses > 0 && (
            <div className="flex gap-0.5 h-2">
              {legend.filter(c => c.depenses > 0).map(c => (
                <span
                  key={c.id}
                  title={`${c.name} · ${formatEUR(c.depenses)} · ${Math.round((c.depenses / monthDepenses) * 100)} %`}
                  className="h-2 rounded-sm transition-opacity"
                  style={{
                    flex: `${c.depenses} 1 0px`,
                    backgroundColor: c.color,
                    opacity: focusCat && focusCat !== c.id ? 0.25 : 1,
                  }}
                />
              ))}
            </div>
          )}
          {legend.length > 0 && (
            <div className="cal-legend">
              {legend.map(c => {
                const active = focusCat === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFocusCat(active ? null : c.id)}
                    title={active ? 'Afficher toutes les catégories' : `Mettre en avant « ${c.name} »`}
                    aria-pressed={active}
                    className="f-chip no-touch-grow"
                    style={active ? { borderColor: 'var(--ink)', backgroundColor: withAlpha(c.color, '40') } : undefined}
                  >
                    <span className="f-sq" style={{ backgroundColor: c.color }} />
                    <span className="font-medium t-ink">{c.name}</span>
                    {c.depenses > 0 && <span className="f-num t-ink3">{formatMontantCourt(c.depenses)}</span>}
                    {c.revenus > 0 && <span className="f-num t-pos">+{formatMontantCourt(c.revenus)}</span>}
                  </button>
                );
              })}
              {focusCat && (
                <Button variant="ghost" size="sm" className="no-touch-grow" onClick={() => setFocusCat(null)}>
                  <X size={13} /> Tout afficher
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ===================== VUE GRILLE ===================== */}
        {mode === 'grid' && (
          <div>
            <div className="cal-grid" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
                <span key={d} className="cal-wd">{d}</span>
              ))}
              <span className="cal-wd cal-desktop text-right">Semaine</span>
            </div>
            {weeks.map((w, wi) => (
              <div key={wi} className="cal-grid" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                {w.cells.map((d, idx) => {
                  if (!d) return <span key={`vide-${wi}-${idx}`} className="cal-cell empty" />;
                  const isToday = todayIso === d.iso;
                  return (
                    <div
                      key={d.iso}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedIso(d.iso)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedIso(d.iso); }
                      }}
                      title={d.count === 0 ? 'Ajouter une transaction' : undefined}
                      aria-label={d.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      className="cal-cell"
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className={`cal-num f-num ${isToday ? 'today' : ''}`}>{d.date.getDate()}</span>
                        {d.nbDepenses > 1 && (
                          <span className="cal-desktop f-num text-[11.5px] font-semibold t-ink2" title="Total des dépenses du jour">
                            −{formatMontantCourt(d.depenses)}
                          </span>
                        )}
                      </span>
                      {d.txs.map(t => {
                        const cols = txColors(t);
                        const isRev = t.type === 'revenu';
                        const enAttente = (isRev && t.recu === false) || (t._du > 0 && !t._duRegle);
                        return (
                          <span
                            key={t.id}
                            title={txTitle(t)}
                            className="cal-chip"
                            style={{
                              backgroundColor: withAlpha(cols[0], '26'),
                              opacity: matchesFocus(t) ? 1 : 0.2,
                              outline: enAttente ? '1px dashed var(--warn)' : 'none',
                              outlineOffset: '-1px',
                            }}
                          >
                            <span className="cal-desktop cal-dots">
                              {cols.map((col, i) => <span key={i} className="cal-dot" style={{ backgroundColor: col }} />)}
                            </span>
                            <span className="cal-desktop flex-1 min-w-0 truncate">{t.libelle}</span>
                            <span className={`cal-desktop shrink-0 f-num font-medium ${isRev ? 't-pos' : ''}`}>
                              {isRev ? '+' : '−'}{formatMontantCourt(t.montant, false)}
                            </span>
                            <span className={`cal-mobile flex-1 min-w-0 text-center f-num font-medium ${isRev ? 't-pos' : ''}`}>
                              {isRev ? '+' : ''}{Math.round(Math.abs(t.montant))}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Sous-total de la semaine (ordinateur uniquement) */}
                <span className="cal-week">
                  {w.depenses > 0 && <span className="f-num text-xs font-semibold t-ink">−{formatMontantCourt(Math.round(w.depenses))}</span>}
                  {w.revenus > 0 && <span className="f-num text-xs font-medium t-pos">+{formatMontantCourt(Math.round(w.revenus))}</span>}
                  {w.depenses === 0 && w.revenus === 0 && <span className="text-xs t-faint">—</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ===================== VUE LISTE ===================== */}
        {mode === 'list' && (
          <div className="flex flex-col">
            {realDays.filter(d => d.count > 0).length === 0 && (
              <p className="t-muted text-center py-10">Aucune transaction ce mois-ci.</p>
            )}
            {realDays.filter(d => d.count > 0).map(d => (
              <div key={d.iso} className="flex items-start gap-3 md:gap-4 px-3 md:px-4 py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <button
                  type="button"
                  onClick={() => setSelectedIso(d.iso)}
                  title="Détail du jour"
                  className="f-hov w-11 shrink-0 flex flex-col items-center rounded-md py-0.5 no-touch-grow"
                >
                  <span className="text-[11.5px] t-muted">
                    {d.date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}
                  </span>
                  <span className={`f-num text-lg font-semibold leading-tight ${todayIso === d.iso ? 't-pos' : 't-ink'}`}>
                    {d.date.getDate()}
                  </span>
                </button>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  {d.txs.map(t => {
                    const cols = txColors(t);
                    const isRev = t.type === 'revenu';
                    const names = knownCatIds(t).map(id => catMap[id].name).join(' · ') || 'Sans catégorie';
                    const enAttente = (isRev && t.recu === false) || (t._du > 0 && !t._duRegle);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onEdit && onEdit(t)}
                        title="Modifier"
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-opacity"
                        style={{
                          backgroundColor: withAlpha(cols[0], '26'),
                          opacity: matchesFocus(t) ? 1 : 0.2,
                          outline: enAttente ? '1px dashed var(--warn)' : 'none',
                          outlineOffset: '-1px',
                        }}
                      >
                        <span className="flex flex-col gap-0.5 shrink-0">
                          {cols.map((col, i) => <span key={i} className="f-sq" style={{ backgroundColor: col }} />)}
                        </span>
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className="truncate font-medium t-ink">{t.libelle}</span>
                          <span className="truncate text-xs t-ink3">{names}{enAttente ? ' · en attente' : ''}</span>
                        </span>
                        <span className={`shrink-0 f-num font-medium ${isRev ? 't-pos' : 't-ink'}`}>
                          {isRev ? '+' : '−'}{formatEUR(Math.abs(t.montant))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {d.count > 1 && (
                  <div className="cal-desktop shrink-0 w-28 text-right pt-1.5">
                    {d.depenses > 0 && <p className="f-num font-semibold t-ink">−{formatEUR(d.depenses)}</p>}
                    {d.revenus > 0 && <p className="f-num font-medium t-pos">+{formatEUR(d.revenus)}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedIso(null)}
        title={selectedDay ? selectedDay.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
      >
        {selectedDay && (
          <div className="flex flex-col gap-3 -mt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="flex flex-wrap gap-x-3.5 f-num">
                <span className="t-muted">{selectedDay.count} transaction{selectedDay.count > 1 ? 's' : ''}</span>
                {selectedDay.revenus > 0 && <span className="font-medium t-pos">+{formatEUR(selectedDay.revenus)}</span>}
                {selectedDay.depenses > 0 && <span className="font-medium t-ink">−{formatEUR(selectedDay.depenses)}</span>}
              </span>
              <Button size="sm" onClick={() => {
                onAddTx(selectedDay.iso);
                setSelectedIso(null);
              }}>
                <Plus size={14} /> Ajouter
              </Button>
            </div>
            {selectedDay.txs.length === 0 ? (
              <p className="t-muted py-4">Aucune transaction ce jour-là.</p>
            ) : (
              <div className="flex flex-col -mx-5">
                {selectedDay.txs.map(t => (
                  <div key={t.id} className="f-row f-dayrow f-line">
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: stripeBackground(txColors(t)) }} />
                    <div className="min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="font-medium t-ink truncate">{t.libelle}</span>
                        {t.justificatif && <JustifButton onClick={() => setViewingJustif(t.justificatif)} />}
                        <DuBadge t={t} /><EtalBadge t={t} />
                        {t.type === 'revenu' && t.recu === false && <PendingBadge />}
                      </div>
                      <span className="text-xs"><CatBadges ids={getCatIds(t)} categories={categories} max={3} /></span>
                    </div>
                    <span className={`f-num text-sm font-semibold ${t.type === 'revenu' ? 't-pos' : 't-ink'}`}>
                      {t.type === 'revenu' ? '+' : '−'}{formatEUR(Math.abs(t.montant))}
                    </span>
                    <RowActions
                      onEdit={() => { onEdit && onEdit(t); setSelectedIso(null); }}
                      onDelete={() => { onDelete && onDelete(t.id); setSelectedIso(null); }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <JustificatifViewer
        open={!!viewingJustif}
        onClose={() => setViewingJustif(null)}
        justificatif={viewingJustif}
      />
    </div>
  );
};

// ============================================================
// REGISTRES SÉPARÉS : FRAIS DE SOCIÉTÉ / CRÉANCES
// ============================================================
// Le même composant sert aux deux rubriques. `scope` choisit le registre :
//   - 'societe'   → rubrique « Société » : TOUS les frais de société, et uniquement eux.
//                   Ces dépenses n'apparaissent dans aucune autre vue de l'application.
//   - 'proximite' → rubrique « Créances » : parts de dépenses dues par un tiers
//                   et revenus en attente liés à une dette.

const REIMB_SCOPES = {
  societe: {
    titre: 'Frais de société',
    ajouter: 'Ajouter un frais',
    doc: 'Note de frais',
    docTitre: 'Note de frais',
    objetAttente: 'Note de frais à rembourser',
    unite: 'opération',
    unitePluriel: 'opérations',
    vide: 'Aucune opération enregistrée pour le moment.',
    kpiTotal: 'Total',
    kpiAttente: 'En attente',
    kpiRegle: 'Réglé',
    filtreRegle: 'Réglés',
  },
  proximite: {
    titre: 'Créances',
    ajouter: 'Ajouter une créance',
    doc: 'Récapitulatif',
    docTitre: 'Demande de remboursement',
    objetAttente: 'Sommes à rembourser',
    unite: 'créance',
    unitePluriel: 'créances',
    vide: 'Aucune créance enregistrée pour le moment.',
    kpiTotal: 'Total',
    kpiAttente: 'En attente de remboursement',
    kpiRegle: 'Remboursé',
    filtreRegle: 'Remboursés',
  },
};

const ReimbursableView = ({ transactions, categories, affaireCatIds = [], participationCatIds = [], onUpdate, onEdit, onDelete, onAdd, onAddParticipation, scope = 'societe' }) => {
  const L = REIMB_SCOPES[scope] || REIMB_SCOPES.societe;
  const duScope = scope === 'proximite';
  const ScopeIcon = duScope ? UserIcon : Building2;
  // Montant concerné et statut « réglé » selon le registre
  const amt = (t) => (duScope ? montantDu(t, affaireCatIds, participationCatIds) : Math.abs(t.montant));
  // Réglé : dépense remboursée, ou revenu (créance, participation) reçu
  const regle = (t) => isDuRegle(t);
  const isPart = (t) => !duScope && isParticipation(t, participationCatIds);
  // Remboursement partiel : part déjà reçue et reste à recevoir
  const recuPart = (t) => (regle(t) ? amt(t) : Math.min(dejaRecu(t), amt(t)));
  const reste = (t) => amt(t) - recuPart(t);
  // Montant porté sur le document : le reste à payer tant que ce n'est pas réglé
  const docAmt = (t) => (regle(t) ? amt(t) : reste(t));
  // Société : ses dépenses (frais de société + participations versées) ; Créances : tout ce qui m'est dû
  const reimbursables = transactions.filter(t => (duScope
    ? isDu(t, affaireCatIds, participationCatIds)
    : (isSociete(t) || isParticipation(t, participationCatIds))));
  const pending = reimbursables.filter(t => !regle(t));
  const completed = reimbursables.filter(t => regle(t));
  // Note de frais / récapitulatif : uniquement les dépenses (jamais les participations)
  const docItems = reimbursables.filter(t => !isPart(t));
  const docPending = docItems.filter(t => !regle(t));
  const docCompleted = docItems.filter(t => regle(t));

  const totalPending = pending.reduce((s, t) => s + reste(t), 0);
  const totalCompleted = reimbursables.reduce((s, t) => s + recuPart(t), 0);

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';
  const getCatName = (id) => categories.find(c => c.id === id)?.name || 'Inconnue';

  // Filtres de la liste
  const [statusFilter, setStatusFilter] = useState('all'); // all | pending | paid
  const [search, setSearch] = useState('');

  const [viewingJustif, setViewingJustif] = useState(null);

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  // Filtre d'affichage dans le modal facture : "docPending" (en attente, défaut) | "paid" (déjà remboursées) | "all" (toutes)
  const [invoiceFilter, setInvoiceFilter] = useState('pending');
  const [invoice, setInvoice] = useState({
    emetteurNom: '',
    emetteurAdresse: '',
    emetteurEmail: '',
    destinataireNom: '',
    destinataireAdresse: '',
    numero: 'NDF-' + new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'),
    objet: L.objetAttente,
    selectedIds: docPending.map(t => t.id),
  });

  // À chaque ouverture du modal, on resélectionne par défaut les transactions
  // correspondant au filtre courant (et on retire les ids qui ne sont plus remboursables).
  useEffect(() => {
    setInvoice(inv => ({
      ...inv,
      selectedIds: inv.selectedIds.filter(id => docItems.some(r => r.id === id)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docItems.length]);

  // Liste affichée dans le modal selon le filtre actif
  const displayedReimb = invoiceFilter === 'pending' ? docPending
    : invoiceFilter === 'paid' ? docCompleted
    : docItems;

  // Les transactions sélectionnées peuvent être en attente OU remboursées
  const selectedTxs = docItems.filter(t => invoice.selectedIds.includes(t.id));
  const invoiceTotal = selectedTxs.reduce((s, t) => s + docAmt(t), 0);

  // Détecte si la sélection mélange en attente et remboursées (info utile pour adapter le titre)
  const selectedHasPending = selectedTxs.some(t => !regle(t));
  const selectedHasPaid = selectedTxs.some(t => regle(t));

  // Adapte automatiquement l'objet par défaut selon ce qu'on inclut.
  // On ne le fait qu'à la première ouverture pour ne pas écraser ce que l'utilisateur a tapé.
  const adaptedObjet = (() => {
    if (selectedHasPaid && !selectedHasPending) return 'Récapitulatif des dépenses remboursées';
    if (selectedHasPending && !selectedHasPaid) return 'Note de frais à rembourser';
    if (selectedHasPending && selectedHasPaid) return 'Récapitulatif des dépenses remboursables';
    return invoice.objet;
  })();

  const openInvoice = () => {
    // À l'ouverture, on présélectionne les en attente (cas d'usage dominant)
    setInvoice(inv => ({
      ...inv,
      selectedIds: docPending.map(t => t.id),
      objet: docPending.length > 0 ? L.objetAttente : 'Récapitulatif des dépenses remboursées',
    }));
    setInvoiceFilter('pending');
    setInvoiceOpen(true);
  };

  const generateInvoice = () => {
    if (selectedTxs.length === 0) return;

    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    const rows = selectedTxs
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t, i) => {
        const cats = getCatIds(t).map(id => getCatName(id)).join(', ');
        return `
          <tr>
            <td style="text-align:center;color:#78716c;">${i + 1}</td>
            <td>${escapeHtml(formatDateFR(t.date))}</td>
            <td>${escapeHtml(t.libelle)}${t.notes ? `<div style="font-size:11px;color:#78716c;margin-top:2px;">${escapeHtml(t.notes)}</div>` : ''}</td>
            <td style="color:#57534e;font-size:12px;">${escapeHtml(cats)}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:500;">${formatEUR(docAmt(t))}</td>
          </tr>`;
      }).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(invoice.numero)} — ${escapeHtml(invoice.objet)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1c1917;
    margin: 0;
    padding: 32px;
    max-width: 780px;
    margin-left: auto;
    margin-right: auto;
    font-size: 13px;
    line-height: 1.5;
  }
  h1 {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-weight: 600;
    font-size: 28px;
    margin: 0 0 4px 0;
    letter-spacing: -0.5px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1c1917;
    padding-bottom: 24px;
    margin-bottom: 24px;
  }
  .meta {
    text-align: right;
    font-size: 12px;
    color: #57534e;
  }
  .meta strong { display: block; color: #1c1917; font-size: 14px; }
  .parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin-bottom: 32px;
  }
  .party-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #78716c;
    margin-bottom: 8px;
  }
  .party-content {
    font-size: 13px;
    white-space: pre-line;
    color: #1c1917;
  }
  .party-content strong {
    display: block;
    font-size: 15px;
    margin-bottom: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #78716c;
    padding: 8px 10px;
    border-bottom: 1px solid #1c1917;
    font-weight: 600;
  }
  th:last-child { text-align: right; }
  td {
    padding: 10px;
    border-bottom: 1px solid #e7e5e4;
    vertical-align: top;
  }
  .total-row {
    background: #fafaf9;
  }
  .total-row td {
    padding: 14px 10px;
    border-bottom: none;
    border-top: 2px solid #1c1917;
    font-size: 15px;
    font-weight: 600;
  }
  .total-row td:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 18px;
  }
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #e7e5e4;
    font-size: 11px;
    color: #78716c;
    display: flex;
    justify-content: space-between;
  }
  .signature {
    margin-top: 48px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
  }
  .signature-block {
    border-top: 1px solid #1c1917;
    padding-top: 8px;
    font-size: 11px;
    color: #57534e;
  }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:16px;">
    <button onclick="window.print()" style="background:#1c1917;color:white;border:none;padding:9px 16px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:500;">
      Imprimer / Enregistrer en PDF
    </button>
  </div>

  <div class="header">
    <div>
      <h1>${selectedHasPaid && !selectedHasPending ? 'Récapitulatif' : escapeHtml(L.docTitre)}</h1>
      <div style="color:#78716c;font-size:13px;">${escapeHtml(invoice.objet)}</div>
    </div>
    <div class="meta">
      <strong>${escapeHtml(invoice.numero)}</strong>
      Émise le ${today}<br>
      ${selectedTxs.length} dépense${selectedTxs.length > 1 ? 's' : ''}${selectedHasPaid && selectedHasPending ? ' · mixte' : selectedHasPaid && !selectedHasPending ? ' · déjà remboursées' : ''}
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">Émetteur</div>
      <div class="party-content"><strong>${escapeHtml(invoice.emetteurNom || '—')}</strong>${invoice.emetteurAdresse ? escapeHtml(invoice.emetteurAdresse) : ''}${invoice.emetteurEmail ? '\n' + escapeHtml(invoice.emetteurEmail) : ''}</div>
    </div>
    <div>
      <div class="party-label">Destinataire</div>
      <div class="party-content"><strong>${escapeHtml(invoice.destinataireNom || '—')}</strong>${invoice.destinataireAdresse ? escapeHtml(invoice.destinataireAdresse) : ''}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:32px;text-align:center;">#</th>
        <th style="width:100px;">Date</th>
        <th>Libellé</th>
        <th style="width:140px;">Catégorie</th>
        <th style="width:100px;text-align:right;">Montant</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4">${selectedHasPaid && !selectedHasPending ? 'Total remboursé' : selectedHasPending && selectedHasPaid ? 'Total (à rembourser + déjà remboursé)' : 'Total à rembourser'}</td>
        <td>${formatEUR(invoiceTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="signature">
    <div class="signature-block">Date et signature de l'émetteur</div>
    <div class="signature-block">${selectedHasPaid && !selectedHasPending ? 'Document de classement / archivage' : 'Date et signature pour accord de remboursement'}</div>
  </div>

  <div class="footer">
    <span>Document généré automatiquement</span>
    <span>Page 1</span>
  </div>

  ${selectedTxs.filter(t => t.justificatif && t.justificatif.mimeType && t.justificatif.mimeType.startsWith('image/')).map((t, idx) => `
    <div style="page-break-before: always; padding-top: 16px;">
      <div style="border-bottom: 1px solid #e7e5e4; padding-bottom: 12px; margin-bottom: 16px;">
        <p style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#78716c;margin:0 0 4px;">Annexe — Justificatif n°${idx + 1}</p>
        <p style="margin:0;font-weight:600;">${escapeHtml(t.libelle)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#57534e;">${escapeHtml(formatDateFR(t.date))} · ${formatEUR(docAmt(t))}</p>
      </div>
      <img src="${t.justificatif.dataUrl}" alt="Justificatif" style="max-width:100%;max-height:80vh;display:block;margin:0 auto;border:1px solid #e7e5e4;" />
    </div>
  `).join('')}
</body>
</html>`;

    // Méthode 1 : iframe cachée + print (fonctionne dans la plupart des sandbox)
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      // Laisser le temps aux fonts/styles de charger
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          // Nettoyage différé (laisser la dialog d'impression s'afficher)
          setTimeout(() => { try { document.body.removeChild(iframe); } catch (e) {} }, 60000);
        } catch (err) {
          console.warn('Impression iframe échouée :', err);
          document.body.removeChild(iframe);
          // Bascule sur fallback téléchargement HTML
          downloadAsHtml();
        }
      }, 400);
      return;
    } catch (err) {
      console.warn('Création iframe échouée :', err);
    }

    // Fallback : télécharger le HTML pour ouverture manuelle
    function downloadAsHtml() {
      try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoice.numero || 'note-de-frais'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        alert('Le téléchargement de la facture a démarré. Ouvrez le fichier .html dans votre navigateur, puis utilisez Ctrl+P / Cmd+P pour l\'imprimer ou l\'enregistrer en PDF.');
      } catch (err) {
        console.error('Téléchargement HTML échoué :', err);
        alert('Impossible de générer la facture automatiquement. Une copie a été affichée dans la console (F12), vous pouvez la copier dans un fichier .html.');
        console.log('=== FACTURE HTML ===\n' + html);
      }
    }
    downloadAsHtml();
  };

  const toggleRembourse = (tx) => {
    // Revenu lié à une dette : « réglé » = revenu reçu. Dépense : « réglé » = remboursée.
    if (tx.type === 'revenu') onUpdate({ ...tx, recu: tx.recu === false });
    else onUpdate({ ...tx, rembourse: !tx.rembourse });
  };

  const toggleInvoiceTx = (id) => {
    setInvoice(inv => ({
      ...inv,
      selectedIds: inv.selectedIds.includes(id)
        ? inv.selectedIds.filter(x => x !== id)
        : [...inv.selectedIds, id],
    }));
  };

  // ---- Liste affichée : filtre de statut + recherche, regroupée par mois ----
  const q = search.trim().toLowerCase();
  const listed = reimbursables
    .filter(t => statusFilter === 'all' || (statusFilter === 'pending' ? !regle(t) : regle(t)))
    .filter(t => !q || [t.libelle, t.notes, t.duPar, duScope ? t.acheteur : ''].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const listedTotal = listed.reduce((s, t) => s + amt(t), 0);

  const monthGroups = [];
  listed.forEach(t => {
    const key = (t.date || '').slice(0, 7);
    let g = monthGroups[monthGroups.length - 1];
    if (!g || g.key !== key) {
      const [yy, mm] = key.split('-').map(n => parseInt(n, 10));
      const label = (yy && mm)
        ? new Date(yy, mm - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : 'Sans date';
      g = { key, label, txs: [], total: 0, pending: 0 };
      monthGroups.push(g);
    }
    g.txs.push(t);
    g.total += amt(t);
    g.pending += reste(t);
  });

  // Répartition par catégorie de la sélection affichée (parts égales si plusieurs catégories)
  const catBreakdown = (() => {
    const map = {};
    listed.forEach(t => {
      const ids = getCatIds(t).filter(id => categories.some(c => c.id === id));
      const keys = ids.length > 0 ? ids : ['__none'];
      const share = amt(t) / keys.length;
      keys.forEach(id => {
        if (!map[id]) {
          map[id] = {
            id,
            name: id === '__none' ? 'Sans catégorie' : getCatName(id),
            color: id === '__none' ? '#9c9c9c' : getCatColor(id),
            total: 0,
          };
        }
        map[id].total += share;
      });
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  })();
  const catMax = Math.max(...catBreakdown.map(c => c.total), 1);

  // Créances : montants encore en attente, par débiteur
  const personBreakdown = (() => {
    const map = {};
    pending.forEach(t => {
      const name = debiteurDe(t) || 'Non précisé';
      map[name] = (map[name] || 0) + reste(t);
    });
    return Object.keys(map).map(name => ({ name, total: map[name] })).sort((a, b) => b.total - a.total);
  })();
  const personMax = Math.max(...personBreakdown.map(p => p.total), 1);

  const plural = (n) => `${n} ${n > 1 ? L.unitePluriel : L.unite}`;

  const sideItems = duScope ? personBreakdown : catBreakdown;
  const withAnnexe = selectedTxs.filter(t => t.justificatif && t.justificatif.mimeType?.startsWith('image/')).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={L.titre}>
        <Button variant="secondary" onClick={openInvoice} disabled={docItems.length === 0}>
          <FileText size={15} /> {L.doc}
        </Button>
        <Button onClick={() => onAdd && onAdd()}>
          <Plus size={15} /> {L.ajouter}
        </Button>
      </PageHeader>

      <Strip min={220}>
        <Kpi label={L.kpiAttente} marker="var(--m-wait-2)" value={formatEUR(totalPending)} sub={plural(pending.length)} />
        <Kpi label={L.kpiRegle} marker="var(--m-ok)" value={formatEUR(totalCompleted)} sub={plural(completed.length)} />
        <Kpi label={L.kpiTotal} value={formatEUR(totalPending + totalCompleted)} sub={plural(reimbursables.length)} />
      </Strip>

      <div className="flex flex-wrap gap-4 items-start">
        {/* Liste complète, regroupée par mois */}
        <Card className="overflow-hidden min-w-0" style={{ flex: '999 1 560px' }}>
          <div className="flex flex-wrap items-center gap-2 px-3 md:px-4 py-3">
            <Seg
              label="Statut"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { id: 'all', label: 'Tous', count: reimbursables.length },
                { id: 'pending', label: 'En attente', count: pending.length },
                { id: 'paid', label: L.filtreRegle, count: completed.length },
              ]}
            />
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 180px' }} />
            {listed.length > 0 && (
              <span className="f-num t-muted ml-auto">
                {plural(listed.length)} · <span className="font-medium t-ink">{formatEUR(listedTotal)}</span>
              </span>
            )}
          </div>

          {listed.length === 0 ? (
            <p className="t-muted text-center px-4 py-10" style={{ borderTop: '1px solid var(--line-soft)' }}>
              {reimbursables.length === 0 ? L.vide : 'Aucun résultat pour ce filtre.'}
            </p>
          ) : (
            monthGroups.map(g => (
              <div key={g.key}>
                <div className="f-group-h">
                  <span><span className="font-semibold t-ink first-letter:uppercase">{libelleMois(g.key)}</span><span className="t-muted"> · {plural(g.txs.length)}</span></span>
                  <span className="f-num">
                    <span className="font-medium t-ink">{formatEUR(g.total)}</span>
                    {g.pending > 0 && <span className="t-warn"> · dont {formatEUR(g.pending)} en attente</span>}
                  </span>
                </div>
                {g.txs.map((t, i) => (
                  <div key={t.id} className={`f-row f-entry ${i > 0 ? 'f-line' : ''}`}>
                    <IconButton
                      label={regle(t) ? (isPart(t) ? 'Marquer comme non versée' : 'Annuler le remboursement') : (isPart(t) ? 'Marquer comme versée' : 'Marquer comme remboursé')}
                      onClick={() => toggleRembourse(t)}
                      className="f-toggle-st"
                      style={{ color: regle(t) ? 'var(--pos)' : 'var(--muted)' }}
                    >
                      {regle(t) ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                    </IconButton>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`truncate font-medium ${regle(t) ? 't-muted' : 't-ink'}`}>{t.libelle}</span>
                        {t.justificatif && <JustifButton onClick={() => setViewingJustif(t.justificatif)} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs t-muted min-w-0">
                        <span className="f-num">{formatDateFR(t.date)}</span>
                        {duScope && debiteurDe(t) && <span className="font-medium t-ink2">{debiteurDe(t)}</span>}
                        {!regle(t) && recuPart(t) > 0 && (
                          <span className="f-num t-warn">reçu {formatEUR(recuPart(t))} · reste {formatEUR(reste(t))}</span>
                        )}
                        {duScope && t.type !== 'revenu' && amt(t) < Math.abs(t.montant) && (
                          <span className="f-num">sur {formatEUR(Math.abs(t.montant))}</span>
                        )}
                        {getCatIds(t).slice(0, 2).map(id => {
                          const cat = categories.find(c => c.id === id);
                          if (!cat) return null;
                          return (
                            <span key={id} className="inline-flex items-center gap-1.5">
                              <span className="f-sq" style={{ width: 7, height: 7, backgroundColor: cat.color }} />
                              {cat.name}
                            </span>
                          );
                        })}
                        {getCatIds(t).length > 2 && <span className="t-faint">+{getCatIds(t).length - 2}</span>}
                        {t.notes && <span className="truncate t-faint max-w-full">{t.notes}</span>}
                      </div>
                    </div>
                    <span className={`hidden sm:inline-flex f-badge ${regle(t) ? 'f-b-ok' : 'f-b-wait'}`}>
                      {regle(t) ? (isPart(t) ? 'Versée' : 'Remboursé') : (recuPart(t) > 0 ? 'Partiel' : 'En attente')}
                    </span>
                    <span className={`f-num text-right font-medium ${regle(t) ? 't-muted' : 't-ink'}`}>
                      {formatEUR(amt(t))}
                    </span>
                    <RowActions onEdit={() => onEdit && onEdit(t)} onDelete={() => onDelete && onDelete(t.id)} />
                  </div>
                ))}
              </div>
            ))
          )}
        </Card>

        {/* Répartition : par débiteur (Créances) ou par catégorie (Société) */}
        {sideItems.length > 0 && (
          <Card className="min-w-0" style={{ flex: '1 1 300px' }}>
            <PanelHead title={duScope ? 'En attente par débiteur' : 'Par catégorie'} />
            <div className="flex flex-col gap-3 px-4 pt-3.5 pb-4">
              {(duScope ? personBreakdown : catBreakdown).map(item => {
                const total = item.total;
                const max = duScope ? personMax : catMax;
                const color = duScope ? 'var(--m-wait)' : item.color;
                return (
                  <div key={duScope ? item.name : item.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 min-w-0">
                        {duScope
                          ? <UserIcon size={13} className="t-muted shrink-0" />
                          : <span className="f-sq" style={{ backgroundColor: color }} />}
                        <span className="truncate t-ink">{item.name}</span>
                      </span>
                      <span className="f-num font-medium t-ink">{formatEUR(total)}</span>
                    </div>
                    <span className="f-track"><span style={{ width: `${(total / max) * 100}%`, background: color }} /></span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title={L.doc}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvoiceOpen(false)}>Annuler</Button>
            <Button onClick={generateInvoice} disabled={selectedTxs.length === 0}>
              <FileText size={15} /> Générer le document
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="f-doc-head">
            <Field label="N° du document">
              <Input value={invoice.numero} onChange={(e) => setInvoice({ ...invoice, numero: e.target.value })} className="f-num" />
            </Field>
            <Field label="Objet">
              <Input value={invoice.objet} onChange={(e) => setInvoice({ ...invoice, objet: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <fieldset className="flex flex-col gap-2 min-w-0">
              <legend className="f-label mb-2">Émetteur</legend>
              <Input
                value={invoice.emetteurNom}
                onChange={(e) => setInvoice({ ...invoice, emetteurNom: e.target.value })}
                placeholder="Nom complet"
                aria-label="Nom de l'émetteur"
              />
              <textarea
                value={invoice.emetteurAdresse}
                onChange={(e) => setInvoice({ ...invoice, emetteurAdresse: e.target.value })}
                placeholder="Adresse postale"
                aria-label="Adresse de l'émetteur"
                rows={2}
                className="f-field resize-none"
              />
              <Input
                value={invoice.emetteurEmail}
                onChange={(e) => setInvoice({ ...invoice, emetteurEmail: e.target.value })}
                placeholder="E-mail"
                aria-label="E-mail de l'émetteur"
                type="email"
              />
            </fieldset>
            <fieldset className="flex flex-col gap-2 min-w-0">
              <legend className="f-label mb-2">Destinataire</legend>
              <Input
                value={invoice.destinataireNom}
                onChange={(e) => setInvoice({ ...invoice, destinataireNom: e.target.value })}
                placeholder="Entreprise ou personne"
                aria-label="Nom du destinataire"
              />
              <textarea
                value={invoice.destinataireAdresse}
                onChange={(e) => setInvoice({ ...invoice, destinataireAdresse: e.target.value })}
                placeholder="Adresse postale"
                aria-label="Adresse du destinataire"
                rows={2}
                className="f-field resize-none"
              />
            </fieldset>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="f-label">Dépenses à inclure</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Seg
                  label="Filtre"
                  value={invoiceFilter}
                  onChange={setInvoiceFilter}
                  options={[
                    { id: 'pending', label: 'En attente', count: docPending.length },
                    { id: 'paid', label: 'Remboursées', count: docCompleted.length },
                    { id: 'all', label: 'Toutes', count: docItems.length },
                  ]}
                />
                <Button size="sm" variant="ghost" onClick={() => setInvoice({ ...invoice, selectedIds: displayedReimb.map(t => t.id) })}>
                  Tout cocher
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setInvoice({ ...invoice, selectedIds: [] })}>
                  Tout décocher
                </Button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--line)' }}>
              {displayedReimb.length === 0 ? (
                <p className="t-muted p-5 text-center">
                  {invoiceFilter === 'pending' && 'Aucune dépense en attente.'}
                  {invoiceFilter === 'paid' && 'Aucune dépense déjà remboursée.'}
                  {invoiceFilter === 'all' && 'Aucune dépense remboursable.'}
                </p>
              ) : displayedReimb.map((t, i) => {
                const checked = invoice.selectedIds.includes(t.id);
                return (
                  <label key={t.id} className={`f-row f-pickrow ${i > 0 ? 'f-line' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInvoiceTx(t.id)}
                      className="f-check"
                    />
                    <span className="min-w-0 flex flex-col gap-0.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-medium t-ink">{t.libelle}</span>
                        <span className={`f-badge ${regle(t) ? 'f-b-ok' : 'f-b-wait'}`}>{regle(t) ? 'Remboursée' : 'En attente'}</span>
                        {t.justificatif && <Paperclip size={12} className="t-muted shrink-0" aria-label="Facture jointe" />}
                      </span>
                      <span className="text-xs t-muted f-num">{formatDateFR(t.date)}</span>
                    </span>
                    <span className="f-num font-medium t-ink">{formatEUR(docAmt(t))}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-lg" style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
            <span className="flex flex-col gap-0.5">
              <span className="t-ink3">
                {selectedHasPaid && !selectedHasPending ? 'Total remboursé' : selectedHasPending && selectedHasPaid ? 'Total à rembourser et déjà remboursé' : 'Total à rembourser'}
              </span>
              <span className="flex flex-wrap items-center gap-x-2.5 text-xs t-muted f-num">
                <span>{selectedTxs.length} dépense{selectedTxs.length > 1 ? 's' : ''}</span>
                {withAnnexe > 0 && (
                  <span className="inline-flex items-center gap-1"><Paperclip size={11} /> {withAnnexe} facture{withAnnexe > 1 ? 's' : ''} en annexe</span>
                )}
              </span>
            </span>
            <span className="f-num text-[22px] font-semibold tracking-tight t-ink">{formatEUR(invoiceTotal)}</span>
          </div>
        </div>
      </Modal>

      <JustificatifViewer
        open={!!viewingJustif}
        onClose={() => setViewingJustif(null)}
        justificatif={viewingJustif}
      />
    </div>
  );
};

// ============================================================
// AFFAIRES — achat-revente par projet
// ============================================================
// Vue dédiée aux transactions de la catégorie « Affaires » (elles restent par ailleurs
// des transactions ordinaires, visibles dans les autres rubriques).
// Dépense = achat ou frais ; revenu = vente, avec acheteur (`acheteur`), quantité
// (`quantite`), réduction (`reduction`), encaissement (`recu`) et montant déjà reçu
// (`dejaRecu`). Une vente peut être à 0 €. Un achat peut porter une quantité achetée.
// Le projet (`affaire`) est facultatif ; son taux de marge visé est stocké à part
// (projetsMeta) et donne la marge espérée et le CA recherché :
//   marge espérée = achats × taux ; CA recherché = achats + marge espérée.

const SANS_PROJET = 'Sans projet';

// Petit indicateur (libellé + valeur) de l'en-tête d'un projet
const AffStat = ({ label, tone = 't-ink', children }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs t-muted">{label}</span>
    <div className={`f-num text-sm font-semibold ${tone}`}>{children}</div>
  </div>
);

const AffairesView = ({ transactions, categories, affaireCatIds = [], projetsMeta = {}, onSetTauxMarge, onUpdate, onEdit, onDelete, onAdd }) => {
  const all = transactions.filter(t => !isSociete(t) && isAffaire(t, affaireCatIds));
  const [projetFilter, setProjetFilter] = useState('all');
  const [acheteurFilter, setAcheteurFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all | paid | pending (ventes)
  const [search, setSearch] = useState('');
  const [viewingJustif, setViewingJustif] = useState(null);
  const [tauxEdit, setTauxEdit] = useState(null); // { nom, valeur } pendant la saisie du taux

  const abs = (t) => Math.abs(Number(t.montant) || 0);
  const isVente = (t) => t.type === 'revenu';
  // Une vente à 0 € n'a rien à encaisser
  const encaisse = (t) => t.recu !== false || abs(t) === 0;
  const reste = (t) => (encaisse(t) ? 0 : Math.max(0, abs(t) - dejaRecu(t)));
  const qte = (t) => { const n = Number(t.quantite); return n > 0 ? n : 0; };
  const nomProjet = (t) => (t.affaire || '').trim() || SANS_PROJET;
  const nomAcheteur = (t) => (t.acheteur || '').trim();
  const sortFr = (arr) => arr.sort((a, b) => a.localeCompare(b, 'fr'));
  // Taux de marge visé, en % du coût d'achat (reprise d'une ancienne marge espérée saisie en €)
  const tauxDe = (nom, achats) => {
    const m = projetsMeta[nom] || {};
    const t = Number(m.tauxMarge);
    if (t > 0) return t;
    const ancienne = Number(m.margeEsperee);
    return ancienne > 0 && achats > 0 ? (ancienne / achats) * 100 : 0;
  };
  const formatTaux = (t) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(t)} %`;

  const projetsNoms = sortFr(Array.from(new Set(all.map(nomProjet))));
  const activeProjet = projetsNoms.includes(projetFilter) ? projetFilter : 'all';
  // Périmètre des indicateurs : le projet sélectionné, ou tous
  const scoped = all.filter(t => activeProjet === 'all' || nomProjet(t) === activeProjet);
  const acheteursNoms = sortFr(Array.from(new Set(scoped.filter(isVente).map(nomAcheteur).filter(Boolean))));
  const activeAcheteur = acheteursNoms.includes(acheteurFilter) ? acheteurFilter : 'all';

  const sum = (arr, f = abs) => arr.reduce((s, t) => s + f(t), 0);
  const totalAchats = sum(scoped.filter(t => !isVente(t)));
  const totalVentes = sum(scoped.filter(isVente));
  const totalAttente = sum(scoped.filter(isVente), reste);
  const nbAttente = scoped.filter(t => isVente(t) && reste(t) > 0).length;
  const marge = totalVentes - totalAchats;

  // Lignes listées : les filtres acheteur / encaissement / recherche ne touchent que la liste,
  // les totaux d'un projet restent calculés sur le projet entier.
  const q = search.trim().toLowerCase();
  const matches = (t) => {
    if (activeAcheteur !== 'all' && !(isVente(t) && nomAcheteur(t) === activeAcheteur)) return false;
    if (statusFilter !== 'all' && !(isVente(t) && (statusFilter === 'paid') === (reste(t) === 0))) return false;
    if (q && ![t.libelle, t.notes, t.affaire, t.acheteur].some(v => (v || '').toLowerCase().includes(q))) return false;
    return true;
  };
  const filtering = activeAcheteur !== 'all' || statusFilter !== 'all' || !!q;

  const projets = projetsNoms
    .filter(nom => activeProjet === 'all' || nom === activeProjet)
    .map(nom => {
      const txs = all.filter(t => nomProjet(t) === nom).sort((a, b) => b.date.localeCompare(a.date));
      const ventes = txs.filter(isVente);
      const achats = txs.filter(t => !isVente(t));
      const totAchats = sum(achats);
      const totVentes = sum(ventes);
      const taux = nom === SANS_PROJET ? 0 : tauxDe(nom, totAchats);
      const esperee = totAchats * taux / 100;
      const caRecherche = taux > 0 ? totAchats + esperee : 0;
      // Unités : possédées = quantités saisies sur les achats ; vendues = quantités des ventes (1 par défaut)
      const possedees = achats.reduce((s, t) => s + qte(t), 0);
      const vendues = ventes.reduce((s, t) => s + (qte(t) || 1), 0);
      const restantes = Math.max(0, possedees - vendues);
      const caManquant = caRecherche - totVentes;
      return {
        nom,
        lignes: txs.filter(matches),
        nbAchats: achats.length,
        nbVentes: ventes.length,
        achats: totAchats,
        ventes: totVentes,
        attente: sum(ventes, reste),
        taux,
        esperee,
        caRecherche,
        possedees,
        vendues,
        restantes,
        caAtteint: caRecherche > 0 && caManquant <= 0,
        // prix moyen à obtenir sur chaque unité restante pour atteindre le CA recherché
        prixCible: caRecherche > 0 && caManquant > 0 && restantes > 0 ? caManquant / restantes : 0,
        dernier: txs[0] ? txs[0].date : '',
      };
    })
    .filter(p => !filtering || p.lignes.length > 0)
    .sort((a, b) => b.dernier.localeCompare(a.dernier));
  const totalEsperee = projets.reduce((s, p) => s + p.esperee, 0);
  const totalCaRecherche = projets.reduce((s, p) => s + p.caRecherche, 0);

  // Synthèse par acheteur (sur le périmètre des indicateurs)
  const acheteurs = (() => {
    const map = {};
    scoped.filter(isVente).forEach(t => {
      const nom = nomAcheteur(t) || 'Non précisé';
      if (!map[nom]) map[nom] = { nom, total: 0, attente: 0, nb: 0 };
      map[nom].total += abs(t);
      map[nom].nb += 1;
      map[nom].attente += reste(t);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  })();
  const acheteurMax = Math.max(...acheteurs.map(a => a.total), 1);

  const signed = (n) => `${n >= 0 ? '+' : '−'}${formatEUR(Math.abs(n))}`;
  const chipClass = (active) => `no-touch-grow inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition whitespace-nowrap ${
    active ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
  }`;

  const saveTaux = () => {
    if (!tauxEdit) return;
    const v = parseFloat(String(tauxEdit.valeur).replace(',', '.').replace('%', ''));
    if (onSetTauxMarge) onSetTauxMarge(tauxEdit.nom, v > 0 ? Math.round(v * 100) / 100 : 0);
    setTauxEdit(null);
  };

  // Encaissement complet d'une vente (le montant partiel déjà reçu n'a alors plus d'objet)
  const toggleEncaisse = (t) => {
    const { dejaRecu: _partiel, ...rest } = t;
    onUpdate(encaisse(t) ? { ...t, recu: false } : { ...rest, recu: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Affaires">
        <Button onClick={() => onAdd && onAdd(activeProjet === 'all' || activeProjet === SANS_PROJET ? '' : activeProjet)}>
          <Plus size={15} /> Ajouter
        </Button>
      </PageHeader>

      {projetsNoms.length > 1 && (
        <div className="f-tabs" role="tablist" aria-label="Projets">
          <button type="button" role="tab" aria-selected={activeProjet === 'all'} onClick={() => setProjetFilter('all')} className={`f-tab no-touch-grow ${activeProjet === 'all' ? 'on' : ''}`}>
            Tous les projets
          </button>
          {projetsNoms.map(nom => (
            <button key={nom} type="button" role="tab" aria-selected={activeProjet === nom} onClick={() => setProjetFilter(nom)} className={`f-tab no-touch-grow ${activeProjet === nom ? 'on' : ''}`}>
              {nom}
            </button>
          ))}
        </div>
      )}

      <Strip min={200}>
        <Kpi label="Achats" value={formatEUR(totalAchats)} />
        <Kpi
          label="Ventes"
          value={formatEUR(totalVentes)}
          valueClass="t-pos"
          sub={totalCaRecherche > 0 ? `CA recherché ${formatEUR(totalCaRecherche)}` : undefined}
        />
        <Kpi
          label="Marge"
          value={signed(marge)}
          valueClass={marge >= 0 ? 't-ink' : 't-neg'}
          sub={totalEsperee > 0 ? `Espérée ${signed(totalEsperee)}` : undefined}
        />
        <Kpi
          label="À encaisser"
          marker="var(--m-wait-2)"
          value={formatEUR(totalAttente)}
          sub={`${nbAttente} vente${nbAttente > 1 ? 's' : ''}`}
        />
      </Strip>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0" style={{ flex: '999 1 560px' }}>
          {all.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Seg
                label="Encaissement"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { id: 'all', label: 'Tout' },
                  { id: 'paid', label: 'Encaissé' },
                  { id: 'pending', label: 'En attente' },
                ]}
              />
              <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 200px' }} />
              {activeAcheteur !== 'all' && (
                <Button variant="secondary" onClick={() => setAcheteurFilter('all')}>
                  <X size={13} /> {activeAcheteur}
                </Button>
              )}
            </div>
          )}

          {all.length === 0 ? (
            <Card><p className="t-muted text-center px-4 py-10">Aucune affaire enregistrée pour le moment.</p></Card>
          ) : projets.length === 0 ? (
            <Card><p className="t-muted text-center px-4 py-10">Aucun résultat pour ce filtre.</p></Card>
          ) : projets.map(p => {
            const margeProjet = p.ventes - p.achats;
            const editing = tauxEdit && tauxEdit.nom === p.nom;
            const startEdit = () => setTauxEdit({ nom: p.nom, valeur: p.taux > 0 ? String(Math.round(p.taux * 100) / 100).replace('.', ',') : '' });
            return (
              <Card key={p.nom} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-4">
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[15px] font-semibold t-ink">{p.nom}</h2>
                      {p.attente > 0 && <PendingBadge label={`${formatMontantCourt(p.attente)} à encaisser`} />}
                    </div>
                    <span className="t-muted">
                      {p.nbAchats} achat{p.nbAchats > 1 ? 's' : ''} · {p.nbVentes} vente{p.nbVentes > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-start gap-x-7 gap-y-2 sm:justify-end sm:text-right">
                    <AffStat label="Achats">{formatEUR(p.achats)}</AffStat>
                    <AffStat label="Ventes" tone="t-pos">{formatEUR(p.ventes)}</AffStat>
                    {p.caRecherche > 0 && <AffStat label="CA recherché">{formatEUR(p.caRecherche)}</AffStat>}
                    <AffStat label="Marge" tone={margeProjet >= 0 ? 't-ink' : 't-neg'}>{signed(margeProjet)}</AffStat>
                    {p.nom !== SANS_PROJET && (
                      <AffStat label="Marge espérée">
                        {p.taux > 0 ? (
                          <button
                            type="button"
                            onClick={startEdit}
                            title="Modifier le taux de marge"
                            className="no-touch-grow inline-flex items-center gap-1.5 hover:opacity-70"
                          >
                            {signed(p.esperee)}
                            <span className="text-xs font-normal t-muted">{formatTaux(p.taux)}</span>
                            <Pencil size={11} className="t-muted" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={startEdit}
                            className="no-touch-grow inline-flex items-center gap-1 font-medium t-ink3 hover:opacity-70"
                          >
                            <Plus size={12} /> Taux
                          </button>
                        )}
                      </AffStat>
                    )}
                  </div>
                </div>

                {/* Saisie du taux de marge visé */}
                {editing && (
                  <div className="flex items-center gap-2 flex-wrap justify-end px-4 pb-4">
                    <span className="f-label">Taux de marge (%)</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={tauxEdit.valeur}
                      onChange={(e) => setTauxEdit({ nom: p.nom, valeur: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveTaux(); if (e.key === 'Escape') setTauxEdit(null); }}
                      placeholder="30"
                      autoFocus
                      className="f-num"
                      style={{ width: 96 }}
                    />
                    <Button size="sm" onClick={saveTaux}><Check size={14} /> OK</Button>
                    <Button size="sm" variant="ghost" onClick={() => setTauxEdit(null)}>Annuler</Button>
                  </div>
                )}

                {/* Progression vers le CA recherché et unités vendues / possédées */}
                {(p.caRecherche > 0 || p.possedees > 0 || p.vendues > 0) && (
                  <div className="flex flex-col gap-2 px-4 pb-4">
                    {p.caRecherche > 0 && (
                      <div className="flex items-center gap-3">
                        <span className="flex-1"><ProgressBar value={Math.max(0, p.ventes)} max={p.caRecherche} color={p.caAtteint ? 'var(--m-ok)' : 'var(--ink)'} /></span>
                        <span className="text-xs t-ink3 f-num shrink-0">
                          {Math.round((p.ventes / p.caRecherche) * 100)} % du CA recherché
                        </span>
                      </div>
                    )}
                    {(p.possedees > 0 || p.vendues > 0) && (
                      <p className="t-ink3 f-num">
                        {p.possedees > 0 ? (
                          <>
                            <span className="font-medium t-ink">
                              {formatMontantCourt(p.vendues, false)} / {formatMontantCourt(p.possedees, false)}
                            </span>{' '}
                            unité{p.possedees > 1 ? 's' : ''} vendue{p.possedees > 1 ? 's' : ''}
                            {p.restantes > 0 && <> · {formatMontantCourt(p.restantes, false)} restante{p.restantes > 1 ? 's' : ''}</>}
                          </>
                        ) : (
                          <>
                            <span className="font-medium t-ink">{formatMontantCourt(p.vendues, false)}</span>{' '}
                            unité{p.vendues > 1 ? 's' : ''} vendue{p.vendues > 1 ? 's' : ''}
                          </>
                        )}
                        {p.prixCible > 0 && (
                          <> · à vendre <span className="font-medium t-ink">{formatEUR(p.prixCible)}</span> l’unité pour le CA recherché</>
                        )}
                        {p.caAtteint && <> · <span className="font-medium t-pos">CA recherché atteint</span></>}
                      </p>
                    )}
                  </div>
                )}

                {p.lignes.map(t => {
                  const vente = isVente(t);
                  const ok = encaisse(t);
                  const gratuit = vente && abs(t) === 0;
                  const partiel = vente && !ok && dejaRecu(t) > 0;
                  const reduction = Number(t.reduction) > 0 ? Number(t.reduction) : 0;
                  return (
                    <div key={t.id} className="f-row f-entry f-line">
                      {vente && !gratuit ? (
                        <IconButton
                          label={ok ? 'Marquer comme non encaissé' : 'Marquer comme encaissé'}
                          onClick={() => toggleEncaisse(t)}
                          className="f-toggle-st"
                          style={{ color: ok ? 'var(--pos)' : 'var(--muted)' }}
                        >
                          {ok ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                        </IconButton>
                      ) : (
                        <span className="w-7 flex justify-center t-muted" title={vente ? 'Vente' : 'Achat'}>
                          {vente ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        </span>
                      )}
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate font-medium t-ink">{t.libelle}</span>
                          {t.justificatif && <JustifButton onClick={() => setViewingJustif(t.justificatif)} />}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs t-muted min-w-0">
                          <span className="f-num">{formatDateFR(t.date)}</span>
                          <span>{vente ? 'Vente' : 'Achat'}</span>
                          {qte(t) > 0 && <span className="f-num font-medium t-ink2">× {formatMontantCourt(qte(t), false)}</span>}
                          {vente && nomAcheteur(t) && <span className="font-medium t-ink2">{nomAcheteur(t)}</span>}
                          {vente && reduction > 0 && <span className="f-num">réduction {formatEUR(reduction)}</span>}
                          {partiel && <span className="f-num t-warn">reçu {formatEUR(dejaRecu(t))} · reste {formatEUR(reste(t))}</span>}
                          {t.notes && <span className="truncate t-faint max-w-full">{t.notes}</span>}
                        </div>
                      </div>
                      {vente && !gratuit ? (
                        <span className={`hidden sm:inline-flex f-badge ${ok ? 'f-b-ok' : 'f-b-wait'}`}>
                          {ok ? 'Encaissé' : (partiel ? 'Partiel' : 'En attente')}
                        </span>
                      ) : <span className="hidden sm:block" />}
                      <span className={`f-num text-right font-medium ${vente ? 't-pos' : 't-ink'}`}>
                        {vente ? '+' : '−'}{formatEUR(abs(t))}
                      </span>
                      <RowActions onEdit={() => onEdit && onEdit(t)} onDelete={() => onDelete && onDelete(t.id)} />
                    </div>
                  );
                })}

                <div className="px-2.5 py-2 f-line">
                  <Button size="sm" variant="ghost" onClick={() => onAdd && onAdd(p.nom === SANS_PROJET ? '' : p.nom)}>
                    <Plus size={14} /> Ajouter à ce projet
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Acheteurs */}
        {acheteurs.length > 0 && (
          <Card className="min-w-0" style={{ flex: '1 1 300px' }}>
            <PanelHead title="Acheteurs">
              <span className="flex items-center gap-2.5 text-xs t-ink3">
                <span className="inline-flex items-center gap-1.5"><span className="f-sq" style={{ background: 'var(--m-ok)' }} />Encaissé</span>
                <span className="inline-flex items-center gap-1.5"><span className="f-sq" style={{ background: 'var(--m-wait)' }} />En attente</span>
              </span>
            </PanelHead>
            <div className="flex flex-col p-1.5">
              {acheteurs.map(a => {
                const selectable = a.nom !== 'Non précisé';
                const active = activeAcheteur === a.nom;
                return (
                  <button
                    key={a.nom}
                    type="button"
                    disabled={!selectable}
                    onClick={() => setAcheteurFilter(active ? 'all' : a.nom)}
                    aria-pressed={active}
                    className={`f-buyer no-touch-grow ${active ? 'on' : ''}`}
                  >
                    <span className="truncate font-medium t-ink">{a.nom}</span>
                    <span className="f-num text-right font-medium t-ink">{formatEUR(a.total)}</span>
                    <span className="col-span-2 flex gap-0.5 h-1.5">
                      {a.total - a.attente > 0 && <span className="rounded-sm" style={{ flex: `${a.total - a.attente} 1 0px`, background: 'var(--m-ok)' }} />}
                      {a.attente > 0 && <span className="rounded-sm" style={{ flex: `${a.attente} 1 0px`, background: 'var(--m-wait)' }} />}
                      {acheteurMax - a.total > 0 && <span style={{ flex: `${acheteurMax - a.total} 1 0px` }} />}
                    </span>
                    {a.attente > 0 && <span className="col-span-2 text-xs f-num t-warn">{formatEUR(a.attente)} en attente</span>}
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <JustificatifViewer
        open={!!viewingJustif}
        onClose={() => setViewingJustif(null)}
        justificatif={viewingJustif}
      />
    </div>
  );
};

// ============================================================
// ANALYSE PAR CATÉGORIE
// ============================================================

const CategoryAnalytics = ({ transactions, categories, tab, period }) => {
  // Période active
  const periodFilter = useMemo(() => {
    const now = new Date();
    if (period === 'month') return startOfMonth(now);
    if (period === 'quarter') return startOfMonth(addMonths(now, -2));
    if (period === 'year') return startOfMonth(addMonths(now, -11));
    return null;
  }, [period]);

  // Note : les frais de société et les montants dus par des tiers sont déjà retirés
  // en amont (visibleTransactions dans App). On ne refiltre pas ici.
  const filtered = useMemo(() => transactions.filter(t => {
    if (tab !== 'all' && t.type !== tab) return false;
    if (periodFilter && new Date(t.date) < periodFilter) return false;
    return true;
  }), [transactions, tab, periodFilter]);

  // Agrégation : pour chaque catégorie, total dépenses + total revenus + nb transactions
  const catData = useMemo(() => {
    const map = {};
    categories.forEach(c => {
      map[c.id] = { id: c.id, name: c.name, color: c.color, depenses: 0, revenus: 0, nbDepenses: 0, nbRevenus: 0 };
    });
    filtered.forEach(t => {
      const ids = getCatIds(t);
      if (ids.length === 0) return;
      const share = Math.abs(t.montant) / ids.length;
      ids.forEach(id => {
        if (!map[id]) return;
        if (t.type === 'revenu') {
          map[id].revenus += share;
          map[id].nbRevenus += 1 / ids.length;
        } else {
          map[id].depenses += share;
          map[id].nbDepenses += 1 / ids.length;
        }
      });
    });
    return Object.values(map)
      .map(c => ({
        ...c,
        total: c.depenses + c.revenus,
        net: c.revenus - c.depenses,
        nb: Math.round(c.nbDepenses + c.nbRevenus),
      }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [filtered, categories]);

  const totalDepenses = catData.reduce((s, c) => s + c.depenses, 0);
  const totalRevenus = catData.reduce((s, c) => s + c.revenus, 0);
  const maxValue = Math.max(...catData.map(c => Math.max(c.depenses, c.revenus)), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Total dépenses</p>
          <p className="font-serif text-2xl text-stone-900 mt-1">{formatEUR(totalDepenses)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Total revenus</p>
          <p className="font-serif text-2xl text-emerald-700 mt-1">{formatEUR(totalRevenus)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] md:text-xs uppercase tracking-wider text-stone-500">Solde</p>
          <p className={`font-serif text-2xl mt-1 ${totalRevenus - totalDepenses >= 0 ? 'text-stone-900' : 'text-rose-700'}`}>
            {formatEUR(totalRevenus - totalDepenses)}
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 mb-4">Détail par catégorie</h3>
        {catData.length === 0 ? (
          <p className="text-stone-500 text-sm py-4 text-center">Aucune transaction sur la période sélectionnée.</p>
        ) : (
          <div className="space-y-1.5">
            {catData.map(c => {
              const showDep = tab !== 'revenu' && c.depenses > 0;
              const showRev = tab !== 'dépense' && c.revenus > 0;
              return (
                <div key={c.id} className="py-3 row-flat border-b border-stone-200 last:border-b-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <p className="font-medium text-stone-900 flex-1">{c.name}</p>
                    <span className="text-xs text-stone-500">{c.nb} tx</span>
                    {(tab === 'all' && c.depenses > 0 && c.revenus > 0) && (
                      <span className={`font-serif text-base tabular-nums ${c.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {c.net >= 0 ? '+' : '−'}{formatEUR(Math.abs(c.net))}
                      </span>
                    )}
                  </div>

                  {showDep && (
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-stone-500 w-16 shrink-0">Dépenses</span>
                      <div className="flex-1 h-2 bg-white rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(c.depenses / maxValue) * 100}%`, backgroundColor: c.color, opacity: 0.85 }}
                        />
                      </div>
                      <span className="font-medium text-sm tabular-nums text-stone-900 w-24 text-right">
                        {formatEUR(c.depenses)}
                      </span>
                    </div>
                  )}

                  {showRev && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase tracking-wider text-emerald-700 w-16 shrink-0">Revenus</span>
                      <div className="flex-1 h-2 bg-white rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all"
                          style={{ width: `${(c.revenus / maxValue) * 100}%` }}
                        />
                      </div>
                      <span className="font-medium text-sm tabular-nums text-emerald-700 w-24 text-right">
                        {formatEUR(c.revenus)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Donut comparatif si "tout" */}
      {tab === 'all' && catData.some(c => c.depenses > 0) && catData.some(c => c.revenus > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 mb-4">Répartition des dépenses</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={catData.filter(c => c.depenses > 0).map(c => ({ name: c.name, value: Math.round(c.depenses * 100) / 100, color: c.color }))}
                    cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value"
                  >
                    {catData.filter(c => c.depenses > 0).map((c, idx) => (
                      <Cell key={idx} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 mb-4">Répartition des revenus</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={catData.filter(c => c.revenus > 0).map(c => ({ name: c.name, value: Math.round(c.revenus * 100) / 100, color: c.color }))}
                    cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value"
                  >
                    {catData.filter(c => c.revenus > 0).map((c, idx) => (
                      <Cell key={idx} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// ============================================================
// PAGE CATÉGORIES (analyse + gestion)
// ============================================================

const CategoriesPage = ({ transactions, allTransactions, categories, onCategoriesChange }) => {
  const [tab, setTab] = useState('stats'); // stats | manage
  const [filterType, setFilterType] = useState('all'); // all | dépense | revenu
  const [period, setPeriod] = useState('all'); // all | month | quarter | year

  return (
    <div className="space-y-4">
      {/* Ligne 1 : Analyse/Gérer (icônes seules) + Tout/Dépenses/Revenus (visible quand stats actif) */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="seg flex items-center gap-0.5">
          <button
            onClick={() => setTab('stats')}
            title="Analyse"
            aria-label="Analyse"
            className={`inline-flex items-center justify-center w-9 h-8 rounded-lg transition ${
              tab === 'stats' ? 'bg-stone-900 text-stone-50' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <BarChart3 size={15} />
          </button>
          <button
            onClick={() => setTab('manage')}
            title="Gérer"
            aria-label="Gérer"
            className={`inline-flex items-center justify-center w-9 h-8 rounded-lg transition ${
              tab === 'manage' ? 'bg-stone-900 text-stone-50' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Settings size={15} />
          </button>
        </div>

        {tab === 'stats' && (
          <div className="seg flex items-center gap-0.5">
            {[
              { id: 'all', label: 'Tout' },
              { id: 'dépense', label: 'Dépenses' },
              { id: 'revenu', label: 'Revenus' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setFilterType(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  filterType === t.id ? 'bg-stone-900 text-stone-50' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ligne 2 : sélecteur de temporalité, pleine largeur (uniquement si stats actif) */}
      {tab === 'stats' && (
        <div className="seg flex items-stretch w-full gap-0.5">
          {[
            { id: 'all', label: 'Tout l\'historique' },
            { id: 'year', label: '12 mois' },
            { id: 'quarter', label: '3 mois' },
            { id: 'month', label: 'Ce mois' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                period === p.id ? 'bg-stone-900 text-stone-50' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'stats' && <CategoryAnalytics transactions={transactions} categories={categories} tab={filterType} period={period} />}
      {tab === 'manage' && <CategoriesView categories={categories} transactions={allTransactions} onCategoriesChange={onCategoriesChange} />}
    </div>
  );
};

// ============================================================
// CATÉGORIES (gestion)
// ============================================================

const CategoriesView = ({ categories, transactions, onCategoriesChange, embedded = false }) => {
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', color: '#84a98c' });
  const [deleteAsk, setDeleteAsk] = useState(null);
  const [reassignTo, setReassignTo] = useState('');
  const [showAll, setShowAll] = useState(false);
  const CAT_LIMIT = 5;

  const palette = ['#84a98c', '#52796f', '#cad2c5', '#a98467', '#d8a48f', '#bb8588', '#3d5a80',
                   '#9c9c9c', '#e07a5f', '#81b29a', '#f2cc8f', '#3a86ff', '#8338ec', '#ff006e'];

  const addCategory = () => {
    if (!newCat.name.trim()) return;
    onCategoriesChange([...categories, { id: 'cat_' + uuid(), name: newCat.name.trim(), color: newCat.color }]);
    setNewCat({ name: '', color: '#84a98c' });
    setShowAdd(false);
    setShowAll(true);
  };

  const updateCategory = (id, updates) => {
    onCategoriesChange(categories.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleDelete = (cat) => {
    const using = transactions.filter(t => getCatIds(t).includes(cat.id)).length;
    if (using === 0) {
      onCategoriesChange(categories.filter(c => c.id !== cat.id));
    } else {
      setDeleteAsk(cat);
      setReassignTo(categories.find(c => c.id !== cat.id)?.id || '');
    }
  };

  const confirmDelete = () => {
    if (!deleteAsk || !reassignTo) return;
    onCategoriesChange(categories.filter(c => c.id !== deleteAsk.id));
    // Le parent gère la réaffectation des transactions
    window.dispatchEvent(new CustomEvent('reassign-cat', { detail: { from: deleteAsk.id, to: reassignTo } }));
    setDeleteAsk(null);
  };

  const visibles = showAll || categories.length <= CAT_LIMIT
    ? categories
    : categories.filter((c, i) => i < CAT_LIMIT || c.id === editing);

  const liste = (
    <>
      {visibles.map((c, i) => {
        const count = transactions.filter(t => getCatIds(t).includes(c.id)).length;
        return (
          <div key={c.id} className={`flex items-center gap-3 min-h-[44px] py-1.5 ${i > 0 ? 'f-line' : ''}`}>
            {editing === c.id ? (
              <>
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => updateCategory(c.id, { color: e.target.value })}
                  className="f-color"
                  aria-label="Couleur"
                />
                <Input
                  value={c.name}
                  onChange={(e) => updateCategory(c.id, { name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditing(null); }}
                  className="flex-1"
                  aria-label="Nom de la catégorie"
                  autoFocus
                />
                <IconButton label="Valider" onClick={() => setEditing(null)}><Check size={15} /></IconButton>
              </>
            ) : (
              <>
                <span className="w-3 h-3 rounded-[3px] shrink-0" style={{ backgroundColor: c.color }} />
                <span className="flex-1 min-w-0 truncate t-ink">{c.name}</span>
                <span className="text-xs f-num t-muted">{count}</span>
                <span className="flex gap-0.5">
                  <IconButton label={`Modifier ${c.name}`} onClick={() => setEditing(c.id)}><Pencil size={14} /></IconButton>
                  <IconButton label={`Supprimer ${c.name}`} danger onClick={() => handleDelete(c)}><Trash2 size={14} /></IconButton>
                </span>
              </>
            )}
          </div>
        );
      })}
      {categories.length > CAT_LIMIT && (
        <div className="f-line py-1">
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="no-touch-grow inline-flex items-center gap-1 h-8 font-medium t-ink3 hover:opacity-70"
          >
            {showAll ? 'Voir moins' : `Voir plus (${categories.length - CAT_LIMIT})`}
            <ChevronDown size={14} className={showAll ? 'rotate-180' : ''} />
          </button>
        </div>
      )}
    </>
  );

  return (
    <div>
      {embedded ? (
        <section className="flex flex-col">
          <div className="f-sec-h">
            <h4>Catégories</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Nouvelle
            </Button>
          </div>
          <div className="f-box">{liste}</div>
        </section>
      ) : (
        <Card>
          <PanelHead title="Catégories">
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Nouvelle catégorie
            </Button>
          </PanelHead>
          <div className="px-4">{liste}</div>
        </Card>
      )}

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Nouvelle catégorie"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Annuler</Button>
            <Button onClick={addCategory}>Créer</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nom">
            <Input
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
              placeholder="Voyages, Études…"
              autoFocus
            />
          </Field>
          <Field as="div" label="Couleur">
            <div className="flex flex-wrap gap-2">
              {palette.map(col => (
                <button
                  key={col}
                  type="button"
                  aria-label={`Couleur ${col}`}
                  aria-pressed={newCat.color === col}
                  onClick={() => setNewCat({ ...newCat, color: col })}
                  className="f-swatch no-touch-grow"
                  style={{ backgroundColor: col, boxShadow: newCat.color === col ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : undefined }}
                />
              ))}
              <input
                type="color"
                value={newCat.color}
                onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
                className="f-color"
                aria-label="Autre couleur"
              />
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!deleteAsk}
        onClose={() => setDeleteAsk(null)}
        title="Réaffecter les transactions"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteAsk(null)}>Annuler</Button>
            <Button variant="danger" onClick={confirmDelete}>Supprimer et réaffecter</Button>
          </>
        }
      >
        {deleteAsk && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2.5 p-3 rounded-lg" style={{ background: 'var(--warn-bg)', color: 'var(--warn-ink)' }}>
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>
                <strong className="f-num">{transactions.filter(t => getCatIds(t).includes(deleteAsk.id)).length}</strong> transaction(s)
                {' '}utilisent « {deleteAsk.name} ».
              </p>
            </div>
            <Field label="Réaffecter vers">
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                {categories.filter(c => c.id !== deleteAsk.id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ============================================================
// LISTE DES TRANSACTIONS
// ============================================================

const TransactionsList = ({ transactions, categories, onEdit, onDelete }) => {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [viewingJustif, setViewingJustif] = useState(null);
  const [pastOnly, setPastOnly] = useState(() => {
    try { return window.localStorage.getItem('finances_tx_past') === '1'; } catch (e) { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('finances_tx_past', pastOnly ? '1' : '0'); } catch (e) { /* stockage indisponible */ }
  }, [pastOnly]);
  const todayIso = toISODate(new Date());

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';
  const getCatName = (id) => categories.find(c => c.id === id)?.name || 'Inconnue';

  const filtered = transactions
    .filter(t => {
      if (pastOnly && (t.date || '') > todayIso) return false;
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterCat !== 'all' && !getCatIds(t).includes(filterCat)) return false;
      if (search && !t.libelle.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Regroupement par mois (liste déjà triée de la plus récente à la plus ancienne)
  const groupes = [];
  filtered.forEach(t => {
    const key = (t.date || '').slice(0, 7);
    let g = groupes[groupes.length - 1];
    if (!g || g.key !== key) {
      g = { key, txs: [], depenses: 0, revenus: 0 };
      groupes.push(g);
    }
    g.txs.push(t);
    if (t.type === 'revenu') g.revenus += Math.abs(t.montant);
    else g.depenses += Math.abs(t.montant);
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Transactions" meta={`${filtered.length} transaction${filtered.length > 1 ? 's' : ''}`} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-3 md:px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un libellé"
            style={{ flex: '1 1 240px' }}
          />
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ flex: '1 1 140px', maxWidth: 180 }} aria-label="Type">
            <option value="all">Tous types</option>
            <option value="dépense">Dépenses</option>
            <option value="revenu">Revenus</option>
          </Select>
          <Select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ flex: '1 1 160px', maxWidth: 220 }} aria-label="Catégorie">
            <option value="all">Toutes catégories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Seg
            label="Période"
            value={pastOnly ? 'past' : 'all'}
            onChange={(v) => setPastOnly(v === 'past')}
            options={[{ id: 'all', label: 'Toutes' }, { id: 'past', label: 'Passées' }]}
          />
        </div>

        {filtered.length === 0 ? (
          <p className="t-muted text-center px-4 py-10">Aucune transaction.</p>
        ) : (
          <div>
            <div className="tx-row tx-head">
              <span>Date</span><span>Libellé</span><span>Catégories</span><span className="text-right">Montant</span><span />
            </div>
            {groupes.map(g => (
              <div key={g.key}>
                <div className="f-group-h">
                  <span className="font-semibold t-ink">{libelleMois(g.key)}</span>
                  <span className="f-num text-xs t-muted">
                    {g.depenses > 0 && <span>−{formatEUR(g.depenses)}</span>}
                    {g.depenses > 0 && g.revenus > 0 && <span className="mx-2 t-faint">|</span>}
                    {g.revenus > 0 && <span className="t-pos">+{formatEUR(g.revenus)}</span>}
                  </span>
                </div>
                {g.txs.map((t, i) => (
                  <div key={t.id} className={`f-row tx-row ${i > 0 ? 'f-line' : ''}`}>
                    <span className="tx-date f-num t-muted">{jourMoisCourt(t.date)}</span>
                    <span className="tx-lib flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="truncate font-medium t-ink">{t.libelle}</span>
                      {t.justificatif && <JustifButton onClick={() => setViewingJustif(t.justificatif)} />}
                      <DuBadge t={t} /><EtalBadge t={t} />
                      {t.type === 'revenu' && t.recu === false && <PendingBadge />}
                    </span>
                    <span className="tx-cats min-w-0 truncate text-[12.5px]">
                      <CatBadges ids={getCatIds(t)} categories={categories} max={2} />
                    </span>
                    <span className={`tx-amt f-num text-right font-medium ${t.type === 'revenu' ? 't-pos' : 't-ink'}`}>
                      {t.type === 'revenu' ? '+' : '−'}{formatEUR(Math.abs(t.montant))}
                    </span>
                    <span className="tx-act"><RowActions onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} /></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
      <JustificatifViewer
        open={!!viewingJustif}
        onClose={() => setViewingJustif(null)}
        justificatif={viewingJustif}
      />
    </div>
  );
};

// ============================================================
// TABLEAU DE BORD
// ============================================================

const Dashboard = ({ transactions, categories, allTransactions, societePending = 0, societeCount = 0, onOpenSociete, affaireCatIds = [], participationCatIds = [] }) => {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = startOfMonth(addMonths(today, 1));

  const thisMonth = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= monthStart && d < monthEnd;
  });

  // Revenus du mois
  const revenue = thisMonth
    .filter(t => t.type === 'revenu')
    .reduce((s, t) => s + Math.abs(t.montant), 0);

  // Dépenses brutes (toutes confondues, sauf remboursables remboursés)
  const grossExpenses = thisMonth
    .filter(t => t.type === 'dépense' && !(t.remboursable && t.rembourse))
    .reduce((s, t) => s + Math.abs(t.montant), 0);

  // Dépenses nettes (hors remboursables en attente)
  const netExpenses = thisMonth
    .filter(t => t.type === 'dépense' && !t.remboursable)
    .reduce((s, t) => s + Math.abs(t.montant), 0);

  // Ce que les autres me doivent encore (les frais de société sont exclus en amont
  // et suivis dans leur propre rubrique)
  const pendingReimb = (allTransactions || transactions)
    .filter(t => isDu(t, affaireCatIds, participationCatIds) && !isDuRegle(t))
    .reduce((s, t) => s + Math.max(0, montantDu(t, affaireCatIds, participationCatIds) - dejaRecu(t)), 0);

  const balance = revenue - netExpenses;

  const todayIso = toISODate(today);
  const recent = [...transactions]
    .filter(t => !(t._etal && t.date > todayIso))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  // Mini graphique 4 dernières semaines
  const miniWeeks = useMemo(() => {
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const start = startOfWeek(addDays(today, -7 * i));
      const end = addDays(start, 7);
      const total = transactions
        .filter(t => t.type === 'dépense' && !(t.remboursable && t.rembourse))
        .filter(t => {
          const d = new Date(t.date);
          return d >= start && d < end;
        })
        .reduce((s, t) => s + Math.abs(t.montant), 0);
      weeks.push({ label: `S${4 - i}`, total: Math.round(total * 100) / 100 });
    }
    return weeks;
  }, [transactions]);

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';
  const getCatName = (id) => categories.find(c => c.id === id)?.name || 'Inconnue';

  const monthLabel = today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Hero — Solde du mois en grand, avec Revenus / Dépenses détaillés */}
      <Card className="dashboard-hero p-6 bg-gradient-to-br from-stone-900 to-stone-800 text-stone-50 border-stone-900">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Solde du mois · {monthLabel}</p>
            <p className={`font-serif text-5xl mt-2 tabular-nums ${balance >= 0 ? 'text-stone-50' : 'text-rose-300'}`}>
              {balance >= 0 ? '+' : '−'}{formatEUR(Math.abs(balance))}
            </p>
            <p className="text-sm text-stone-400 mt-2">
              {revenue > 0 ? formatEUR(revenue) + ' de revenus · ' : ''}{formatEUR(netExpenses)} de dépenses nettes
            </p>
          </div>
          {/* Mini-récap dans le hero */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-stone-400">Revenus</p>
              <p className="font-serif text-xl text-emerald-300 tabular-nums">{formatEUR(revenue)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-stone-400">Dépenses</p>
              <p className="font-serif text-xl text-stone-50 tabular-nums">{formatEUR(grossExpenses)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs : 4 indicateurs synthétiques, organisés du plus important au moins */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-[10px] md:text-xs uppercase tracking-wider text-emerald-700">Revenus</p>
          <p className="font-serif text-2xl text-emerald-700 mt-1 tabular-nums">{formatEUR(revenue)}</p>
          <p className="text-xs text-stone-500 mt-1">
            {(() => {
              const revs = thisMonth.filter(t => t.type === 'revenu');
              const pendingRevs = revs.filter(t => t.recu === false);
              if (pendingRevs.length === 0) {
                return <>{revs.length} entrée{revs.length > 1 ? 's' : ''}</>;
              }
              const pendingTotal = pendingRevs.reduce((s, t) => s + Math.max(0, Math.abs(t.montant) - dejaRecu(t)), 0);
              return (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} className="text-amber-700" />
                  <span className="text-amber-800 font-medium">{formatEUR(pendingTotal)} en attente</span>
                </span>
              );
            })()}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] md:text-xs uppercase tracking-wider text-stone-500">Dépenses</p>
          <p className="font-serif text-2xl text-stone-900 mt-1 tabular-nums">{formatEUR(grossExpenses)}</p>
          <p className="text-xs text-stone-500 mt-1">
            {grossExpenses !== netExpenses ? (
              <>dont {formatEUR(grossExpenses - netExpenses)} remboursable</>
            ) : (
              <>{thisMonth.filter(t => t.type === 'dépense').length} sortie{thisMonth.filter(t => t.type === 'dépense').length > 1 ? 's' : ''}</>
            )}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Solde du mois</p>
          <p className={`font-serif text-2xl mt-1 tabular-nums ${balance >= 0 ? 'text-stone-900' : 'text-rose-700'}`}>
            {balance >= 0 ? '+' : '−'}{formatEUR(Math.abs(balance))}
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {revenue > 0 ? `Épargne : ${((balance / revenue) * 100).toFixed(0)}%` : 'Hors revenus'}
          </p>
        </Card>
        <Card className="p-4 bg-amber-50/40 border-amber-100">
          <p className="text-xs uppercase tracking-wider text-amber-800">À recevoir</p>
          <p className="font-serif text-2xl text-stone-900 mt-1 tabular-nums">{formatEUR(pendingReimb)}</p>
          <p className="text-xs text-stone-500 mt-1">Créances en attente</p>
        </Card>
      </div>

      {/* Rappel discret du registre Société : hors des chiffres personnels ci-dessus */}
      {societePending > 0 && (
        <button type="button" onClick={onOpenSociete} className="block w-full text-left">
          <Card className="p-4 flex items-center gap-3 hover:border-stone-300 transition">
            <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
              <Building2 size={16} className="text-stone-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900">
                Frais de société en attente : <span className="tabular-nums">{formatEUR(societePending)}</span>
                <span className="font-normal text-stone-500"> · {societeCount} frais</span>
              </p>
            </div>
            <ChevronRight size={16} className="text-stone-400 shrink-0" />
          </Card>
        </button>
      )}

      {/* Mini graphique + récents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 mb-4">4 dernières semaines</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={miniWeeks}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="label" stroke="#78716c" fontSize={12} />
                <YAxis stroke="#78716c" fontSize={12} tickFormatter={(v) => `${v}€`} />
                <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
                <Bar dataKey="total" fill="#1c1917" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 mb-4">Dernières transactions</h3>
          {recent.length === 0 ? (
            <p className="text-stone-500 text-sm">Aucune transaction.</p>
          ) : (
            <div className="space-y-2">
              {recent.map(t => {
                const ids = getCatIds(t);
                const primary = ids[0];
                const catNames = ids.map(id => getCatName(id)).join(' · ');
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getCatColor(primary) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{t.libelle}</p>
                      <p className="text-xs text-stone-500 truncate">{formatDateShort(t.date)} · {catNames || 'Sans catégorie'}</p>
                    </div>
                    <p className={`text-sm font-medium tabular-nums ${t.type === 'revenu' ? 'text-emerald-700' : 'text-stone-900'}`}>
                      {t.type === 'revenu' ? '+' : '−'}{formatEUR(Math.abs(t.montant))}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// MODALE PARAMÈTRES
// ============================================================

const SettingsModal = ({
  open, onClose,
  gistToken, gistId, gistUser, isConnected, syncStatus, syncError, lastSyncAt, onConnect, onDisconnect, onForceSync,
  // Nouvelles props : préférences d'affichage et import/export
  themePref, onThemeChange,
  bgEnabled, onBgToggle,
  isMobileTouch,
  onExport, onImportClick,
  txCount, catCount,
  categories = [], allTransactions = [], onCategoriesChange,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) {
      setTokenInput('');
      setShowToken(false);
      setLocalError('');
    }
  }, [open]);

  const handleConnect = async () => {
    if (!tokenInput.trim()) return;
    setBusy(true);
    setLocalError('');
    try {
      await onConnect(tokenInput.trim());
      setTokenInput('');
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = () => {
    if (window.confirm('Déconnecter la synchronisation Gist ? Les données restent dans le navigateur et sur le Gist, mais l\'app ne se synchronisera plus automatiquement.')) {
      onDisconnect();
    }
  };

  const Titre = ({ children, action }) => (
    <div className="f-sec-h">
      <h4>{children}</h4>
      {action}
    </div>
  );
  const Ligne = ({ label, children, onClick, icon: Icon }) => {
    const inner = (
      <>
        {Icon && <Icon size={16} className="t-muted shrink-0" />}
        <span className="flex-1 min-w-0 text-left t-ink">{label}</span>
        {children}
      </>
    );
    const cls = 'f-ln w-full flex items-center gap-3 min-h-[46px]';
    return onClick
      ? <button type="button" onClick={onClick} className={`${cls} hover:opacity-70`}>{inner}</button>
      : <div className={cls}>{inner}</div>;
  };
  const synchroLabel = syncStatus === 'saving' ? 'Sauvegarde…'
    : syncStatus === 'loading' ? 'Chargement…'
    : syncStatus === 'error' ? 'Erreur'
    : lastSyncAt ? new Date(lastSyncAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const synchroColor = syncStatus === 'error' ? 'var(--neg)'
    : (syncStatus === 'saving' || syncStatus === 'loading') ? 'var(--m-wait-2)'
    : 'var(--m-ok)';

  return (
    <Modal open={open} onClose={onClose} title="Paramètres" size="md">
      <div className="flex flex-col gap-6">

        <section className="flex flex-col">
          <Titre>Apparence</Titre>
          <div className="f-box">
            <Ligne label="Thème">
              <Seg
                label="Thème"
                value={themePref}
                onChange={onThemeChange}
                options={[
                  { id: 'auto', label: 'Auto' },
                  { id: 'light', label: 'Clair' },
                  { id: 'dark', label: 'Sombre' },
                ]}
              />
            </Ligne>
            <Ligne label="Fond animé">
              <button
                type="button"
                onClick={onBgToggle}
                className={`f-switch no-touch-grow ${bgEnabled ? 'on' : ''}`}
                role="switch"
                aria-checked={bgEnabled}
                aria-label="Fond animé"
              >
                <span />
              </button>
            </Ligne>
          </div>
        </section>

        <CategoriesView embedded categories={categories} transactions={allTransactions} onCategoriesChange={onCategoriesChange} />

        <section className="flex flex-col">
          <Titre
            action={!isConnected && (
              <a
                href="https://github.com/settings/tokens?type=beta"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12.5px] t-ink3 underline underline-offset-2 hover:opacity-70"
              >
                Créer un token
              </a>
            )}
          >
            Synchronisation Gist
          </Titre>

          {!isConnected ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <label className="relative flex-1 flex items-center min-w-0">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                    placeholder="Token GitHub"
                    aria-label="Token GitHub"
                    className="f-field f-mono"
                    style={{ paddingRight: 40, fontSize: 12.5 }}
                  />
                  <IconButton
                    label={showToken ? 'Masquer' : 'Afficher'}
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-1 no-touch-grow"
                  >
                    {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </IconButton>
                </label>
                <Button onClick={handleConnect} disabled={busy || !tokenInput.trim()}>
                  {busy ? 'Connexion…' : 'Connecter'}
                </Button>
              </div>
              {(localError || syncError) && (
                <p className="text-xs t-neg">{localError || syncError}</p>
              )}
            </div>
          ) : (
            <div className="f-box">
              <Ligne label="Compte">
                <span className="truncate t-ink3">{gistUser || '—'}</span>
              </Ligne>
              <Ligne label="Dernière synchronisation">
                <span className="inline-flex items-center gap-2 f-num" style={{ color: syncStatus === 'error' ? 'var(--neg)' : 'var(--ink-3)' }}>
                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: synchroColor }} />
                  {synchroLabel}
                </span>
              </Ligne>
              {syncError && <p className="text-xs t-neg py-2 f-ln">{syncError}</p>}
              <div className="f-ln flex items-center gap-1 min-h-[46px] -ml-2">
                <Button
                  variant="ghost"
                  onClick={onForceSync}
                  disabled={syncStatus === 'loading' || syncStatus === 'saving'}
                  className="no-touch-grow t-ink"
                >
                  <RefreshCw size={14} className={syncStatus === 'loading' ? 'animate-spin' : ''} />
                  Recharger
                </Button>
                <Button variant="ghost" onClick={handleDisconnect} className="no-touch-grow" style={{ color: 'var(--neg)' }}>
                  Déconnecter
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col">
          <Titre action={<span className="text-xs f-num t-muted">{txCount} transactions</span>}>Données</Titre>
          <div className="f-box">
            <Ligne label="Importer mes données" icon={FolderOpen} onClick={onImportClick}>
              <ChevronRight size={15} className="t-faint" />
            </Ligne>
            <Ligne label="Exporter mes données" icon={Download} onClick={onExport}>
              <ChevronRight size={15} className="t-faint" />
            </Ligne>
          </div>
        </section>
      </div>
    </Modal>
  );
};

// ============================================================
// BACKGROUND ANIMÉ — Vague de particules
// Points minuscules qui ondulent comme du sable/fumée.
// S'adapte au thème clair/sombre.
// ============================================================

const ParticleWaveBackground = ({ isDark }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particleColor = isDark
      ? (a) => `rgba(168,162,158,${a})`
      : (a) => `rgba(120,113,108,${a})`;
    const bgColor = isDark ? '#1c1917' : '#fafaf9';

    const COUNT = Math.min(350, Math.round(window.innerWidth * window.innerHeight / 5000));
    const pts = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      phase: Math.random() * Math.PI * 2,
      speed: 0.008 + Math.random() * 0.012,
      ampX: 6 + Math.random() * 10,
      ampY: 4 + Math.random() * 7,
      r: 0.8 + Math.random() * 1.4,
    }));
    pts.forEach(p => { p.ox = p.x; p.oy = p.y; });

    let t = 0;
    const draw = () => {
      if (document.hidden) { animRef.current = requestAnimationFrame(draw); return; }
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const p of pts) {
        p.x = p.ox + Math.sin(t * p.speed + p.phase) * p.ampX;
        p.y = p.oy + Math.cos(t * p.speed * 0.7 + p.phase) * p.ampY;
        const brightness = 0.15 + Math.sin(t * p.speed + p.phase) * 0.15;
        ctx.fillStyle = particleColor(brightness);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      t++;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  );
};

// ============================================================
// APPLICATION PRINCIPALE
// ============================================================

// ============================================================
// FEUILLE DE STYLE DE L'APPLICATION
// Un jeu de variables (couleurs, filets, surfaces) décliné en clair et en sombre ;
// les composants s'en servent via les classes f-* et t-*.
// ============================================================

const APP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap');

:root {
  --bg: #fafaf9; --side: #f5f5f4; --surface: #ffffff; --surface-2: #fafaf9;
  --line: #e7e5e4; --line-soft: #f0eeec; --line-strong: #d6d3d1;
  --ink: #1c1917; --ink-2: #44403c; --ink-3: #57534e; --muted: #78716c; --faint: #a8a29e;
  --hover: #f5f5f4; --hover-2: #ecebe9; --seg: #ecebe9; --seg-on: #ffffff;
  --pos: #047857; --neg: #be123c; --warn: #b45309;
  --warn-bg: #fef3c7; --warn-ink: #92400e; --ok-bg: #d1fae5; --ok-ink: #065f46; --n-bg: #f0eeec; --n-ink: #57534e;
  --m-ok: #059669; --m-wait: #f59e0b; --m-wait-2: #d97706;
  --primary: #1c1917; --primary-h: #292524; --on-primary: #fafaf9;
  --overlay: rgba(28, 25, 23, 0.36); --shadow: 0 16px 40px rgba(28, 25, 23, 0.14);
}
html.dark {
  color-scheme: dark;
  --bg: #1c1917; --side: #181513; --surface: #262220; --surface-2: #211d1b;
  --line: #3d3835; --line-soft: #322e2b; --line-strong: #57534e;
  --ink: #fafaf9; --ink-2: #e7e5e4; --ink-3: #d6d3d1; --muted: #a8a29e; --faint: #78716c;
  --hover: #2f2a27; --hover-2: #36312e; --seg: #171412; --seg-on: #36312e;
  --pos: #6ee7b7; --neg: #fda4af; --warn: #fcd34d;
  --warn-bg: rgba(180, 83, 9, 0.24); --warn-ink: #fde68a; --ok-bg: rgba(5, 150, 105, 0.24); --ok-ink: #a7f3d0; --n-bg: #36312e; --n-ink: #d6d3d1;
  --m-ok: #10b981; --m-wait: #f59e0b; --m-wait-2: #f59e0b;
  --primary: #fafaf9; --primary-h: #e7e5e4; --on-primary: #1c1917;
  --overlay: rgba(0, 0, 0, 0.6); --shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}

body, html { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: var(--bg); }
.f-app { color: var(--ink); font-size: 13px; line-height: 1.45; -webkit-font-smoothing: antialiased; font-feature-settings: 'cv11' 1; }
.f-app button { cursor: pointer; }
.f-app button:disabled { cursor: not-allowed; }
.f-num { font-variant-numeric: tabular-nums; }
.f-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
.font-serif { font-family: inherit; font-weight: 600; letter-spacing: -0.01em; }
.f-app :focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.t-ink { color: var(--ink); } .t-ink2 { color: var(--ink-2); } .t-ink3 { color: var(--ink-3); }
.t-muted { color: var(--muted); } .t-faint { color: var(--faint); }
.t-pos { color: var(--pos); } .t-neg { color: var(--neg); } .t-warn { color: var(--warn); }

/* Structure */
.f-shell { display: flex; min-height: 100vh; }
.f-side {
  position: sticky; top: 0; height: 100vh; width: 232px; flex: none; overflow-y: auto;
  display: flex; flex-direction: column; gap: 18px; padding: 16px 12px;
  background: var(--side); border-right: 1px solid var(--line);
}
.f-logo { width: 26px; height: 26px; border-radius: 7px; flex: none; display: inline-flex; align-items: center; justify-content: center; background: var(--primary); color: var(--on-primary); }
.f-nav {
  display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 6px;
  background: transparent; color: var(--ink-3); font-weight: 500; text-align: left; transition: background-color .12s, color .12s;
}
.f-nav:hover { background: var(--hover-2); color: var(--ink); }
.f-nav.on, .f-nav.on:hover { background: var(--line); color: var(--ink); }
.f-nav .ct { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--muted); font-variant-numeric: tabular-nums; }
.f-nav-g { padding: 14px 10px 4px; font-size: 12px; color: var(--muted); }
.f-nav-sync { font-weight: 400; font-size: 12px; }
.f-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.f-main { flex: 1; min-width: 0; padding: 24px 32px 56px; }
.f-topbar {
  display: none; position: sticky; top: 0; z-index: 30; align-items: center; gap: 8px; min-height: 56px; padding: 6px 8px 6px 16px;
  background: var(--bg); border-bottom: 1px solid var(--line);
}
.f-bottom {
  display: none; position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; gap: 4px;
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
  background: var(--bg); border-top: 1px solid var(--line);
}
.f-tb {
  flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  height: 48px; border: 0; border-radius: 12px; background: transparent; color: var(--ink-3); font-size: 11px; font-weight: 500;
}
.f-tb.on { background: var(--primary); color: var(--on-primary); }
.f-tb span { display: none; }
@media (min-width: 640px) { .f-tb { height: 54px; } .f-tb span { display: block; } }
@media (max-width: 1023px) {
  .f-side { display: none; }
  .f-topbar, .f-bottom { display: flex; }
  .f-main { padding: 16px 16px calc(96px + env(safe-area-inset-bottom, 0px)); }
}
.f-ibtn-lg { width: 40px; height: 40px; border-radius: 10px; }
.f-add { background: var(--primary); color: var(--on-primary); }
.f-add:hover { background: var(--primary-h); color: var(--on-primary); }

/* En-têtes et panneaux */
.f-page-h { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; }
.f-page-h h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
.f-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.f-ph { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.f-ph h2 { margin: 0; font-size: 13px; font-weight: 600; color: var(--ink); }
.f-strip { display: grid; gap: 1px; background: var(--line); }
.f-kpi { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; background: var(--surface); min-width: 0; }
.f-kpi-l { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-3); }
.f-kpi-v { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); line-height: 1.25; }
.f-kpi-s { font-size: 12px; color: var(--muted); }
.f-group-h {
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px;
  padding: 9px 16px; background: var(--surface-2); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line-soft);
}
.f-line { border-top: 1px solid var(--line-soft); }
.f-row { transition: background-color .12s; }
.f-row:hover { background: var(--surface-2); }
.f-sec-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; margin-bottom: 6px; }
.f-sec-h h4 { margin: 0; font-size: 13px; font-weight: 600; color: var(--ink); }
.f-box { border: 1px solid var(--line); border-radius: 8px; padding: 0 14px; background: var(--surface); }
.f-ln + .f-ln, .f-box > * + * { border-top: 1px solid var(--line-soft); }

/* Boutons */
.f-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px;
  border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); color: var(--ink);
  font-size: 13px; font-weight: 500; white-space: nowrap; transition: background-color .12s, border-color .12s, color .12s, opacity .12s;
}
.f-btn:hover { background: var(--hover); }
.f-btn:disabled { opacity: .45; }
.f-btn-p { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.f-btn-p:hover { background: var(--primary-h); border-color: var(--primary-h); }
.f-btn-g { background: transparent; border-color: transparent; color: var(--ink-3); padding: 0 8px; }
.f-btn-g:hover { background: var(--hover); color: var(--ink); }
.f-btn-d { background: #be123c; border-color: #be123c; color: #fff; }
.f-btn-d:hover { background: #9f1239; border-color: #9f1239; }
.f-btn-sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.f-btn-lg { height: 38px; padding: 0 16px; font-size: 14px; }
.f-btn-icon { width: 32px; padding: 0; flex: none; }
.f-ibtn {
  display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: none;
  border: 0; border-radius: 6px; background: transparent; color: var(--muted); transition: background-color .12s, color .12s;
}
.f-ibtn:hover { background: var(--hover-2); color: var(--ink); }
.f-ibtn.danger:hover { color: var(--neg); }
.f-ibtn-xs { width: 22px; height: 22px; }
.f-toggle-st { width: 28px; height: 28px; }
.f-toggle {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; height: 34px; padding: 0 10px;
  border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); color: var(--ink); font-weight: 500; white-space: nowrap;
}
.f-toggle:hover { background: var(--hover); }
.f-toggle.on, .f-toggle.on:hover { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.f-chip {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 9px; border: 1px solid var(--line);
  border-radius: 6px; background: var(--surface); color: var(--ink); font-size: 12.5px; font-weight: 500; white-space: nowrap;
  transition: border-color .12s, background-color .12s;
}
.f-chip:hover { border-color: var(--line-strong); }
.f-switch { position: relative; width: 36px; height: 20px; flex: none; border: 0; border-radius: 10px; padding: 0; background: var(--line-strong); transition: background-color .15s; }
.f-switch > span { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(28, 25, 23, 0.25); transition: transform .15s; }
.f-switch.on { background: var(--primary); }
.f-switch.on > span { transform: translateX(16px); background: var(--on-primary); }

/* Champs */
.f-fl { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.f-label { font-size: 12.5px; font-weight: 500; color: var(--ink-2); }
.f-field {
  width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 6px;
  background: var(--surface); color: var(--ink); font-size: 13px; transition: border-color .12s, box-shadow .12s;
}
.f-field::placeholder { color: var(--faint); }
.f-field:focus { outline: none; border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.f-field:disabled { opacity: .45; }
textarea.f-field { height: auto; padding: 8px 10px; line-height: 1.5; }
.f-field-sm { height: 30px; padding: 0 8px; font-size: 12.5px; }
.f-select {
  appearance: none; -webkit-appearance: none; padding-right: 28px; text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2378716c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 8px center; background-size: 14px;
}
.f-search { position: relative; display: flex; align-items: center; min-width: 0; }
.f-search > svg { position: absolute; left: 10px; color: var(--muted); pointer-events: none; }
.f-search > input { padding-left: 32px; }
.f-check { width: 16px; height: 16px; margin: 0; flex: none; accent-color: var(--ink); }
.f-color { width: 34px; height: 34px; flex: none; padding: 2px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); cursor: pointer; }
.f-swatch { width: 30px; height: 30px; border: 0; border-radius: 6px; }
.f-inset { display: flex; flex-direction: column; gap: 14px; padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); }
.f-drop {
  display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; border: 1px dashed var(--line-strong);
  border-radius: 8px; background: var(--surface); color: var(--ink-3); font-weight: 500; transition: border-color .12s, color .12s;
}
.f-drop:hover { border-color: var(--muted); color: var(--ink); }
.f-dropzone {
  display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 44px 20px; text-align: center; cursor: pointer;
  border: 1px dashed var(--line-strong); border-radius: 10px; background: var(--surface-2); transition: border-color .12s;
}
.f-dropzone:hover { border-color: var(--muted); }
.f-dropzone.is-off { opacity: .5; cursor: default; }
.f-dropzone-ic { width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-3); margin-bottom: 4px; }
.f-details { border: 1px solid var(--line); border-radius: 8px; }
.f-details > summary { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; font-weight: 500; color: var(--ink); list-style: none; cursor: pointer; }
.f-details > summary::-webkit-details-marker { display: none; }
.f-details[open] .f-details-chev { transform: rotate(180deg); }
code.f-code { font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; font-size: 12px; padding: 1px 5px; border-radius: 4px; background: var(--n-bg); color: var(--ink); }
.f-pop { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
.f-pop-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.f-pop-item:hover { background: var(--hover); }

/* Contrôle segmenté, onglets, badges */
.f-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--seg); max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.f-seg::-webkit-scrollbar { display: none; }
.f-seg > button {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: none; height: 28px; padding: 0 10px;
  border: 0; border-radius: 5px; background: transparent; color: var(--ink-3); font-size: 12.5px; font-weight: 500; white-space: nowrap;
  transition: background-color .12s, color .12s;
}
.f-seg > button:hover { color: var(--ink); }
.f-seg > button.on { background: var(--seg-on); color: var(--ink); box-shadow: 0 1px 2px rgba(28, 25, 23, 0.08), 0 0 0 1px var(--line); }
.f-seg > button.on.tone-dark { background: var(--primary); color: var(--on-primary); box-shadow: none; }
.f-seg > button.on.tone-pos { background: #047857; color: #fff; box-shadow: none; }
.f-seg > button.on.tone-ok { background: var(--ok-bg); color: var(--ok-ink); box-shadow: none; }
.f-seg > button.on.tone-wait { background: var(--warn-bg); color: var(--warn-ink); box-shadow: none; }
.f-seg .ct { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.f-seg.f-seg-fill { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); width: 100%; }
.f-seg.f-seg-fill > button { height: 32px; }
.f-tabs { display: flex; gap: 24px; overflow-x: auto; border-bottom: 1px solid var(--line); scrollbar-width: none; }
.f-tabs::-webkit-scrollbar { display: none; }
.f-tab { height: 40px; padding: 0 2px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ink-3); font-weight: 500; white-space: nowrap; }
.f-tab:hover { color: var(--ink); }
.f-tab.on { color: var(--ink); border-bottom-color: var(--ink); }
.f-badge { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 6px; border-radius: 4px; font-size: 11.5px; font-weight: 500; white-space: nowrap; flex: none; }
.f-b-wait { background: var(--warn-bg); color: var(--warn-ink); }
.f-b-ok { background: var(--ok-bg); color: var(--ok-ink); }
.f-b-n { background: var(--n-bg); color: var(--n-ink); }
.f-sq { display: inline-block; width: 8px; height: 8px; border-radius: 2px; flex: none; }
.f-cat { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-3); white-space: nowrap; }
.f-track { display: block; height: 6px; border-radius: 3px; background: var(--line-soft); overflow: hidden; }
.f-track > span { display: block; height: 100%; border-radius: 3px; transition: width .3s; }
.f-barrow { display: grid; grid-template-columns: minmax(96px, 150px) minmax(0, 1fr) 44px 96px; align-items: center; gap: 12px; min-height: 32px; }
@media (max-width: 479px) { .f-barrow { grid-template-columns: minmax(0, 1fr) 72px 40px 84px; gap: 8px; } }

/* Lignes de registre (Société, Créances, Affaires) */
.f-entry { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto auto; align-items: center; column-gap: 10px; min-height: 56px; padding: 8px 12px; }
@media (min-width: 640px) { .f-entry { grid-template-columns: 28px minmax(0, 1fr) auto 112px auto; column-gap: 12px; padding: 8px 16px; } }
.f-buyer { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; text-align: left; }
.f-buyer:hover:not(:disabled), .f-buyer.on { background: var(--hover); }
.f-buyer:disabled { cursor: default; }

/* Transactions */
.tx-row { display: grid; align-items: center; column-gap: 16px; row-gap: 2px; min-height: 46px; padding: 7px 16px;
  grid-template-columns: 64px minmax(0, 1fr) minmax(0, 210px) 120px auto; grid-template-areas: "date lib cats amt act"; }
.tx-head { min-height: 36px; background: var(--surface-2); font-size: 12px; font-weight: 500; color: var(--muted); border-bottom: 1px solid var(--line); }
.tx-head > span:nth-child(1) { grid-area: date; } .tx-head > span:nth-child(2) { grid-area: lib; } .tx-head > span:nth-child(3) { grid-area: cats; } .tx-head > span:nth-child(4) { grid-area: amt; } .tx-head > span:nth-child(5) { grid-area: act; }
.tx-date { grid-area: date; } .tx-lib { grid-area: lib; } .tx-cats { grid-area: cats; } .tx-amt { grid-area: amt; } .tx-act { grid-area: act; }
@media (max-width: 767px) {
  .tx-row { column-gap: 10px; padding: 9px 12px; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "lib lib amt" "date cats act"; }
  .tx-head { display: none; }
  .tx-date, .tx-cats { font-size: 12px; }
}

/* Grilles de lignes */
.f-top { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; column-gap: 12px; min-height: 48px; padding: 6px 16px; }
.f-top + .f-top { border-top: 1px solid var(--line-soft); }
@media (min-width: 640px) { .f-top { grid-template-columns: 20px minmax(0, 1fr) auto 112px; } }
.f-dayrow { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto auto; align-items: center; column-gap: 12px; padding: 10px 20px; }
.f-pickrow { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; column-gap: 12px; padding: 10px 14px; cursor: pointer; }
.f-doc-head { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@media (min-width: 768px) { .f-doc-head { grid-template-columns: 200px minmax(0, 1fr); } }
.f-hov:hover { background: var(--hover); }

/* Calendrier */
.cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.cal-wd { padding: 7px 4px; font-size: 11px; font-weight: 500; color: var(--muted); text-align: center; }
.cal-cell {
  min-height: 60px; min-width: 0; padding: 3px 2px; display: flex; flex-direction: column; gap: 2px;
  border-right: 1px solid var(--line-soft); background: var(--surface); cursor: pointer; text-align: left; transition: background-color .12s;
}
.cal-cell:hover { background: var(--surface-2); }
.cal-cell.empty { background: var(--surface-2); cursor: default; }
.cal-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; font-size: 11px; font-weight: 500; color: var(--muted); align-self: center; }
.cal-num.today { background: var(--primary); color: var(--on-primary); }
.cal-chip { display: flex; align-items: center; gap: 5px; min-width: 0; height: 16px; padding: 0 2px; border-radius: 3px; font-size: 10px; color: var(--ink); transition: opacity .15s; }
.cal-dots { display: flex; gap: 2px; flex: none; }
.cal-dot { width: 6px; height: 6px; border-radius: 2px; }
.cal-week { display: none; }
.cal-desktop { display: none; }
.cal-mobile { display: block; }
.cal-legend { display: flex; gap: 6px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 1px; }
.cal-legend::-webkit-scrollbar { display: none; }
.cal-legend > * { flex-shrink: 0; }
@media (min-width: 768px) {
  .cal-grid { grid-template-columns: repeat(7, minmax(0, 1fr)) 88px; }
  .cal-wd { padding: 8px 10px; font-size: 12px; text-align: left; }
  .cal-wd:last-child { text-align: right; }
  .cal-cell { min-height: 108px; padding: 6px; gap: 3px; }
  .cal-num { width: 22px; height: 22px; font-size: 12px; align-self: auto; }
  .cal-chip { height: 20px; padding: 0 6px; border-radius: 4px; font-size: 11.5px; }
  .cal-week { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; padding: 9px 10px; background: var(--surface-2); }
  .cal-desktop { display: block; }
  .cal-dots.cal-desktop { display: flex; }
  .cal-mobile { display: none; }
  .cal-legend { flex-wrap: wrap; overflow-x: visible; }
}

/* Fenêtres */
.f-overlay { background: var(--overlay); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
.f-modal { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.f-modal-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 12px 12px 20px; border-bottom: 1px solid var(--line); }
.f-modal-h h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--ink); }
.f-modal-h h3::first-letter { text-transform: uppercase; }
.f-modal-b { padding: 20px; }
.f-modal-f { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--surface-2); }
.f-form-actions {
  position: sticky; bottom: -20px; z-index: 2; display: flex; justify-content: flex-end; gap: 8px;
  margin: 4px -20px -20px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--surface-2);
}
.f-steps { display: flex; align-items: center; gap: 10px; margin: -20px -20px 20px; padding: 10px 20px; background: var(--surface-2); border-bottom: 1px solid var(--line-soft); overflow-x: auto; }
.f-step { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-weight: 500; white-space: nowrap; }
.f-step b { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; font-size: 11.5px; font-weight: 600; background: var(--seg); color: var(--ink-3); }
.f-step.cur { color: var(--ink); } .f-step.cur b { background: var(--primary); color: var(--on-primary); }
.f-step.done { color: var(--ink); } .f-step.done b { background: var(--ok-bg); color: var(--ok-ink); }
.f-steps-sep { width: 28px; height: 1px; flex: none; background: var(--line-strong); }
.f-rv { display: grid; grid-template-columns: 18px 132px minmax(0, 1fr) 104px 150px 140px; align-items: center; column-gap: 8px; padding: 8px 12px; border-top: 1px solid var(--line-soft); }
.f-rv-head { border-top: 0; background: var(--surface-2); font-size: 12px; font-weight: 500; color: var(--muted); border-bottom: 1px solid var(--line); }
.f-rv-head + div > .f-rv:first-child { border-top: 0; }

/* Thème sombre : compatibilité des classes Tailwind encore utilisées */
html.dark .bg-stone-50 { background-color: #1c1917 !important; }
html.dark .bg-white { background-color: #292524 !important; }
html.dark .bg-stone-100 { background-color: #292524 !important; }
html.dark .bg-stone-200 { background-color: #44403c !important; }
html.dark .bg-stone-900 { background-color: #f5f5f4 !important; }
html.dark .text-stone-900 { color: #fafaf9 !important; }
html.dark .text-stone-700 { color: #e7e5e4 !important; }
html.dark .text-stone-600 { color: #d6d3d1 !important; }
html.dark .text-stone-500 { color: #a8a29e !important; }
html.dark .text-stone-400 { color: #78716c !important; }
html.dark .text-stone-50 { color: #1c1917 !important; }
html.dark .border-stone-100 { border-color: #292524 !important; }
html.dark .border-stone-200 { border-color: #44403c !important; }
html.dark .border-stone-300 { border-color: #57534e !important; }
html.dark .text-emerald-700 { color: #6ee7b7 !important; }
html.dark .text-rose-700 { color: #fca5a5 !important; }
html.dark .text-amber-700 { color: #fcd34d !important; }
html.dark .bg-emerald-100 { background-color: rgba(6, 78, 59, 0.4) !important; }
html.dark .bg-amber-100 { background-color: rgba(120, 53, 15, 0.4) !important; }
html.dark input, html.dark select, html.dark textarea { color-scheme: dark; }

/* Mode tactile (iPhone, tablettes) : cibles plus grandes, pas de survol collant */
html[data-touch="1"] *:hover { transition: none !important; }
html[data-touch="1"] button:not(.no-touch-grow), html[data-touch="1"] a[role="button"]:not(.no-touch-grow) { min-height: 40px; }
html[data-touch="1"] .f-ibtn { width: 40px; height: 40px; }
html[data-touch="1"] .f-ibtn-xs { width: 28px; height: 28px; }
html[data-touch="1"] .f-seg > button { height: 34px; }
html[data-touch="1"] .f-chip { height: 32px; }
html[data-touch="1"] input[type="text"], html[data-touch="1"] input[type="number"], html[data-touch="1"] input[type="email"],
html[data-touch="1"] input[type="password"], html[data-touch="1"] input[type="date"], html[data-touch="1"] input[type="search"],
html[data-touch="1"] select, html[data-touch="1"] textarea { font-size: 16px !important; }
html[data-touch="1"] .f-field { height: auto; min-height: 42px; padding-top: 8px; padding-bottom: 8px; }
html[data-touch="1"] .f-field-sm { min-height: 38px; }
html[data-touch="1"] .fixed.inset-0.z-50 > .f-modal:not(.max-w-md) {
  margin: 0 !important; max-width: none !important; max-height: 100dvh !important; height: 100dvh !important;
  border-radius: 0 !important; border: 0 !important; padding-bottom: env(safe-area-inset-bottom, 0) !important;
}
html[data-touch="1"] .fixed.inset-0.z-50:has(> .f-modal:not(.max-w-md)) { padding: 0 !important; }
html[data-touch="1"] .opacity-0.group-hover\\:opacity-100 { opacity: 0.7 !important; }
`;
function AppInner() {
  // ===== Gist : récupération initiale du token et de l'id (localStorage avec fallback) =====
  const safeLocalStorage = useMemo(() => {
    try {
      const test = '__test__';
      window.localStorage.setItem(test, '1');
      window.localStorage.removeItem(test);
      return window.localStorage;
    } catch {
      return null;
    }
  }, []);

  const readLS = (key, fallback = '') => {
    try { return safeLocalStorage?.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const writeLS = (key, val) => {
    try { if (val) safeLocalStorage?.setItem(key, val); else safeLocalStorage?.removeItem(key); } catch {}
  };

  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  // Données propres aux projets d'affaires : { [nom du projet]: { tauxMarge } } (taux en % du coût d'achat)
  const [projetsMeta, setProjetsMeta] = useState({});
  const setTauxMarge = (nom, taux) => setProjetsMeta(prev => {
    const next = { ...prev };
    const { margeEsperee: _ancienne, ...reste } = next[nom] || {};
    if (taux > 0) next[nom] = { ...reste, tauxMarge: taux };
    else delete next[nom];
    return next;
  });
  const [view, setView] = useState('calendar');
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [defaultDate, setDefaultDate] = useState(null);
  const [showImport, setShowImport] = useState(false);
  // Transaction pré-remplie depuis les paramètres d'URL (?action=add&montant=...&libelle=...)
  // Sert à l'automatisation iOS via Raccourcis : on ouvre l'URL, le formulaire s'ouvre déjà rempli.
  const [prefillTx, setPrefillTx] = useState(null);

  // ===== Préférences d'affichage (thème + densité tactile) =====
  // themePref : 'auto' (suit le système) | 'light' | 'dark'
  const [themePref, setThemePref] = useState(() => readLS('finances_theme', 'auto'));
  const [bgEnabled, setBgEnabled] = useState(() => readLS('finances_bg', '1') !== '0');
  // systemDark : suit le media query du système (pour le mode 'auto')
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else if (mq.removeListener) mq.removeListener(handler);
    };
  }, []);
  // isDark : valeur effective résolue pour le PolygonBackground et le Canvas
  const isDark = themePref === 'dark' || (themePref === 'auto' && systemDark);
  // Détection de l'environnement mobile/tactile : on combine la largeur d'écran (≤768px)
  // et la présence d'un pointeur tactile principal. Cela garantit le mode tactile sur iPhone
  // ET sur tablette tactile en orientation étroite.
  const [isMobileTouch, setIsMobileTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    const narrow = window.innerWidth <= 768;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return narrow || coarse;
  });

  // Recalcule isMobileTouch au resize / changement de pointeur (rotation tablette par ex.)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const narrow = window.innerWidth <= 768;
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      setIsMobileTouch(narrow || coarse);
    };
    window.addEventListener('resize', update);
    const mq = window.matchMedia('(pointer: coarse)');
    if (mq.addEventListener) mq.addEventListener('change', update);
    else if (mq.addListener) mq.addListener(update);
    return () => {
      window.removeEventListener('resize', update);
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else if (mq.removeListener) mq.removeListener(update);
    };
  }, []);

  // Application effective du thème (auto résolu vers light/dark selon le système)
  // et propagation dans la classe HTML pour activer les overrides CSS.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const applyTheme = () => {
      let effective = themePref;
      if (themePref === 'auto') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        effective = prefersDark ? 'dark' : 'light';
      }
      const html = document.documentElement;
      if (effective === 'dark') html.classList.add('dark');
      else html.classList.remove('dark');
      // On positionne aussi le data-attribute pour le mode tactile (utilisé par les overrides CSS)
      if (isMobileTouch) html.setAttribute('data-touch', '1');
      else html.removeAttribute('data-touch');
    };
    applyTheme();
    // Si on est en 'auto', on écoute aussi les changements système
    if (themePref === 'auto' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      if (mq.addEventListener) mq.addEventListener('change', listener);
      else if (mq.addListener) mq.addListener(listener);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', listener);
        else if (mq.removeListener) mq.removeListener(listener);
      };
    }
  }, [themePref, isMobileTouch]);

  // Persistance du choix de thème
  useEffect(() => {
    writeLS('finances_theme', themePref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themePref]);

  useEffect(() => {
    writeLS('finances_bg', bgEnabled ? '1' : '0');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgEnabled]);

  const importJsonRef = useRef(null);

  // ===== State Gist =====
  const [gistToken, setGistToken] = useState(() => readLS('finances_gist_token', ''));
  const [gistId, setGistId] = useState(() => readLS('finances_gist_id', ''));
  const [gistUser, setGistUser] = useState(() => readLS('finances_gist_user', ''));
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | loading | saving | saved | error
  const [syncError, setSyncError] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const initialLoadDoneRef = useRef(false);
  const saveTimerRef = useRef(null);

  const isGistConnected = !!(gistToken && gistId);

  // Les frais de société forment un registre à part : exclus de toutes les vues
  // personnelles, ils ne sont visibles que dans la rubrique « Société ».
  const personalTransactions = useMemo(() => transactions.filter(t => !isSociete(t)), [transactions]);
  // Catégorie(s) « Affaires », et projets / acheteurs déjà saisis (suggestions du formulaire)
  const affaireCatIds = useMemo(() => categories.filter(isAffaireCat).map(c => c.id), [categories]);
  const participationCatIds = useMemo(() => categories.filter(isParticipationCat).map(c => c.id), [categories]);
  const uniqSorted = (values) => Array.from(new Set(values.map(v => (v || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'fr'));
  const projets = useMemo(() => uniqSorted(transactions.map(t => t.affaire)), [transactions]);
  const acheteurs = useMemo(() => uniqSorted(transactions.map(t => t.acheteur)), [transactions]);
  const societePendingTxs = useMemo(() => transactions.filter(t => isSociete(t) && !t.rembourse), [transactions]);
  const societePending = societePendingTxs.reduce((sum, t) => sum + Math.max(0, Math.abs(t.montant) - dejaRecu(t)), 0);

  // Vues personnelles : une dépense dont une partie est due par un tiers n'y compte que
  // pour ma part ; si elle est due en totalité, elle n'apparaît que dans « Créances ».
  // Les copies portent _du / _duRegle / _total pour l'affichage ; l'édition repart
  // toujours de la transaction d'origine (voir startEdit).
  const partsPersonnelles = useMemo(() => personalTransactions.map(t => {
    if (!isProximite(t)) return t;
    const total = Math.abs(Number(t.montant) || 0);
    const du = montantDu(t);
    const part = Math.round((total - du) * 100) / 100;
    if (part <= 0) return null;
    return { ...t, montant: -part, remboursable: false, _du: du, _duRegle: !!t.rembourse, _total: total };
  }).filter(Boolean), [personalTransactions]);

  // Dépenses étalées : une échéance par période (id « <id>__e<n> », _srcId = transaction d'origine)
  const visibleTransactions = useMemo(() => {
    const out = [];
    partsPersonnelles.forEach(t => {
      if (t.type !== 'dépense' || !t.etalement) { out.push(t); return; }
      const dates = datesEtalement(t.date, t.etalement);
      if (dates.length < 2) { out.push(t); return; }
      const total = Math.abs(Number(t.montant) || 0);
      const montants = repartirMontant(total, dates.length);
      dates.forEach((date, i) => out.push({
        ...t,
        id: `${t.id}__e${i + 1}`,
        _srcId: t.id,
        date,
        montant: -montants[i],
        _etal: { n: i + 1, nb: dates.length, total },
        ...(i > 0 ? { _du: 0 } : {}),
      }));
    });
    return out;
  }, [partsPersonnelles]);

  // Débiteurs déjà saisis (suggestions du formulaire)
  const personnes = useMemo(() => Array.from(new Set(
    transactions.map(t => (t.duPar || '').trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'fr')), [transactions]);

  const startEdit = (t) => {
    const id = t._srcId || t.id;
    setEditingTx(transactions.find(x => x.id === id) || t);
    setShowTxForm(true);
  };

  // Ouvre le formulaire d'ajout déjà rattaché au bon registre (Société ou Créances)
  // Ouvre le formulaire d'ajout avec la catégorie « Affaires » cochée (créée si elle
  // n'existe pas encore) et le projet pré-rempli s'il est connu
  // Ajout d'un revenu de participation depuis Société (catégorie créée si besoin)
  const openParticipationForm = () => {
    let cat = categories.find(isParticipationCat);
    if (!cat) {
      cat = { id: 'cat_participation', name: 'Participation', color: '#6d597a' };
      const created = cat;
      setCategories(prev => (prev.some(isParticipationCat) ? prev : [...prev, created]));
    }
    setEditingTx(null);
    setDefaultDate(null);
    setPrefillTx({
      id: uuid(),
      date: toISODate(new Date()),
      libelle: '',
      montant: '',
      type: 'revenu',
      categorieIds: [cat.id],
      remboursable: false,
      remboursableType: 'societe',
      rembourse: false,
      recu: false,
      justificatif: null,
      notes: '',
    });
    setShowTxForm(true);
  };

  const openAffaireForm = (projet = '') => {
    let cat = categories.find(isAffaireCat);
    if (!cat) {
      cat = { id: 'cat_affaires', name: 'Affaires', color: '#b5935a' };
      const created = cat;
      setCategories(prev => (prev.some(isAffaireCat) ? prev : [...prev, created]));
    }
    setEditingTx(null);
    setDefaultDate(null);
    setPrefillTx({
      id: uuid(),
      date: toISODate(new Date()),
      libelle: '',
      montant: '',
      type: 'dépense',
      categorieIds: [cat.id],
      remboursable: false,
      remboursableType: 'societe',
      rembourse: false,
      recu: true,
      justificatif: null,
      notes: '',
      montantDu: '',
      duPar: '',
      dette: false,
      affaire: projet,
      acheteur: '',
    });
    setShowTxForm(true);
  };

  const openRegistreForm = (remboursableType) => {
    const defaultCat = (remboursableType === 'societe' && categories.find(c => c.id === 'cat_travail'))
      || categories.find(c => c.id !== 'cat_revenu')
      || categories[0];
    setEditingTx(null);
    setDefaultDate(null);
    setPrefillTx({
      id: uuid(),
      date: toISODate(new Date()),
      libelle: '',
      montant: '',
      type: 'dépense',
      categorieIds: defaultCat ? [defaultCat.id] : [],
      remboursable: true,
      remboursableType,
      rembourse: false,
      recu: true,
      justificatif: null,
      notes: '',
      montantDu: '',
      duPar: '',
      dette: false,
    });
    setShowTxForm(true);
  };

  // Réaffectation lors de la suppression d'une catégorie
  useEffect(() => {
    const handler = (e) => {
      const { from, to } = e.detail;
      setTransactions(prev => prev.map(t => {
        const ids = getCatIds(t);
        if (!ids.includes(from)) return t;
        // Remplace `from` par `to`, déduplique, supprime l'ancien champ legacy
        const next = Array.from(new Set(ids.map(id => id === from ? to : id)));
        const { categorieId, ...rest } = t;
        return { ...rest, categorieIds: next };
      }));
    };
    window.addEventListener('reassign-cat', handler);
    return () => window.removeEventListener('reassign-cat', handler);
  }, []);

  // ===== Lecture des paramètres URL au démarrage =====
  // Permet l'automatisation iOS via Raccourcis Apple : un raccourci peut ouvrir
  // l'app avec une URL du type :
  //   https://lulabs23.github.io/finance/?action=add&montant=12.50&libelle=CARREFOUR&type=depense
  // Paramètres reconnus :
  //   action      : "add" pour ouvrir le formulaire d'ajout (seule valeur supportée pour l'instant)
  //   montant     : nombre (point ou virgule décimale)
  //   libelle     : texte libre (URL-encoded)
  //   date        : YYYY-MM-DD (sinon date du jour)
  //   type        : "revenu" ou "depense" (défaut "depense")
  //   categorie   : id de catégorie (cat_alim, cat_courses, ...) — optionnel
  //   remboursable: "1" pour cocher remboursable (uniquement si type=depense)
  //   notes       : texte libre (URL-encoded)
  // Une fois lu, on nettoie l'URL pour éviter de recréer la transaction au refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action !== 'add') return;

    const rawMontant = params.get('montant') || '';
    const montant = rawMontant.replace(',', '.').trim();
    const libelle = (params.get('libelle') || '').trim();
    const dateParam = (params.get('date') || '').trim();
    const typeParam = (params.get('type') || 'depense').toLowerCase();
    const categorieParam = (params.get('categorie') || '').trim();
    const remboursableParam = params.get('remboursable') === '1';
    const notesParam = (params.get('notes') || '').trim();

    const type = typeParam === 'revenu' ? 'revenu' : 'dépense';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : toISODate(new Date());

    // Choix de la catégorie :
    // - si categorieParam fourni et valide → on l'utilise
    // - sinon : revenu → cat_revenu ; dépense → cat_autre (ou première dispo)
    let categorieIds = [];
    if (categorieParam && DEFAULT_CATEGORIES.find(c => c.id === categorieParam)) {
      categorieIds = [categorieParam];
    } else if (type === 'revenu') {
      categorieIds = ['cat_revenu'];
    } else {
      categorieIds = ['cat_autre'];
    }

    const prefill = {
      id: uuid(),
      date,
      libelle: libelle || '',
      // Pour le formulaire, montant reste une string pour l'édition libre
      montant: montant || '',
      type,
      categorieIds,
      remboursable: remboursableParam && type === 'dépense',
      remboursableType: 'societe',
      rembourse: false,
      justificatif: null,
      notes: notesParam,
    };

    setPrefillTx(prefill);
    setEditingTx(null);
    setDefaultDate(null);
    setShowTxForm(true);

    // Nettoyer l'URL pour ne pas re-déclencher au refresh
    try {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    } catch {}
  }, []);


  // ===== Chargement initial depuis le gist au démarrage =====
  useEffect(() => {
    if (!isGistConnected || initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    let cancelled = false;
    setSyncStatus('loading');
    setSyncError('');
    gistApi.read(gistToken, gistId)
      .then(({ content, updatedAt }) => {
        if (cancelled) return;
        if (content?.transactions) setTransactions(content.transactions);
        if (content?.categories) setCategories(content.categories);
        setProjetsMeta(content?.affaires || {});
        setLastSyncAt(updatedAt);
        setSyncStatus('saved');
      })
      .catch(err => {
        if (cancelled) return;
        setSyncStatus('error');
        setSyncError(err.message);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Sauvegarde auto debounced sur le gist (1.5s après dernière modif) =====
  useEffect(() => {
    if (!isGistConnected) return;
    if (!initialLoadDoneRef.current) return; // Ne pas écraser tant qu'on n'a pas chargé
    if (syncStatus === 'loading') return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSyncStatus('saving');
      const payload = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        transactions,
        categories,
        affaires: projetsMeta,
      };
      gistApi.update(gistToken, gistId, payload)
        .then(data => {
          setSyncStatus('saved');
          setLastSyncAt(data.updated_at || new Date().toISOString());
          setSyncError('');
        })
        .catch(err => {
          setSyncStatus('error');
          setSyncError(err.message);
        });
    }, 1500);

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, categories, projetsMeta, gistToken, gistId]);

  // ===== Actions Gist =====
  const connectGist = async (newToken) => {
    if (!newToken) return;
    setSyncStatus('loading');
    setSyncError('');
    try {
      const user = await gistApi.checkToken(newToken);
      // Cherche un gist existant
      const existing = await gistApi.findExisting(newToken);
      let id;
      if (existing.length > 0) {
        id = existing[0].id;
        // Charge depuis le gist existant
        const { content, updatedAt } = await gistApi.read(newToken, id);
        if (content?.transactions) setTransactions(content.transactions);
        if (content?.categories) setCategories(content.categories);
        setProjetsMeta(content?.affaires || {});
        setLastSyncAt(updatedAt);
      } else {
        // Crée un nouveau gist avec les données actuelles
        const payload = {
          version: '1.0',
          savedAt: new Date().toISOString(),
          transactions,
          categories,
          affaires: projetsMeta,
        };
        const created = await gistApi.create(newToken, payload);
        id = created.id;
        setLastSyncAt(created.updated_at);
      }
      setGistToken(newToken);
      setGistId(id);
      setGistUser(user.login);
      writeLS('finances_gist_token', newToken);
      writeLS('finances_gist_id', id);
      writeLS('finances_gist_user', user.login);
      initialLoadDoneRef.current = true;
      setSyncStatus('saved');
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err.message);
      throw err;
    }
  };

  const disconnectGist = () => {
    setGistToken('');
    setGistId('');
    setGistUser('');
    writeLS('finances_gist_token', '');
    writeLS('finances_gist_id', '');
    writeLS('finances_gist_user', '');
    setSyncStatus('idle');
    setSyncError('');
    initialLoadDoneRef.current = false;
  };

  const forceSyncFromGist = async () => {
    if (!isGistConnected) return;
    setSyncStatus('loading');
    setSyncError('');
    try {
      const { content, updatedAt } = await gistApi.read(gistToken, gistId);
      if (content?.transactions) setTransactions(content.transactions);
      if (content?.categories) setCategories(content.categories);
        setProjetsMeta(content?.affaires || {});
      setLastSyncAt(updatedAt);
      setSyncStatus('saved');
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err.message);
    }
  };

  const addTransaction = (tx) => {
    if (editingTx) {
      setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t));
      setEditingTx(null);
    } else {
      setTransactions(prev => [...prev, tx]);
    }
    setShowTxForm(false);
    setDefaultDate(null);
  };

  const updateTransaction = (tx) => {
    setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t));
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Une échéance d'une dépense étalée renvoie à la transaction d'origine
  const deleteTransaction = (id) => setConfirmDeleteId(String(id).split('__e')[0]);
  const performDelete = () => {
    setTransactions(prev => prev.filter(t => t.id !== confirmDeleteId));
    setConfirmDeleteId(null);
  };

  const importBatch = (txs) => {
    setTransactions(prev => [...prev, ...txs]);
  };

  const exportData = async () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      transactions,
      categories,
      affaires: projetsMeta,
    };
    const json = JSON.stringify(data, null, 2);
    const filename = `finances-${toISODate(new Date())}.json`;

    // Tentative 1 : téléchargement natif via Blob
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    } catch (err) {
      console.warn('Téléchargement natif échoué, fallback :', err);
    }

    // Tentative 2 : ouvrir en data URI dans nouvelle fenêtre
    try {
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
      const w = window.open(dataUri, '_blank');
      if (w) return;
    } catch (err) {
      console.warn('Ouverture en nouvelle fenêtre échouée, fallback :', err);
    }

    // Tentative 3 : copier dans le presse-papiers
    try {
      await navigator.clipboard.writeText(json);
      alert('L\'export par téléchargement a été bloqué par le navigateur.\n\nVos données ont été copiées dans le presse-papiers — collez-les dans un fichier .json pour les sauvegarder.');
      return;
    } catch (err) {
      console.error('Toutes les méthodes d\'export ont échoué :', err);
      alert('Impossible d\'exporter automatiquement. Ouvrez la console du navigateur (F12) — vos données y seront affichées, sélectionnez-les et copiez-les dans un fichier .json.');
      console.log('=== DONNÉES À COPIER MANUELLEMENT ===\n' + json);
    }
  };

  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.version) throw new Error('Format invalide');
        if (data.transactions) setTransactions(data.transactions);
        if (data.categories) setCategories(data.categories);
        setProjetsMeta(data.affaires || {});
        alert(`Import réussi : ${data.transactions?.length || 0} transaction(s), ${data.categories?.length || 0} catégorie(s).`);
      } catch (err) {
        alert('Erreur lors de l\'import : ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Créances encore ouvertes (pastille de la navigation)
  const creancesPending = useMemo(
    () => transactions.filter(t => isDu(t, affaireCatIds, participationCatIds) && !isDuRegle(t)).length,
    [transactions, affaireCatIds, participationCatIds]
  );

  const navItems = [
    { id: 'calendar', label: 'Calendrier', icon: CalendarIcon },
    { id: 'tx', label: 'Transactions', icon: ArrowLeftRight },
    { id: 'times', label: 'Analyses', icon: BarChart3 },
    { id: 'affaires', label: 'Affaires', icon: Briefcase, group: 'Registres' },
    { id: 'societe', label: 'Société', icon: Building2, count: societePendingTxs.length },
    { id: 'reimb', label: 'Créances', icon: UserIcon, count: creancesPending },
  ];
  const goTo = (id) => { setView(id); window.scrollTo(0, 0); };
  const openNewTx = () => { setEditingTx(null); setDefaultDate(null); setShowTxForm(true); };

  // État de la synchronisation Gist
  const syncBusy = syncStatus === 'saving' || syncStatus === 'loading';
  const syncTitle =
    syncStatus === 'saving' ? 'Sauvegarde en cours…' :
    syncStatus === 'loading' ? 'Chargement…' :
    syncStatus === 'saved' ? `Synchronisé${lastSyncAt ? ' · ' + new Date(lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}` :
    syncStatus === 'error' ? `Erreur : ${syncError}` :
    'Synchronisation Gist';
  const syncLabel =
    syncStatus === 'saving' ? 'Sauvegarde…' :
    syncStatus === 'loading' ? 'Chargement…' :
    syncStatus === 'error' ? 'Erreur de synchro' :
    syncStatus === 'saved' ? 'Synchronisé' : 'Synchronisation';
  const syncColor = syncStatus === 'error' ? 'var(--neg)' : syncBusy ? 'var(--m-wait-2)' : syncStatus === 'saved' ? 'var(--m-ok)' : 'var(--faint)';
  const syncTime = syncStatus === 'saved' && lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';
  const syncIcon = (size) => syncBusy
    ? <RefreshCw size={size} className="animate-spin" style={{ color: syncColor }} />
    : syncStatus === 'error'
      ? <AlertCircle size={size} style={{ color: syncColor }} />
      : <span className="f-dot" style={{ background: syncColor }} />;

  return (
    <div className="f-app min-h-screen" style={{ backgroundColor: bgEnabled ? 'transparent' : 'var(--bg)' }}>
      {/* Background animé — affiché seulement si activé dans les paramètres */}
      {bgEnabled && <ParticleWaveBackground isDark={isDark} />}

      {/* Wrapper principal au-dessus du canvas (z-index: 1) */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <style>{APP_CSS}</style>

        <div className="f-shell">
          {/* Barre latérale (ordinateur) */}
          <aside className="f-side" aria-label="Navigation principale">
            <div className="flex items-center gap-2.5 px-2 py-1">
              <span className="f-logo"><Wallet size={14} /></span>
              <span className="text-[14px] font-semibold t-ink">Finances</span>
            </div>

            <div className="flex gap-1.5">
              <Button className="flex-1" onClick={openNewTx}>
                <Plus size={15} /> Nouvelle transaction
              </Button>
              <Button
                variant="secondary"
                className="f-btn-icon"
                onClick={() => setShowImport(true)}
                title="Importer un document"
                aria-label="Importer un document"
              >
                <Upload size={15} />
              </Button>
            </div>

            <nav className="flex flex-col gap-0.5" aria-label="Rubriques">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = view === item.id;
                return (
                  <React.Fragment key={item.id}>
                    {item.group && <span className="f-nav-g">{item.group}</span>}
                    <button
                      type="button"
                      onClick={() => goTo(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`f-nav no-touch-grow ${isActive ? 'on' : ''}`}
                    >
                      <Icon size={16} strokeWidth={isActive ? 2.1 : 1.8} />
                      {item.label}
                      {item.count > 0 && <span className="ct">{item.count}</span>}
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col gap-0.5">
              {isGistConnected && (
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  title={syncTitle}
                  className="f-nav f-nav-sync no-touch-grow"
                >
                  <span className="w-4 flex justify-center">{syncIcon(13)}</span>
                  <span className="truncate" style={syncStatus === 'error' ? { color: 'var(--neg)' } : undefined}>{syncLabel}</span>
                  {syncTime && <span className="ct">{syncTime}</span>}
                </button>
              )}
              <button type="button" onClick={() => setShowSettings(true)} className="f-nav no-touch-grow">
                <SlidersHorizontal size={16} strokeWidth={1.8} />
                Paramètres
              </button>
            </div>
          </aside>

          <div className="flex-1 min-w-0 flex flex-col">
            {/* Barre du haut (mobile et tablette) */}
            <header className="f-topbar">
              <span className="f-logo"><Wallet size={14} /></span>
              <span className="text-[15px] font-semibold t-ink">Finances</span>
              <div className="ml-auto flex items-center gap-0.5">
                {isGistConnected && (
                  <IconButton label={syncTitle} onClick={() => setShowSettings(true)} className="f-ibtn-lg">
                    {syncIcon(17)}
                  </IconButton>
                )}
                <IconButton label="Paramètres" onClick={() => setShowSettings(true)} className="f-ibtn-lg">
                  <SlidersHorizontal size={18} />
                </IconButton>
                <IconButton label="Importer un document" onClick={() => setShowImport(true)} className="f-ibtn-lg">
                  <Upload size={18} />
                </IconButton>
                <IconButton label="Ajouter une transaction" onClick={openNewTx} className="f-ibtn-lg f-add">
                  <Plus size={19} />
                </IconButton>
              </div>
            </header>

            {/* Contenu */}
            <main className="f-main">
              <div className="max-w-[1180px] mx-auto">
                {view === 'times' && <TimeViews transactions={visibleTransactions} categories={categories} isDark={isDark} />}
                {view === 'calendar' && <CalendarView transactions={visibleTransactions} categories={categories} onAddTx={(date) => { setEditingTx(null); setDefaultDate(date); setShowTxForm(true); }} onEdit={startEdit} onDelete={deleteTransaction} />}
                {view === 'tx' && <TransactionsList transactions={visibleTransactions} categories={categories} onEdit={startEdit} onDelete={deleteTransaction} />}
                {view === 'affaires' && <AffairesView transactions={transactions} categories={categories} affaireCatIds={affaireCatIds} projetsMeta={projetsMeta} onSetTauxMarge={setTauxMarge} onUpdate={updateTransaction} onEdit={startEdit} onDelete={deleteTransaction} onAdd={openAffaireForm} />}
                {view === 'societe' && <ReimbursableView key="societe" scope="societe" transactions={transactions} categories={categories} participationCatIds={participationCatIds} onUpdate={updateTransaction} onEdit={startEdit} onDelete={deleteTransaction} onAdd={() => openRegistreForm('societe')} onAddParticipation={openParticipationForm} />}
                {view === 'reimb' && <ReimbursableView key="proximite" scope="proximite" transactions={transactions} categories={categories} affaireCatIds={affaireCatIds} participationCatIds={participationCatIds} onUpdate={updateTransaction} onEdit={startEdit} onDelete={deleteTransaction} onAdd={() => openRegistreForm('proximite')} />}
              </div>
            </main>
          </div>
        </div>

        {/* Navigation du bas (mobile et tablette) */}
        <nav className="f-bottom" aria-label="Rubriques">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(item.id)}
                aria-label={item.label}
                title={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`f-tb no-touch-grow ${isActive ? 'on' : ''}`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.1 : 1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Input file invisible : déclenché par le bouton "Importer" dans la modale Paramètres */}
        <input
          ref={importJsonRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; }}
        />

        {/* Modale formulaire transaction */}
        <Modal
          open={showTxForm}
          onClose={() => { setShowTxForm(false); setEditingTx(null); setDefaultDate(null); setPrefillTx(null); }}
          title={
            editingTx ? 'Modifier la transaction'
              : (!prefillTx || (!prefillTx.libelle && !prefillTx.remboursable)) ? 'Nouvelle transaction'
              : (prefillTx.remboursable && !prefillTx.libelle)
                ? (prefillTx.remboursableType === 'proximite' ? 'Nouvelle créance' : 'Nouveau frais de société')
                : 'Nouvelle transaction (pré-remplie)'
          }
        >
          <TransactionForm
            initial={editingTx || prefillTx}
            categories={categories}
            personnes={personnes}
            projets={projets}
            acheteurs={acheteurs}
            defaultDate={defaultDate}
            onSave={(tx) => {
              // Si on est en mode pré-remplissage URL, l'objet "initial" qu'on a passé
              // a un id qu'on garde, mais ce n'est pas une édition existante : on ajoute.
              if (prefillTx && !editingTx) {
                setTransactions(prev => [...prev, tx]);
                setShowTxForm(false);
                setPrefillTx(null);
                setDefaultDate(null);
              } else {
                addTransaction(tx);
              }
            }}
            onCancel={() => { setShowTxForm(false); setEditingTx(null); setDefaultDate(null); setPrefillTx(null); }}
          />
        </Modal>

        {/* Modale confirmation de suppression */}
        <Modal
          open={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          title="Supprimer la transaction"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>Annuler</Button>
              <Button variant="danger" onClick={performDelete}>Supprimer</Button>
            </>
          }
        >
          <p className="t-ink2">
            {(() => {
              const cible = transactions.find(t => t.id === confirmDeleteId);
              return cible ? `Supprimer « ${cible.libelle} » ? ` : 'Supprimer cette transaction ? ';
            })()}
            Cette action est irréversible.
          </p>
        </Modal>

        {/* Modale Paramètres */}
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          gistToken={gistToken}
          gistId={gistId}
          gistUser={gistUser}
          isConnected={isGistConnected}
          syncStatus={syncStatus}
          syncError={syncError}
          lastSyncAt={lastSyncAt}
          onConnect={connectGist}
          onDisconnect={disconnectGist}
          onForceSync={forceSyncFromGist}
          themePref={themePref}
          onThemeChange={setThemePref}
          bgEnabled={bgEnabled}
          onBgToggle={() => setBgEnabled(v => !v)}
          isMobileTouch={isMobileTouch}
          onExport={exportData}
          onImportClick={() => importJsonRef.current?.click()}
          txCount={transactions.length}
          catCount={categories.length}
          categories={categories}
          allTransactions={transactions}
          onCategoriesChange={setCategories}
        />

        {/* Modale import OCR */}
        <ImportModal
          open={showImport}
          onClose={() => setShowImport(false)}
          onImport={importBatch}
          categories={categories}
        />
      </div> {/* fin wrapper z-index:1 */}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

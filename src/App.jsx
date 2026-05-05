import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Calendar as CalendarIcon, Upload, Download,
  Plus, Trash2, Edit2, X, Check, ChevronLeft, ChevronRight, FileText, Image as ImageIcon,
  Tags, RefreshCw, Receipt, AlertCircle, Search, Home, BarChart3, Clock, FolderOpen,
  CheckCircle2, Circle, Settings, Eye, EyeOff, Building2, User as UserIcon, Pencil, Cloud, Paperclip
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// ============================================================
// UTILITAIRES
// ============================================================

const uuid = () => 'tx_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

const formatEUR = (n) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v);
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
];

// Helper : récupère un tableau de categorieIds depuis une transaction,
// avec fallback rétro-compatible sur l'ancien champ categorieId.
const getCatIds = (tx) => {
  if (Array.isArray(tx.categorieIds) && tx.categorieIds.length > 0) return tx.categorieIds;
  if (tx.categorieId) return [tx.categorieId];
  return [];
};

const primaryCatId = (tx) => getCatIds(tx)[0] || null;

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

const Card = ({ children, className = '' }) => (
  <div className={`bg-white border border-stone-200/80 rounded-2xl ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', size = 'md', className = '', type = 'button', disabled, title }) => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl';
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };
  const variants = {
    primary: 'bg-stone-900 text-stone-50 hover:bg-stone-800 active:scale-[0.98]',
    secondary: 'bg-stone-100 text-stone-900 hover:bg-stone-200 active:scale-[0.98]',
    ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
    danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
    outline: 'border border-stone-300 text-stone-700 hover:bg-stone-50',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Input = ({ value, onChange, type = 'text', placeholder, className = '', ...rest }) => (
  <input
    type={type}
    value={value ?? ''}
    onChange={onChange}
    placeholder={placeholder}
    className={`w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 transition ${className}`}
    {...rest}
  />
);

const Select = ({ value, onChange, children, className = '' }) => (
  <select
    value={value}
    onChange={onChange}
    className={`w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 transition ${className}`}
  >
    {children}
  </select>
);

const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full ${sizes[size]} max-h-[90vh] overflow-hidden bg-white rounded-2xl shadow-2xl flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h3 className="font-serif text-xl text-stone-900">{title}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 transition">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

const Badge = ({ children, color = '#9c9c9c' }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
    style={{
      backgroundColor: color + '20',
      color: color,
    }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
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
    <span className="inline-flex flex-wrap gap-1">
      {display.map(id => {
        const c = categories.find(c => c.id === id);
        if (!c) return null;
        return <Badge key={id} color={c.color}>{c.name}</Badge>;
      })}
      {remaining > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-600">
          +{remaining}
        </span>
      )}
    </span>
  );
};

const ProgressBar = ({ value, max = 100 }) => (
  <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
    <div
      className="h-full bg-stone-900 transition-all duration-300"
      style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
    />
  </div>
);

// ============================================================
// PIÈCE JOINTE — sélecteur + viewer
// ============================================================

// Affiche une miniature et permet de visualiser/supprimer la pièce jointe.
// Si pas de pièce jointe, affiche un bouton "Ajouter une facture".
// Le justificatif est de la forme : { dataUrl, mimeType, sizeBytes, originalName }
const JustificatifPicker = ({ value, onChange, label = "Facture / Justificatif" }) => {
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
    <div>
      <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">{label}</label>
      {value ? (
        <div className="flex items-center gap-3 p-3 bg-stone-50 border border-stone-200 rounded-xl">
          {value.mimeType && value.mimeType.startsWith('image/') ? (
            <img
              src={value.dataUrl}
              alt="Aperçu"
              className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-80 transition border border-stone-200"
              onClick={() => setViewerOpen(true)}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-lg bg-stone-200 flex items-center justify-center cursor-pointer hover:bg-stone-300 transition"
              onClick={() => setViewerOpen(true)}
            >
              <FileText size={20} className="text-stone-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-stone-900 truncate">
              {value.originalName || 'Pièce jointe'}
            </p>
            <p className="text-xs text-stone-500">
              {value.mimeType === 'application/pdf' ? 'PDF' : 'Image'} · {formatFileSize(value.sizeBytes)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-200 transition"
            title="Voir"
          >
            <Eye size={14} />
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1.5 rounded-lg text-stone-600 hover:bg-rose-100 hover:text-rose-700 transition"
            title="Retirer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 border-2 border-dashed border-stone-300 rounded-xl text-sm text-stone-600 hover:border-stone-500 hover:bg-stone-50 transition disabled:opacity-50"
          >
            {busy ? (
              <><RefreshCw size={14} className="animate-spin" /> Traitement…</>
            ) : (
              <><Paperclip size={14} /> Ajouter une facture (photo ou PDF)</>
            )}
          </button>
          <p className="text-xs text-stone-400 mt-1.5">
            Image (JPG, PNG, HEIC) ou PDF · max 10 Mo · les images sont compressées automatiquement
          </p>
        </>
      )}
      {error && (
        <p className="text-xs text-rose-700 mt-1.5">{error}</p>
      )}
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

const TransactionForm = ({ initial, categories, onSave, onCancel, defaultDate }) => {
  const [tx, setTx] = useState(() => {
    if (initial) {
      // Migration : si la transaction n'a que categorieId, on la convertit
      const ids = getCatIds(initial);
      return { ...initial, categorieIds: ids };
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
      justificatif: null,
      notes: '',
    };
  });

  const handleSubmit = () => {
    if (!tx.libelle.trim()) return;
    const rawAmount = parseFloat(String(tx.montant).replace(',', '.'));
    if (isNaN(rawAmount) || rawAmount === 0) return;
    const finalAmount = tx.type === 'revenu' ? Math.abs(rawAmount) : -Math.abs(rawAmount);

    // Si aucune catégorie sélectionnée → fallback automatique
    let finalCatIds = tx.categorieIds && tx.categorieIds.length > 0
      ? tx.categorieIds
      : (tx.type === 'revenu'
          ? ['cat_revenu']
          : (categories.find(c => c.id === 'cat_autre') ? ['cat_autre'] : [categories[0]?.id].filter(Boolean)));

    const { categorieId, ...rest } = tx; // on retire l'ancien champ legacy
    onSave({ ...rest, categorieIds: finalCatIds, montant: finalAmount });
  };

  const toggleCat = (catId) => {
    const current = tx.categorieIds || [];
    if (current.includes(catId)) {
      setTx({ ...tx, categorieIds: current.filter(id => id !== catId) });
    } else {
      setTx({ ...tx, categorieIds: [...current, catId] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => {
            const fallback = categories.find(c => c.id !== 'cat_revenu')?.id;
            const next = (tx.categorieIds || []).filter(id => id !== 'cat_revenu');
            setTx({ ...tx, type: 'dépense', categorieIds: next.length > 0 ? next : (fallback ? [fallback] : []) });
          }}
          className={`flex-1 py-2.5 rounded-xl font-medium transition ${
            tx.type === 'dépense'
              ? 'bg-stone-900 text-white'
              : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
          }`}
        >
          Dépense
        </button>
        <button
          onClick={() => setTx({ ...tx, type: 'revenu', categorieIds: ['cat_revenu'] })}
          className={`flex-1 py-2.5 rounded-xl font-medium transition ${
            tx.type === 'revenu'
              ? 'bg-emerald-700 text-white'
              : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
          }`}
        >
          Revenu
        </button>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Libellé</label>
        <Input
          value={tx.libelle}
          onChange={(e) => setTx({ ...tx, libelle: e.target.value })}
          placeholder="Ex. Carrefour, Restaurant Le Soleil..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Montant (€)</label>
          <Input
            type="text"
            inputMode="decimal"
            value={tx.montant}
            onChange={(e) => setTx({ ...tx, montant: e.target.value })}
            placeholder="0,00"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Date</label>
          <Input type="date" value={tx.date} onChange={(e) => setTx({ ...tx, date: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">
          Catégories <span className="text-stone-400 normal-case tracking-normal">(une ou plusieurs)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => {
            const active = (tx.categorieIds || []).includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCat(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                  active
                    ? 'border-transparent text-white shadow-sm'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                }`}
                style={active ? { backgroundColor: c.color } : {}}
              >
                <span className="inline-flex items-center gap-1.5">
                  {!active && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />}
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tx.type === 'dépense' && (
        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 space-y-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={tx.remboursable}
              onChange={(e) => setTx({ ...tx, remboursable: e.target.checked, rembourse: e.target.checked ? tx.rembourse : false })}
              className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900/20"
            />
            <span className="text-sm text-stone-700">Cette dépense est remboursable</span>
          </label>
          {tx.remboursable && (
            <div className="ml-6 space-y-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setTx({ ...tx, remboursableType: 'societe' })}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                    (tx.remboursableType || 'societe') === 'societe'
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <Building2 size={12} /> Société
                </button>
                <button
                  type="button"
                  onClick={() => setTx({ ...tx, remboursableType: 'proximite' })}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                    tx.remboursableType === 'proximite'
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <UserIcon size={12} /> Proximité
                </button>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tx.rembourse}
                  onChange={(e) => setTx({ ...tx, rembourse: e.target.checked })}
                  className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900/20"
                />
                <span className="text-sm text-stone-600">Déjà remboursée</span>
              </label>
            </div>
          )}
        </div>
      )}

      <JustificatifPicker
        value={tx.justificatif}
        onChange={(v) => setTx({ ...tx, justificatif: v })}
      />

      <div>
        <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Notes (optionnel)</label>
        <textarea
          value={tx.notes}
          onChange={(e) => setTx({ ...tx, notes: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 transition resize-none"
          placeholder="Détails additionnels..."
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} className="flex-1">Annuler</Button>
        <Button onClick={handleSubmit} className="flex-1">Enregistrer</Button>
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

  return (
    <Modal open={open} onClose={handleClose} title="Importer un document" size="lg">
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-stone-600 leading-relaxed">
            Déposez un PDF (relevé bancaire, facture) ou une capture d'écran (PNG/JPEG).
            Le texte sera extrait automatiquement, puis vous pourrez valider chaque transaction.
          </p>

          {!ready && (
            <div className="flex items-center gap-2 text-sm text-stone-500 bg-stone-50 rounded-xl p-3">
              <RefreshCw size={16} className="animate-spin" />
              Chargement des outils d'analyse…
            </div>
          )}

          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              if (!ready) return;
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            onClick={() => ready && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition cursor-pointer ${
              ready ? 'border-stone-300 hover:border-stone-500 hover:bg-stone-50' : 'border-stone-200 opacity-50'
            }`}
          >
            <Upload className="mx-auto mb-3 text-stone-400" size={32} />
            <p className="text-stone-700 font-medium">Glissez-déposez votre fichier ici</p>
            <p className="text-sm text-stone-500 mt-1">ou cliquez pour parcourir</p>
            <p className="text-xs text-stone-400 mt-3">PDF · PNG · JPEG · max ~10 Mo</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => handleFile(e.target.files[0])}
              className="hidden"
            />
          </div>

          {parsing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-stone-700">{progressLabel}</span>
                <span className="text-stone-500">{progress}%</span>
              </div>
              <ProgressBar value={progress} />
            </div>
          )}
        </div>
      )}

      {step === 'text' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-600">
              Texte extrait — éditez si besoin avant la détection automatique :
            </p>
            <span className="text-xs text-stone-500">{extractedText.length} caractères</span>
          </div>

          <details className="group bg-stone-50 border border-stone-200 rounded-xl overflow-hidden">
            <summary className="px-4 py-2.5 cursor-pointer text-sm font-medium text-stone-700 hover:bg-stone-100 transition list-none flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertCircle size={14} className="text-stone-500" />
                Astuce : forcer le type et la catégorie
              </span>
              <ChevronRight size={14} className="transition-transform group-open:rotate-90 text-stone-500" />
            </summary>
            <div className="px-4 pb-4 pt-2 text-xs text-stone-600 space-y-3 border-t border-stone-200">
              <div>
                <p className="font-medium text-stone-800 mb-1">Type (revenu / dépense)</p>
                <p>Collez <code className="px-1.5 py-0.5 bg-white rounded border border-stone-200 text-stone-900 font-mono">+</code> ou <code className="px-1.5 py-0.5 bg-white rounded border border-stone-200 text-stone-900 font-mono">-</code> directement au montant.</p>
                <p className="mt-1 text-stone-500">Exemples : <code className="font-mono">+1500,00</code> = revenu · <code className="font-mono">-45,30</code> = dépense.</p>
                <p className="mt-1 text-stone-500">Sans signe collé, l'app devine via les mots-clés (paiement, salaire, etc.) — défaut : dépense.</p>
              </div>
              <div>
                <p className="font-medium text-stone-800 mb-1">Catégorie</p>
                <p>Ajoutez <code className="px-1.5 py-0.5 bg-white rounded border border-stone-200 text-stone-900 font-mono">[N]</code> dans la ligne, où N est le numéro ci-dessous. Plusieurs catégories : <code className="font-mono">[1,3]</code> ou <code className="font-mono">[2 5]</code>.</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {categories.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-1.5">
                      <span className="font-mono text-stone-900 w-5 text-right">{i + 1}.</span>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-stone-700">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-medium text-stone-800 mb-1">Remboursable</p>
                <p>
                  <code className="px-1.5 py-0.5 bg-white rounded border border-stone-200 text-stone-900 font-mono">[R]</code> société (en attente) ·{' '}
                  <code className="px-1.5 py-0.5 bg-white rounded border border-stone-200 text-stone-900 font-mono">[R*]</code> société (remboursée)
                </p>
                <p className="mt-1">
                  <code className="px-1.5 py-0.5 bg-white rounded border border-stone-200 text-stone-900 font-mono">[Rp]</code> proximité (en attente) ·{' '}
                  <code className="px-1.5 py-0.5 bg-white rounded border border-stone-200 text-stone-900 font-mono">[Rp*]</code> proximité (remboursée)
                </p>
                <p className="mt-1 text-stone-500">Variantes du suffixe acceptées : <code className="font-mono">*</code>, <code className="font-mono">+</code>, <code className="font-mono">✓</code>. Les revenus ne peuvent pas être remboursables.</p>
              </div>
              <div className="pt-1 border-t border-stone-200">
                <p className="font-medium text-stone-800 mb-1">Exemples complets</p>
                <div className="space-y-1.5">
                  <code className="block font-mono bg-white px-2 py-1.5 rounded border border-stone-200 text-stone-900">
                    15/03/2026 Carrefour [1] -67,50
                  </code>
                  <code className="block font-mono bg-white px-2 py-1.5 rounded border border-stone-200 text-stone-900">
                    20/03/2026 Train Paris [3] [R] -89,00
                  </code>
                  <code className="block font-mono bg-white px-2 py-1.5 rounded border border-stone-200 text-stone-900">
                    25/03/2026 Salaire [11] +1850,00
                  </code>
                </div>
              </div>
            </div>
          </details>

          <textarea
            value={extractedText}
            onChange={(e) => setExtractedText(e.target.value)}
            rows={14}
            className="w-full px-3 py-2 font-mono text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep('upload')}>← Retour</Button>
            <Button onClick={handleDetect} className="flex-1">Détecter les transactions</Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            <strong>{detected.filter(t => t._selected).length}</strong> transaction(s) sélectionnée(s) sur {detected.length} détectée(s).
            Décochez celles à ignorer, ajustez si nécessaire.
          </p>
          <div className="max-h-[400px] overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100">
            {detected.map((tx, idx) => (
              <div key={tx.id} className="p-3 flex items-start gap-3 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={tx._selected}
                  onChange={(e) => {
                    const next = [...detected];
                    next[idx]._selected = e.target.checked;
                    setDetected(next);
                  }}
                  className="mt-1 w-4 h-4 rounded border-stone-300"
                />
                <div className="flex-1 grid grid-cols-12 gap-1.5 items-center">
                  <Input
                    type="date"
                    value={tx.date}
                    onChange={(e) => {
                      const next = [...detected];
                      next[idx].date = e.target.value;
                      setDetected(next);
                    }}
                    className="col-span-3 text-sm py-1.5"
                  />
                  <Input
                    value={tx.libelle}
                    onChange={(e) => {
                      const next = [...detected];
                      next[idx].libelle = e.target.value;
                      setDetected(next);
                    }}
                    className="col-span-3 text-sm py-1.5"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={tx.montant}
                    onChange={(e) => {
                      const next = [...detected];
                      next[idx].montant = parseFloat(e.target.value) || 0;
                      next[idx].type = next[idx].montant >= 0 ? 'revenu' : 'dépense';
                      setDetected(next);
                    }}
                    className="col-span-2 text-sm py-1.5"
                  />
                  <div className="col-span-2 relative">
                    <button
                      type="button"
                      onClick={() => setOpenCatPicker(openCatPicker === idx ? null : idx)}
                      className="w-full px-2 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-xl hover:border-stone-400 transition text-left truncate"
                    >
                      {(tx.categorieIds || []).length === 0
                        ? <span className="text-stone-400">Aucune</span>
                        : (tx.categorieIds || []).length === 1
                          ? categories.find(c => c.id === tx.categorieIds[0])?.name || '—'
                          : `${tx.categorieIds.length} catégories`}
                    </button>
                    {openCatPicker === idx && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenCatPicker(null)} />
                        <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-stone-200 rounded-xl shadow-lg p-2 max-h-60 overflow-y-auto">
                          {categories.map(c => {
                            const ids = tx.categorieIds || [];
                            const active = ids.includes(c.id);
                            return (
                              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => {
                                    const next = [...detected];
                                    const cur = next[idx].categorieIds || [];
                                    if (active) {
                                      next[idx].categorieIds = cur.filter(id => id !== c.id);
                                    } else {
                                      next[idx].categorieIds = [...cur, c.id];
                                    }
                                    setDetected(next);
                                  }}
                                  className="w-4 h-4 rounded border-stone-300"
                                />
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                                <span className="text-sm text-stone-700 truncate">{c.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="col-span-2">
                    <select
                      value={tx.type === 'revenu' ? 'none' : (tx.remboursable ? (tx.rembourse ? 'paid' : 'pending') : 'none')}
                      disabled={tx.type === 'revenu'}
                      onChange={(e) => {
                        const next = [...detected];
                        const v = e.target.value;
                        next[idx].remboursable = v !== 'none';
                        next[idx].rembourse = v === 'paid';
                        setDetected(next);
                      }}
                      className="w-full px-1.5 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10 disabled:opacity-40"
                      title={tx.type === 'revenu' ? 'Non applicable aux revenus' : 'Statut de remboursement'}
                    >
                      <option value="none">Non remb.</option>
                      <option value="pending">En attente</option>
                      <option value="paid">Remboursée</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep('text')}>← Retour au texte</Button>
            <Button onClick={handleConfirm} className="flex-1">
              Importer {detected.filter(t => t._selected).length} transaction(s)
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ============================================================
// VUES TEMPORELLES
// ============================================================

const TimeViews = ({ transactions, categories }) => {
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

  return (
    <div className="space-y-5">
      {/* Sélecteur de période */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
          {periodOptions.map(o => (
            <button
              key={o.id}
              onClick={() => setPeriod(o.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                period === o.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40 text-sm py-1.5" />
            <span className="text-stone-400">→</span>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40 text-sm py-1.5" />
          </div>
        )}
        <span className="text-xs text-stone-500 ml-auto">
          {range.label} · {periodTxs.length} transaction{periodTxs.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Card className="p-3 md:p-5">
          <div className="flex items-center justify-between mb-1 h-4">
            <p className="text-xs uppercase tracking-wider text-emerald-700">Revenus</p>
            {rDelta !== null && (
              <span className={`text-xs font-medium tabular-nums ${rDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {rDelta >= 0 ? '+' : ''}{rDelta.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="font-serif text-xl md:text-2xl lg:text-3xl text-emerald-700 tabular-nums">{formatEUR(totalRevenus)}</p>
          <p className="text-xs text-stone-500 mt-1 truncate">vs {formatEUR(prevRevenus)} <span className="hidden lg:inline">période précédente</span><span className="lg:hidden">précédent</span></p>
        </Card>
        <Card className="p-3 md:p-5">
          <div className="flex items-center justify-between mb-1 h-4">
            <p className="text-xs uppercase tracking-wider text-stone-500">Dépenses</p>
            {dDelta !== null && (
              <span className={`text-xs font-medium tabular-nums ${dDelta <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {dDelta >= 0 ? '+' : ''}{dDelta.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="font-serif text-xl md:text-2xl lg:text-3xl text-stone-900 tabular-nums">{formatEUR(totalDepenses)}</p>
          <p className="text-xs text-stone-500 mt-1 truncate">vs {formatEUR(prevDepenses)} <span className="hidden lg:inline">période précédente</span><span className="lg:hidden">précédent</span></p>
        </Card>
        <Card className="p-3 md:p-5">
          <div className="flex items-center justify-between mb-1 h-4">
            <p className="text-xs uppercase tracking-wider text-stone-500">Solde</p>
          </div>
          <p className={`font-serif text-xl md:text-2xl lg:text-3xl tabular-nums ${solde >= 0 ? 'text-stone-900' : 'text-rose-700'}`}>
            {solde >= 0 ? '+' : '−'}{formatEUR(Math.abs(solde))}
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {totalRevenus > 0 ? `Taux d'épargne : ${((solde / totalRevenus) * 100).toFixed(1)}%` : 'Aucun revenu sur la période'}
          </p>
        </Card>
      </div>

      {/* Graphique principal — courbe revenus / dépenses */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-serif text-lg text-stone-900">Évolution</h3>
          <div className="flex items-center gap-4 text-xs text-stone-600">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-600 rounded" /> Revenus</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-stone-900 rounded" /> Dépenses</span>
            <span className="text-stone-400">· {granularity === 'day' ? 'par jour' : granularity === 'week' ? 'par semaine' : 'par mois'}</span>
          </div>
        </div>
        {seriesData.length === 0 ? (
          <p className="text-stone-500 text-sm py-8 text-center">Aucune transaction sur la période.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="label" stroke="#78716c" fontSize={11} tickMargin={6} />
                <YAxis stroke="#78716c" fontSize={11} tickFormatter={(v) => `${Math.round(v)}€`} width={55} />
                <Tooltip
                  formatter={(v, name) => [formatEUR(v), name === 'revenus' ? 'Revenus' : 'Dépenses']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="revenus" stroke="#047857" strokeWidth={2.2} dot={{ fill: '#047857', r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="depenses" stroke="#1c1917" strokeWidth={2.2} dot={{ fill: '#1c1917', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Indicateurs secondaires */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Dépense moy. / jour</p>
          <p className="font-serif text-xl text-stone-900 mt-1 tabular-nums">{formatEUR(avgDailyExp)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Dépense moy. / mois</p>
          <p className="font-serif text-xl text-stone-900 mt-1 tabular-nums">{formatEUR(avgMonthlyExp)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Nb dépenses</p>
          <p className="font-serif text-xl text-stone-900 mt-1 tabular-nums">{expenses.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Nb revenus</p>
          <p className="font-serif text-xl text-emerald-700 mt-1 tabular-nums">{incomes.length}</p>
        </Card>
      </div>

      {/* Donuts catégories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-serif text-lg text-stone-900 mb-4">Dépenses par catégorie</h3>
          {expDist.length === 0 ? (
            <p className="text-stone-500 text-sm py-8 text-center">Aucune dépense.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expDist} cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2} dataKey="value">
                      {expDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {expDist.map(c => {
                  const pct = totalDepenses > 0 ? (c.value / totalDepenses) * 100 : 0;
                  return (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 text-stone-700 truncate">{c.name}</span>
                      <span className="text-stone-500 tabular-nums">{pct.toFixed(0)}%</span>
                      <span className="font-medium text-stone-900 tabular-nums w-16 text-right">{formatEUR(c.value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-serif text-lg text-stone-900 mb-4">Revenus par catégorie</h3>
          {revDist.length === 0 ? (
            <p className="text-stone-500 text-sm py-8 text-center">Aucun revenu.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={revDist} cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2} dataKey="value">
                      {revDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {revDist.map(c => {
                  const pct = totalRevenus > 0 ? (c.value / totalRevenus) * 100 : 0;
                  return (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 text-stone-700 truncate">{c.name}</span>
                      <span className="text-stone-500 tabular-nums">{pct.toFixed(0)}%</span>
                      <span className="font-medium text-emerald-700 tabular-nums w-16 text-right">{formatEUR(c.value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Tops */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-serif text-lg text-stone-900 mb-4">Top 5 dépenses</h3>
          {top5Expenses.length === 0 ? (
            <p className="text-stone-500 text-sm py-4 text-center">Aucune dépense sur la période.</p>
          ) : (
            <div className="space-y-2">
              {top5Expenses.map((t, idx) => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 bg-stone-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-stone-900 text-white flex items-center justify-center text-[10px] font-medium shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-900 truncate text-sm">{t.libelle}</p>
                    <p className="text-xs text-stone-500">{formatDateFR(t.date)}</p>
                  </div>
                  <CatBadges ids={getCatIds(t)} categories={categories} max={1} />
                  <p className="font-serif text-base text-stone-900 tabular-nums">{formatEUR(Math.abs(t.montant))}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-serif text-lg text-stone-900 mb-4">Top 5 revenus</h3>
          {top5Incomes.length === 0 ? (
            <p className="text-stone-500 text-sm py-4 text-center">Aucun revenu sur la période.</p>
          ) : (
            <div className="space-y-2">
              {top5Incomes.map((t, idx) => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 bg-stone-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-medium shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-900 truncate text-sm">{t.libelle}</p>
                    <p className="text-xs text-stone-500">{formatDateFR(t.date)}</p>
                  </div>
                  <CatBadges ids={getCatIds(t)} categories={categories} max={1} />
                  <p className="font-serif text-base text-emerald-700 tabular-nums">+{formatEUR(Math.abs(t.montant))}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// CALENDRIER
// ============================================================

const CalendarView = ({ transactions, categories, onAddTx, onEdit, onDelete }) => {
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);
  const [viewingJustif, setViewingJustif] = useState(null);

  // Toutes les transactions du jour (revenus + dépenses, remboursées comprises)
  const monthName = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const lastDate = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const startWeekday = (first.getDay() + 6) % 7; // Lundi = 0
    const arr = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= lastDate; d++) {
      const dateObj = new Date(first.getFullYear(), first.getMonth(), d);
      const isoStr = toISODate(dateObj);
      const dayTxs = transactions.filter(t => t.date === isoStr);
      const depenses = dayTxs.filter(t => t.type === 'dépense').reduce((s, t) => s + Math.abs(t.montant), 0);
      const revenus = dayTxs.filter(t => t.type === 'revenu').reduce((s, t) => s + Math.abs(t.montant), 0);
      arr.push({
        date: dateObj,
        iso: isoStr,
        depenses,
        revenus,
        total: depenses + revenus,
        net: revenus - depenses,
        count: dayTxs.length,
        txs: dayTxs,
      });
    }
    return arr;
  }, [cursor, transactions]);

  // Intensité basée sur le total absolu (dépenses + revenus) pour la coloration de fond
  const maxDayActivity = Math.max(...days.filter(Boolean).map(d => d.depenses), 1);

  const intensity = (val) => {
    if (val === 0) return null;
    const pct = val / maxDayActivity;
    if (pct < 0.25) return 'bg-stone-100 text-stone-700';
    if (pct < 0.5) return 'bg-stone-300 text-stone-800';
    if (pct < 0.75) return 'bg-stone-600 text-white';
    return 'bg-stone-900 text-white';
  };

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';

  const monthRevenus = days.filter(Boolean).reduce((s, d) => s + d.revenus, 0);
  const monthDepenses = days.filter(Boolean).reduce((s, d) => s + d.depenses, 0);
  const monthNet = monthRevenus - monthDepenses;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft size={18} />
          </Button>
          <h3 className="font-serif text-xl text-stone-900 capitalize w-48 text-center">{monthName}</h3>
          <Button variant="ghost" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight size={18} />
          </Button>
        </div>
        <div className="flex items-center gap-5 ml-auto text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-emerald-700">Revenus</p>
            <p className="font-serif text-base text-emerald-700 tabular-nums">{formatEUR(monthRevenus)}</p>
          </div>
          <div className="w-px h-9 bg-stone-200" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Dépenses</p>
            <p className="font-serif text-base text-stone-900 tabular-nums">{formatEUR(monthDepenses)}</p>
          </div>
          <div className="w-px h-9 bg-stone-200" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Solde</p>
            <p className={`font-serif text-base tabular-nums ${monthNet >= 0 ? 'text-stone-900' : 'text-rose-700'}`}>
              {monthNet >= 0 ? '+' : '−'}{formatEUR(Math.abs(monthNet))}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-2 text-xs uppercase tracking-wider text-stone-500 text-center">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, idx) => {
          if (!d) return <div key={idx} className="aspect-square" />;
          const isToday = toISODate(new Date()) === d.iso;
          const cls = intensity(d.depenses);
          const isDark = cls && cls.includes('text-white');

          // Couleurs catégories distinctes pour le jour
          const catColors = [];
          d.txs.forEach(tx => {
            getCatIds(tx).forEach(id => {
              const col = getCatColor(id);
              if (!catColors.includes(col)) catColors.push(col);
            });
          });

          return (
            <button
              key={d.iso}
              onClick={() => setSelectedDay(d)}
              className={`aspect-square min-h-[72px] rounded-xl p-1.5 flex flex-col items-stretch justify-between transition relative text-left overflow-hidden
                ${cls || 'bg-stone-50 text-stone-600 hover:bg-stone-100'}
                ${isToday ? 'ring-2 ring-stone-900 ring-offset-1' : ''}
              `}
            >
              <div className="flex items-start justify-between">
                <span className={`text-xs font-medium ${isDark ? 'opacity-90' : ''}`}>
                  {d.date.getDate()}
                </span>
                {d.count > 0 && (
                  <span className={`text-[9px] font-medium px-1 rounded ${isDark ? 'bg-white/20' : 'bg-stone-200/70 text-stone-700'}`}>
                    {d.count}
                  </span>
                )}
              </div>

              {d.txs.length === 1 && (
                <div className={`text-[9px] leading-tight truncate ${isDark ? 'opacity-80' : 'text-stone-600'}`} title={d.txs[0].libelle}>
                  {d.txs[0].libelle}
                </div>
              )}
              {d.txs.length > 1 && (
                <div className="flex flex-wrap gap-0.5 my-0.5">
                  {catColors.slice(0, 5).map((col, i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} />
                  ))}
                </div>
              )}

              {/* Pied de cellule : revenus puis dépenses, séparés visuellement */}
              {(d.revenus > 0 || d.depenses > 0) && (
                <div className="flex flex-col gap-0">
                  {d.revenus > 0 && (
                    <span className={`text-[10px] font-medium tabular-nums leading-tight ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                      +{Math.round(d.revenus)}€
                    </span>
                  )}
                  {d.depenses > 0 && (
                    <span className={`text-[10px] font-medium tabular-nums leading-tight ${isDark ? '' : 'text-stone-700'}`}>
                      −{Math.round(d.depenses)}€
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatDateFR(selectedDay.iso) : ''}
      >
        {selectedDay && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="text-stone-600">{selectedDay.count} transaction{selectedDay.count > 1 ? 's' : ''}</span>
                {selectedDay.revenus > 0 && <span className="ml-3 text-emerald-700">+{formatEUR(selectedDay.revenus)}</span>}
                {selectedDay.depenses > 0 && <span className="ml-3 text-stone-900">−{formatEUR(selectedDay.depenses)}</span>}
              </div>
              <Button size="sm" onClick={() => {
                onAddTx(selectedDay.iso);
                setSelectedDay(null);
              }}>
                <Plus size={14} /> Ajouter
              </Button>
            </div>
            {selectedDay.txs.length === 0 ? (
              <p className="text-stone-500 text-sm">Aucune transaction ce jour-là.</p>
            ) : (
              <div className="space-y-2">
                {selectedDay.txs.map(t => (
                  <div key={t.id} className="group flex items-center gap-3 p-3 bg-stone-50 rounded-xl hover:bg-stone-100 transition">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-stone-900 truncate">{t.libelle}</p>
                        {t.justificatif && (
                          <button
                            onClick={() => setViewingJustif(t.justificatif)}
                            className="text-stone-500 hover:text-stone-900 transition shrink-0"
                            title="Voir la facture jointe"
                          >
                            <Paperclip size={12} />
                          </button>
                        )}
                        {t.remboursable && (
                          <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded ${
                            t.rembourse ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {(t.remboursableType || 'societe') === 'proximite' ? <UserIcon size={9} /> : <Building2 size={9} />}
                            {t.rembourse ? 'Remb.' : 'En attente'}
                          </span>
                        )}
                      </div>
                      <CatBadges ids={getCatIds(t)} categories={categories} max={3} />
                    </div>
                    <p className={`font-serif text-lg tabular-nums ${t.type === 'revenu' ? 'text-emerald-700' : 'text-stone-900'}`}>
                      {t.type === 'revenu' ? '+' : '−'}{formatEUR(Math.abs(t.montant))}
                    </p>
                    <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition">
                      <button
                        onClick={() => { onEdit && onEdit(t); setSelectedDay(null); }}
                        className="p-1.5 rounded-lg hover:bg-white text-stone-600 hover:text-stone-900 transition"
                        title="Modifier"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => { onDelete && onDelete(t.id); setSelectedDay(null); }}
                        className="p-1.5 rounded-lg hover:bg-white text-stone-600 hover:text-rose-600 transition"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
    </Card>
  );
};

// ============================================================
// REMBOURSABLES
// ============================================================

const ReimbursableView = ({ transactions, categories, onUpdate }) => {
  const reimbursables = transactions.filter(t => t.remboursable);
  const pending = reimbursables.filter(t => !t.rembourse);
  const completed = reimbursables.filter(t => t.rembourse);

  const totalPending = pending.reduce((s, t) => s + Math.abs(t.montant), 0);
  const totalCompleted = completed.reduce((s, t) => s + Math.abs(t.montant), 0);

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';
  const getCatName = (id) => categories.find(c => c.id === id)?.name || 'Inconnue';

  const [viewingJustif, setViewingJustif] = useState(null);

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoice, setInvoice] = useState({
    emetteurNom: '',
    emetteurAdresse: '',
    emetteurEmail: '',
    destinataireNom: '',
    destinataireAdresse: '',
    numero: 'NDF-' + new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'),
    objet: 'Note de frais à rembourser',
    selectedIds: pending.map(t => t.id),
  });

  // Resynchronise la sélection si pending change
  useEffect(() => {
    setInvoice(inv => ({
      ...inv,
      selectedIds: inv.selectedIds.filter(id => pending.some(p => p.id === id)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length]);

  const selectedTxs = pending.filter(t => invoice.selectedIds.includes(t.id));
  const invoiceTotal = selectedTxs.reduce((s, t) => s + Math.abs(t.montant), 0);

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
            <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:500;">${formatEUR(Math.abs(t.montant))}</td>
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
    font-family: Georgia, serif;
    font-weight: 500;
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
    font-family: Georgia, serif;
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
    <button onclick="window.print()" style="background:#1c1917;color:white;border:none;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:500;">
      🖨️ Imprimer / Enregistrer en PDF
    </button>
  </div>

  <div class="header">
    <div>
      <h1>Note de frais</h1>
      <div style="color:#78716c;font-size:13px;">${escapeHtml(invoice.objet)}</div>
    </div>
    <div class="meta">
      <strong>${escapeHtml(invoice.numero)}</strong>
      Émise le ${today}<br>
      ${selectedTxs.length} dépense${selectedTxs.length > 1 ? 's' : ''}
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
        <td colspan="4">Total à rembourser</td>
        <td>${formatEUR(invoiceTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="signature">
    <div class="signature-block">Date et signature de l'émetteur</div>
    <div class="signature-block">Date et signature pour accord de remboursement</div>
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
        <p style="margin:2px 0 0;font-size:12px;color:#57534e;">${escapeHtml(formatDateFR(t.date))} · ${formatEUR(Math.abs(t.montant))}</p>
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
    onUpdate({ ...tx, rembourse: !tx.rembourse });
  };

  const toggleInvoiceTx = (id) => {
    setInvoice(inv => ({
      ...inv,
      selectedIds: inv.selectedIds.includes(id)
        ? inv.selectedIds.filter(x => x !== id)
        : [...inv.selectedIds, id],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 bg-amber-50/40 border-amber-100">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="text-amber-700" size={20} />
            <p className="text-xs uppercase tracking-wider text-amber-800">En attente</p>
          </div>
          <p className="font-serif text-3xl text-stone-900">{formatEUR(totalPending)}</p>
          <p className="text-sm text-stone-600 mt-1">{pending.length} dépense{pending.length > 1 ? 's' : ''}</p>
        </Card>
        <Card className="p-5 bg-emerald-50/40 border-emerald-100">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="text-emerald-700" size={20} />
            <p className="text-xs uppercase tracking-wider text-emerald-800">Remboursé</p>
          </div>
          <p className="font-serif text-3xl text-stone-900">{formatEUR(totalCompleted)}</p>
          <p className="text-sm text-stone-600 mt-1">{completed.length} dépense{completed.length > 1 ? 's' : ''}</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-stone-900">En attente de remboursement</h3>
          {pending.length > 0 && (
            <Button size="sm" onClick={() => setInvoiceOpen(true)}>
              <FileText size={14} /> Générer une facture
            </Button>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-stone-500 text-sm">Aucune dépense en attente.</p>
        ) : (
          <div className="space-y-2">
            {pending.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl hover:bg-stone-100 transition">
                <button onClick={() => toggleRembourse(t)} className="text-stone-400 hover:text-emerald-700 transition" title="Marquer remboursé">
                  <Circle size={20} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-stone-900 truncate">{t.libelle}</p>
                    {t.justificatif && (
                      <button
                        onClick={() => setViewingJustif(t.justificatif)}
                        className="text-stone-500 hover:text-stone-900 transition shrink-0"
                        title="Voir la facture jointe"
                      >
                        <Paperclip size={12} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">{formatDateFR(t.date)}</p>
                </div>
                <CatBadges ids={getCatIds(t)} categories={categories} max={2} />
                <p className="font-serif text-lg text-stone-900">{formatEUR(Math.abs(t.montant))}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-serif text-lg text-stone-900 mb-4">Remboursées</h3>
        {completed.length === 0 ? (
          <p className="text-stone-500 text-sm">Aucune dépense remboursée pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {completed.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl opacity-60 hover:opacity-100 transition">
                <button onClick={() => toggleRembourse(t)} className="text-emerald-700" title="Annuler le remboursement">
                  <CheckCircle2 size={20} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-stone-900 truncate line-through">{t.libelle}</p>
                    {t.justificatif && (
                      <button
                        onClick={() => setViewingJustif(t.justificatif)}
                        className="text-stone-500 hover:text-stone-900 transition shrink-0"
                        title="Voir la facture jointe"
                      >
                        <Paperclip size={12} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">{formatDateFR(t.date)}</p>
                </div>
                <CatBadges ids={getCatIds(t)} categories={categories} max={2} />
                <p className="font-serif text-lg text-stone-700">{formatEUR(Math.abs(t.montant))}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Générer une facture / note de frais"
        size="lg"
      >
        <div className="space-y-5">
          <p className="text-sm text-stone-600">
            Composez la note de frais à partir de vos dépenses remboursables non remboursées.
            Le document s'ouvrira dans une nouvelle fenêtre, prêt à imprimer ou enregistrer en PDF.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">N° du document</label>
              <Input value={invoice.numero} onChange={(e) => setInvoice({ ...invoice, numero: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Objet</label>
              <Input value={invoice.objet} onChange={(e) => setInvoice({ ...invoice, objet: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-stone-500">Émetteur (vous)</p>
              <Input
                value={invoice.emetteurNom}
                onChange={(e) => setInvoice({ ...invoice, emetteurNom: e.target.value })}
                placeholder="Nom complet"
              />
              <textarea
                value={invoice.emetteurAdresse}
                onChange={(e) => setInvoice({ ...invoice, emetteurAdresse: e.target.value })}
                placeholder="Adresse postale"
                rows={2}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 resize-none"
              />
              <Input
                value={invoice.emetteurEmail}
                onChange={(e) => setInvoice({ ...invoice, emetteurEmail: e.target.value })}
                placeholder="email@exemple.fr"
                type="email"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-stone-500">Destinataire</p>
              <Input
                value={invoice.destinataireNom}
                onChange={(e) => setInvoice({ ...invoice, destinataireNom: e.target.value })}
                placeholder="Entreprise ou personne"
              />
              <textarea
                value={invoice.destinataireAdresse}
                onChange={(e) => setInvoice({ ...invoice, destinataireAdresse: e.target.value })}
                placeholder="Adresse postale"
                rows={2}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 resize-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider text-stone-500">Dépenses à inclure</p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setInvoice({ ...invoice, selectedIds: pending.map(t => t.id) })}>
                  Tout cocher
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setInvoice({ ...invoice, selectedIds: [] })}>
                  Tout décocher
                </Button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100">
              {pending.length === 0 ? (
                <p className="text-stone-500 text-sm p-4 text-center">Aucune dépense en attente à inclure.</p>
              ) : pending.map(t => {
                const checked = invoice.selectedIds.includes(t.id);
                return (
                  <label key={t.id} className="flex items-center gap-3 p-3 hover:bg-stone-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInvoiceTx(t.id)}
                      className="w-4 h-4 rounded border-stone-300"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{t.libelle}</p>
                      <p className="text-xs text-stone-500">{formatDateFR(t.date)}</p>
                    </div>
                    <p className="font-serif text-base text-stone-900 tabular-nums">{formatEUR(Math.abs(t.montant))}</p>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-stone-900 text-stone-50 rounded-xl">
            <div>
              <p className="text-xs uppercase tracking-wider text-stone-400">Total facturé</p>
              <p className="font-serif text-2xl mt-0.5">{formatEUR(invoiceTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-stone-400">
                {selectedTxs.length} dépense{selectedTxs.length > 1 ? 's' : ''}
              </p>
              {(() => {
                const withJustif = selectedTxs.filter(t => t.justificatif && t.justificatif.mimeType?.startsWith('image/')).length;
                return withJustif > 0 ? (
                  <p className="text-xs text-stone-500 mt-0.5 inline-flex items-center gap-1">
                    <Paperclip size={11} /> {withJustif} facture{withJustif > 1 ? 's' : ''} en annexe
                  </p>
                ) : null;
              })()}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setInvoiceOpen(false)} className="flex-1">Annuler</Button>
            <Button onClick={generateInvoice} disabled={selectedTxs.length === 0} className="flex-1">
              <FileText size={14} /> Générer le document
            </Button>
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
// ANALYSE PAR CATÉGORIE
// ============================================================

const CategoryAnalytics = ({ transactions, categories }) => {
  const [tab, setTab] = useState('all'); // all | dépense | revenu
  const [period, setPeriod] = useState('all'); // all | month | quarter | year

  // Période active
  const periodFilter = useMemo(() => {
    const now = new Date();
    if (period === 'month') return startOfMonth(now);
    if (period === 'quarter') return startOfMonth(addMonths(now, -2));
    if (period === 'year') return startOfMonth(addMonths(now, -11));
    return null;
  }, [period]);

  // Note : le filtrage des remboursables (selon les boutons société/proximité de
  // l'en-tête) est déjà appliqué en amont via passReimbFilter dans App.
  // On ne refiltre PAS ici : ainsi, quand l'utilisateur affiche "tout" (vert),
  // les dépenses remboursées sont bien comptées dans les statistiques.
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
          {[
            { id: 'all', label: 'Tout' },
            { id: 'dépense', label: 'Dépenses' },
            { id: 'revenu', label: 'Revenus' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                tab === t.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl ml-auto">
          {[
            { id: 'all', label: 'Tout l\'historique' },
            { id: 'year', label: '12 mois' },
            { id: 'quarter', label: '3 mois' },
            { id: 'month', label: 'Ce mois' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                period === p.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

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
          <p className="text-xs uppercase tracking-wider text-stone-500">Solde</p>
          <p className={`font-serif text-2xl mt-1 ${totalRevenus - totalDepenses >= 0 ? 'text-stone-900' : 'text-rose-700'}`}>
            {formatEUR(totalRevenus - totalDepenses)}
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-serif text-lg text-stone-900 mb-4">Détail par catégorie</h3>
        {catData.length === 0 ? (
          <p className="text-stone-500 text-sm py-4 text-center">Aucune transaction sur la période sélectionnée.</p>
        ) : (
          <div className="space-y-1.5">
            {catData.map(c => {
              const showDep = tab !== 'revenu' && c.depenses > 0;
              const showRev = tab !== 'dépense' && c.revenus > 0;
              return (
                <div key={c.id} className="p-3 bg-stone-50 rounded-xl">
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
            <h3 className="font-serif text-lg text-stone-900 mb-4">Répartition des dépenses</h3>
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
            <h3 className="font-serif text-lg text-stone-900 mb-4">Répartition des revenus</h3>
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
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('stats')}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            tab === 'stats' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <BarChart3 size={14} /> Analyse
        </button>
        <button
          onClick={() => setTab('manage')}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            tab === 'manage' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Settings size={14} /> Gérer
        </button>
      </div>
      {tab === 'stats' && <CategoryAnalytics transactions={transactions} categories={categories} />}
      {tab === 'manage' && <CategoriesView categories={categories} transactions={allTransactions} onCategoriesChange={onCategoriesChange} />}
    </div>
  );
};

// ============================================================
// CATÉGORIES (gestion)
// ============================================================

const CategoriesView = ({ categories, transactions, onCategoriesChange }) => {
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', color: '#84a98c' });
  const [deleteAsk, setDeleteAsk] = useState(null);
  const [reassignTo, setReassignTo] = useState('');

  const palette = ['#84a98c', '#52796f', '#cad2c5', '#a98467', '#d8a48f', '#bb8588', '#3d5a80',
                   '#9c9c9c', '#e07a5f', '#81b29a', '#f2cc8f', '#3a86ff', '#8338ec', '#ff006e'];

  const addCategory = () => {
    if (!newCat.name.trim()) return;
    onCategoriesChange([...categories, { id: 'cat_' + uuid(), name: newCat.name.trim(), color: newCat.color }]);
    setNewCat({ name: '', color: '#84a98c' });
    setShowAdd(false);
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

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-stone-900">Catégories</h3>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Nouvelle catégorie
          </Button>
        </div>

        <div className="space-y-2">
          {categories.map(c => {
            const count = transactions.filter(t => getCatIds(t).includes(c.id)).length;
            return (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                {editing === c.id ? (
                  <>
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) => updateCategory(c.id, { color: e.target.value })}
                      className="w-9 h-9 rounded-lg cursor-pointer border-stone-200"
                    />
                    <Input
                      value={c.name}
                      onChange={(e) => updateCategory(c.id, { name: e.target.value })}
                      className="flex-1"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><Check size={16} /></Button>
                  </>
                ) : (
                  <>
                    <span className="w-9 h-9 rounded-lg" style={{ backgroundColor: c.color }} />
                    <div className="flex-1">
                      <p className="font-medium text-stone-900">{c.name}</p>
                      <p className="text-xs text-stone-500">{count} transaction{count > 1 ? 's' : ''}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c.id)}>
                      <Edit2 size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(c)} title="Supprimer">
                      <Trash2 size={14} className="text-rose-600" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Nouvelle catégorie">
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Nom</label>
            <Input
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              placeholder="Ex. Voyages, Études..."
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Couleur</label>
            <div className="flex flex-wrap gap-2">
              {palette.map(col => (
                <button
                  key={col}
                  onClick={() => setNewCat({ ...newCat, color: col })}
                  className={`w-9 h-9 rounded-lg transition ${newCat.color === col ? 'ring-2 ring-offset-2 ring-stone-900' : ''}`}
                  style={{ backgroundColor: col }}
                />
              ))}
              <input
                type="color"
                value={newCat.color}
                onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
                className="w-9 h-9 rounded-lg cursor-pointer"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)} className="flex-1">Annuler</Button>
            <Button onClick={addCategory} className="flex-1">Créer</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteAsk} onClose={() => setDeleteAsk(null)} title="Réaffecter les transactions">
        {deleteAsk && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="text-amber-700 mt-0.5 shrink-0" size={18} />
              <p className="text-sm text-stone-700">
                <strong>{transactions.filter(t => getCatIds(t).includes(deleteAsk.id)).length}</strong> transaction(s)
                utilisent encore la catégorie « {deleteAsk.name} ». Choisissez une catégorie de remplacement avant de supprimer.
              </p>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Réaffecter vers</label>
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                {categories.filter(c => c.id !== deleteAsk.id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDeleteAsk(null)} className="flex-1">Annuler</Button>
              <Button variant="primary" onClick={confirmDelete} className="flex-1">Supprimer et réaffecter</Button>
            </div>
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

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';
  const getCatName = (id) => categories.find(c => c.id === id)?.name || 'Inconnue';

  const filtered = transactions
    .filter(t => {
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterCat !== 'all' && !getCatIds(t).includes(filterCat)) return false;
      if (search && !t.libelle.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="font-serif text-lg text-stone-900 mr-auto">Toutes les transactions</h3>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="pl-9 w-56"
          />
        </div>
        <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-36">
          <option value="all">Tous types</option>
          <option value="dépense">Dépenses</option>
          <option value="revenu">Revenus</option>
        </Select>
        <Select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="w-44">
          <option value="all">Toutes catégories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-stone-500 text-sm py-6 text-center">Aucune transaction.</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(t => (
            <div key={t.id} className="group flex items-center gap-3 p-3 bg-stone-50 rounded-xl hover:bg-stone-100 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-stone-900 truncate">{t.libelle}</p>
                  {t.justificatif && (
                    <button
                      onClick={() => setViewingJustif(t.justificatif)}
                      className="inline-flex items-center gap-0.5 text-stone-500 hover:text-stone-900 transition shrink-0"
                      title="Voir la facture jointe"
                    >
                      <Paperclip size={12} />
                    </button>
                  )}
                  {t.remboursable && (
                    <span className={`text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded
                      ${t.rembourse ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {t.rembourse ? 'Remboursé' : 'Remb. en attente'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500">{formatDateFR(t.date)}</p>
              </div>
              <CatBadges ids={getCatIds(t)} categories={categories} max={2} />
              <p className={`font-serif text-lg tabular-nums w-32 text-right ${
                t.type === 'revenu' ? 'text-emerald-700' : 'text-stone-900'
              }`}>
                {t.type === 'revenu' ? '+' : '−'} {formatEUR(Math.abs(t.montant))}
              </p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <Button size="sm" variant="ghost" onClick={() => onEdit(t)}>
                  <Edit2 size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(t.id)}>
                  <Trash2 size={14} className="text-rose-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <JustificatifViewer
        open={!!viewingJustif}
        onClose={() => setViewingJustif(null)}
        justificatif={viewingJustif}
      />
    </Card>
  );
};

// ============================================================
// TABLEAU DE BORD
// ============================================================

const Dashboard = ({ transactions, categories, allTransactions }) => {
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

  // Pending de remboursement (sur tout le registre, indépendant du masquage)
  const pendingReimb = (allTransactions || transactions)
    .filter(t => t.remboursable && !t.rembourse)
    .reduce((s, t) => s + Math.abs(t.montant), 0);

  const balance = revenue - netExpenses;

  const recent = [...transactions]
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
      <Card className="p-6 bg-gradient-to-br from-stone-900 to-stone-800 text-stone-50 border-stone-900">
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
          <p className="text-xs uppercase tracking-wider text-emerald-700">Revenus</p>
          <p className="font-serif text-2xl text-emerald-700 mt-1 tabular-nums">{formatEUR(revenue)}</p>
          <p className="text-xs text-stone-500 mt-1">{thisMonth.filter(t => t.type === 'revenu').length} entrée{thisMonth.filter(t => t.type === 'revenu').length > 1 ? 's' : ''}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Dépenses</p>
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
          <p className="text-xs text-stone-500 mt-1">Remboursements en attente</p>
        </Card>
      </div>

      {/* Mini graphique + récents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <h3 className="font-serif text-lg text-stone-900 mb-4">4 dernières semaines</h3>
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
          <h3 className="font-serif text-lg text-stone-900 mb-4">Dernières transactions</h3>
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

const SettingsModal = ({ open, onClose, gistToken, gistId, gistUser, isConnected, syncStatus, syncError, lastSyncAt, onConnect, onDisconnect, onForceSync }) => {
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

  return (
    <Modal open={open} onClose={onClose} title="Paramètres" size="md">
      <div className="space-y-5">
        {/* Section : Synchronisation Gist */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Cloud size={16} className="text-stone-700" />
            <h4 className="font-medium text-stone-900">Synchronisation GitHub Gist</h4>
          </div>

          <p className="text-sm text-stone-600 mb-3">
            Sauvegarde automatique de tes données dans un Gist privé sur ton compte GitHub.
            Tes transactions et catégories sont synchronisées entre tous tes appareils, sans serveur tiers.
          </p>

          {!isConnected ? (
            <div className="space-y-3">
              <details className="bg-stone-50 border border-stone-200 rounded-xl overflow-hidden">
                <summary className="px-4 py-2.5 cursor-pointer text-sm font-medium text-stone-700 hover:bg-stone-100 transition list-none flex items-center gap-2">
                  <AlertCircle size={14} className="text-stone-500" />
                  Comment générer un token GitHub ?
                </summary>
                <div className="px-4 pb-4 pt-2 text-xs text-stone-600 space-y-2 border-t border-stone-200">
                  <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                    <li>Va sur <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" className="text-stone-900 underline">github.com/settings/tokens</a></li>
                    <li>Clique sur <strong>"Generate new token"</strong> → <strong>"Fine-grained personal access token"</strong></li>
                    <li>Donne un nom (ex. <em>Finances perso</em>) et une expiration (ex. 1 an)</li>
                    <li>Sous <strong>"Account permissions"</strong>, trouve <strong>"Gists"</strong> et passe-le à <strong>Read and write</strong></li>
                    <li>Clique <strong>"Generate token"</strong>, copie le token (ghp_...) et colle-le ci-dessous</li>
                  </ol>
                  <p className="text-stone-500 pt-1 border-t border-stone-200">
                    Ton token est stocké uniquement dans ce navigateur. Il n'est jamais envoyé ailleurs que sur l'API GitHub.
                  </p>
                </div>
              </details>

              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Token GitHub</label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="github_pat_… ou ghp_…"
                    className="font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700"
                  >
                    {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {(localError || syncError) && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="text-rose-700 mt-0.5 shrink-0" size={14} />
                  <p className="text-xs text-rose-700">{localError || syncError}</p>
                </div>
              )}

              <Button onClick={handleConnect} disabled={busy || !tokenInput.trim()} className="w-full">
                {busy ? <RefreshCw size={14} className="animate-spin" /> : <Cloud size={14} />}
                {busy ? 'Connexion…' : 'Connecter GitHub Gist'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-start gap-2">
                <CheckCircle2 className="text-emerald-700 mt-0.5 shrink-0" size={16} />
                <div className="flex-1 text-sm">
                  <p className="text-stone-900 font-medium">Synchronisation active</p>
                  <p className="text-stone-600 text-xs mt-0.5">
                    Connecté en tant que <strong>{gistUser || '—'}</strong>
                  </p>
                  <p className="text-stone-500 text-xs mt-0.5 font-mono break-all">
                    Gist ID : {gistId}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="uppercase tracking-wider text-stone-500">Statut</p>
                  <p className="text-stone-900 font-medium mt-0.5">
                    {syncStatus === 'saving' && 'Sauvegarde…'}
                    {syncStatus === 'loading' && 'Chargement…'}
                    {syncStatus === 'saved' && 'À jour'}
                    {syncStatus === 'error' && 'Erreur'}
                    {syncStatus === 'idle' && 'En veille'}
                  </p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="uppercase tracking-wider text-stone-500">Dernière sync</p>
                  <p className="text-stone-900 font-medium mt-0.5">
                    {lastSyncAt ? new Date(lastSyncAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </p>
                </div>
              </div>

              {syncError && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="text-rose-700 mt-0.5 shrink-0" size={14} />
                  <p className="text-xs text-rose-700">{syncError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onForceSync} disabled={syncStatus === 'loading' || syncStatus === 'saving'} className="flex-1">
                  <RefreshCw size={13} className={syncStatus === 'loading' ? 'animate-spin' : ''} />
                  Recharger depuis Gist
                </Button>
                <Button variant="outline" size="sm" onClick={handleDisconnect} className="flex-1">
                  Déconnecter
                </Button>
              </div>

              <p className="text-xs text-stone-500 leading-relaxed">
                ⚠️ Si tu utilises l'app sur plusieurs appareils en parallèle, recharge depuis le Gist
                avant de modifier — la dernière sauvegarde écrase la précédente.
              </p>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};

// ============================================================
// APPLICATION PRINCIPALE
// ============================================================

export default function App() {
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
  const [view, setView] = useState('dashboard');
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [defaultDate, setDefaultDate] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showSociete, setShowSociete] = useState('hide');
  const [showProximite, setShowProximite] = useState('hide');
  // Transaction pré-remplie depuis les paramètres d'URL (?action=add&montant=...&libelle=...)
  // Sert à l'automatisation iOS via Raccourcis : on ouvre l'URL, le formulaire s'ouvre déjà rempli.
  const [prefillTx, setPrefillTx] = useState(null);
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

  // Filtre une transaction selon son statut remboursable et le réglage actif
  const passReimbFilter = useCallback((t) => {
    if (!t.remboursable) return true; // dépenses normales toujours visibles
    const type = t.remboursableType || 'societe';
    const setting = type === 'proximite' ? showProximite : showSociete;
    if (setting === 'hide') return false;
    if (setting === 'pending') return !t.rembourse;
    return true; // 'all'
  }, [showSociete, showProximite]);

  const visibleTransactions = useMemo(() =>
    transactions.filter(passReimbFilter),
    [transactions, passReimbFilter]
  );

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
  }, [transactions, categories, gistToken, gistId]);

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
        setLastSyncAt(updatedAt);
      } else {
        // Crée un nouveau gist avec les données actuelles
        const payload = {
          version: '1.0',
          savedAt: new Date().toISOString(),
          transactions,
          categories,
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
  const deleteTransaction = (id) => setConfirmDeleteId(id);
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
        alert(`Import réussi : ${data.transactions?.length || 0} transaction(s), ${data.categories?.length || 0} catégorie(s).`);
      } catch (err) {
        alert('Erreur lors de l\'import : ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const navItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: Home },
    { id: 'times', label: 'Analyses', icon: BarChart3 },
    { id: 'cats', label: 'Catégories', icon: Tags },
    { id: 'calendar', label: 'Calendrier', icon: CalendarIcon },
    { id: 'tx', label: 'Transactions', icon: Receipt },
    { id: 'reimb', label: 'Remboursables', icon: RefreshCw },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');
        .font-serif { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
        body, html { font-family: 'Inter', system-ui, sans-serif; }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-stone-50/80 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-stone-900 rounded-lg flex items-center justify-center">
              <Wallet className="text-stone-50" size={18} />
            </div>
            <div>
              <h1 className="font-serif text-lg leading-none text-stone-900">Finances</h1>
              <p className="text-[10px] uppercase tracking-widest text-stone-500 mt-0.5">Gestion personnelle</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 ml-6">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                    view === item.id
                      ? 'bg-stone-900 text-stone-50'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {(() => {
              const cycle = (s) => s === 'hide' ? 'pending' : s === 'pending' ? 'all' : 'hide';
              const stateClass = (s) => {
                if (s === 'hide') return 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50';
                if (s === 'pending') return 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600';
                return 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700';
              };
              const stateLabel = (s, kind) => {
                const k = kind === 'societe' ? 'société' : 'proximité';
                if (s === 'hide') return `Remb. ${k} : masqués (clic = en attente)`;
                if (s === 'pending') return `Remb. ${k} : en attente uniquement (clic = tous)`;
                return `Remb. ${k} : tous affichés (clic = masquer)`;
              };
              return (
                <>
                  <button
                    onClick={() => setShowSociete(cycle)}
                    title={stateLabel(showSociete, 'societe')}
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border transition shadow-sm ${stateClass(showSociete)}`}
                  >
                    <Building2 size={18} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => setShowProximite(cycle)}
                    title={stateLabel(showProximite, 'proximite')}
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border transition shadow-sm ${stateClass(showProximite)}`}
                  >
                    <UserIcon size={18} strokeWidth={2} />
                  </button>
                </>
              );
            })()}
            {isGistConnected && (
              <button
                onClick={() => setShowSettings(true)}
                title={
                  syncStatus === 'saving' ? 'Sauvegarde en cours…' :
                  syncStatus === 'loading' ? 'Chargement…' :
                  syncStatus === 'saved' ? `Synchronisé${lastSyncAt ? ' · ' + new Date(lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}` :
                  syncStatus === 'error' ? `Erreur : ${syncError}` :
                  'Synchronisation Gist'
                }
                className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition shadow-sm ${
                  syncStatus === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' :
                  syncStatus === 'saving' || syncStatus === 'loading' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {syncStatus === 'saving' || syncStatus === 'loading' ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : syncStatus === 'error' ? (
                  <AlertCircle size={15} />
                ) : (
                  <Cloud size={15} />
                )}
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              title="Paramètres"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 transition shadow-sm"
            >
              <Settings size={15} />
            </button>
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Upload size={14} /> <span className="hidden sm:inline">Importer un document</span>
            </Button>
            <Button size="sm" onClick={() => { setEditingTx(null); setDefaultDate(null); setShowTxForm(true); }}>
              <Plus size={14} /> <span className="hidden sm:inline">Ajouter</span>
            </Button>
          </div>
        </div>

        {/* Nav mobile */}
        <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  view === item.id
                    ? 'bg-stone-900 text-stone-50'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Icon size={12} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Welcome */}
      {showWelcome && transactions.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 mt-4">
          <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="text-amber-700 mt-0.5 shrink-0" size={18} />
            <div className="flex-1">
              <p className="text-sm text-stone-800">
                <strong>Bienvenue !</strong> Cette application stocke vos données uniquement en mémoire,
                elles seront perdues à la fermeture de l'onglet. Pensez à <strong>exporter régulièrement</strong>
                {' '}vos données via le bouton <FolderOpen size={12} className="inline -mt-0.5" /> en bas de page.
              </p>
            </div>
            <button onClick={() => setShowWelcome(false)} className="text-stone-500 hover:text-stone-900">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {view === 'dashboard' && <Dashboard transactions={visibleTransactions} categories={categories} allTransactions={transactions} />}
        {view === 'times' && <TimeViews transactions={visibleTransactions} categories={categories} />}
        {view === 'cats' && <CategoriesPage transactions={visibleTransactions} allTransactions={transactions} categories={categories} onCategoriesChange={setCategories} />}
        {view === 'calendar' && <CalendarView transactions={visibleTransactions} categories={categories} onAddTx={(date) => { setDefaultDate(date); setShowTxForm(true); }} onEdit={(t) => { setEditingTx(t); setShowTxForm(true); }} onDelete={deleteTransaction} />}
        {view === 'tx' && <TransactionsList transactions={visibleTransactions} categories={categories} onEdit={(t) => { setEditingTx(t); setShowTxForm(true); }} onDelete={deleteTransaction} />}
        {view === 'reimb' && <ReimbursableView transactions={transactions} categories={categories} onUpdate={updateTransaction} />}
      </main>

      {/* Footer : import/export */}
      <footer className="border-t border-stone-200/60 bg-white/40 mt-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            {transactions.length} transaction{transactions.length > 1 ? 's' : ''} · {categories.length} catégorie{categories.length > 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportData}>
              <Download size={14} /> Exporter mes données
            </Button>
            <Button size="sm" variant="outline" onClick={() => importJsonRef.current?.click()}>
              <FolderOpen size={14} /> Importer mes données
            </Button>
            <input
              ref={importJsonRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; }}
            />
          </div>
        </div>
      </footer>

      {/* Modale formulaire transaction */}
      <Modal
        open={showTxForm}
        onClose={() => { setShowTxForm(false); setEditingTx(null); setDefaultDate(null); }}
        title={editingTx ? 'Modifier la transaction' : 'Nouvelle transaction'}
      >
        <TransactionForm
          initial={editingTx}
          categories={categories}
          defaultDate={defaultDate}
          onSave={addTransaction}
          onCancel={() => { setShowTxForm(false); setEditingTx(null); setDefaultDate(null); }}
        />
      </Modal>

      {/* Modale confirmation de suppression */}
      <Modal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Supprimer la transaction"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-700">
            Êtes-vous sûr de vouloir supprimer cette transaction ? Cette action est irréversible.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeleteId(null)} className="flex-1">Annuler</Button>
            <Button onClick={performDelete} className="flex-1 !bg-rose-600 hover:!bg-rose-700">Supprimer</Button>
          </div>
        </div>
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
      />

      {/* Modale import OCR */}
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={importBatch}
        categories={categories}
      />
    </div>
  );
}

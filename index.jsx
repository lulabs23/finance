import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Calendar as CalendarIcon, Upload, Download,
  Plus, Trash2, Edit2, X, Check, ChevronLeft, ChevronRight, FileText, Image as ImageIcon,
  Tags, RefreshCw, Receipt, AlertCircle, Search, Home, BarChart3, Clock, FolderOpen,
  CheckCircle2, Circle, Settings
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

// Catégories par défaut
const DEFAULT_CATEGORIES = [
  { id: 'cat_alim', name: 'Alimentation', color: '#84a98c' },
  { id: 'cat_trans', name: 'Transport', color: '#cad2c5' },
  { id: 'cat_loisir', name: 'Loisirs', color: '#a98467' },
  { id: 'cat_logement', name: 'Logement', color: '#52796f' },
  { id: 'cat_sante', name: 'Santé', color: '#d8a48f' },
  { id: 'cat_abo', name: 'Abonnements', color: '#bb8588' },
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

const parseTransactionsFromText = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];

  // Regex montants : "12,34", "1 234,56", "12.34", optionnel signe et "EUR" ou "€"
  const amountRegex = /(-?\d{1,3}(?:[\s.]\d{3})*(?:[,.]\d{2}))\s*(?:€|EUR)?/i;
  // Regex dates : 01/02/2024, 01-02-24, 01.02.2024
  const dateRegex = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    const amountMatch = line.match(amountRegex);
    if (!amountMatch) continue;

    let dateISO = toISODate(new Date());
    if (dateMatch) {
      let [, dd, mm, yy] = dateMatch;
      if (yy.length === 2) yy = (parseInt(yy) > 50 ? '19' : '20') + yy;
      const d = new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
      if (!isNaN(d.getTime())) dateISO = toISODate(d);
    }

    const rawAmount = amountMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    let amount = parseFloat(rawAmount);
    if (isNaN(amount)) continue;

    // Heuristique : si la ligne contient des mots-clés négatifs, c'est une dépense
    const lower = line.toLowerCase();
    const negativeKeywords = ['paiement', 'achat', 'prelevement', 'prélèvement', 'retrait', 'cb '];
    const positiveKeywords = ['virement reçu', 'salaire', 'remboursement', 'credit', 'crédit'];
    const looksNegative = negativeKeywords.some(k => lower.includes(k));
    const looksPositive = positiveKeywords.some(k => lower.includes(k));

    let signedAmount = amount;
    if (line.includes('-')) signedAmount = -Math.abs(amount);
    else if (looksNegative && !looksPositive) signedAmount = -Math.abs(amount);
    else if (looksPositive) signedAmount = Math.abs(amount);
    else signedAmount = -Math.abs(amount); // par défaut : dépense

    // Libellé : retirer date et montant
    let libelle = line
      .replace(dateRegex, '')
      .replace(amountMatch[0], '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!libelle) libelle = 'Transaction sans libellé';

    results.push({
      id: uuid(),
      date: dateISO,
      libelle,
      montant: signedAmount,
      type: signedAmount >= 0 ? 'revenu' : 'dépense',
      categorieIds: signedAmount >= 0 ? ['cat_revenu'] : ['cat_autre'],
      remboursable: false,
      rembourse: false,
      justificatif: null,
      notes: '',
      _selected: true,
    });
  }
  return results;
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
      rembourse: false,
      justificatif: null,
      notes: '',
    };
  });

  const handleSubmit = () => {
    if (!tx.libelle.trim()) return;
    if (!tx.categorieIds || tx.categorieIds.length === 0) return;
    const rawAmount = parseFloat(String(tx.montant).replace(',', '.'));
    if (isNaN(rawAmount) || rawAmount === 0) return;
    const finalAmount = tx.type === 'revenu' ? Math.abs(rawAmount) : -Math.abs(rawAmount);
    const { categorieId, ...rest } = tx; // on retire l'ancien champ legacy
    onSave({ ...rest, montant: finalAmount });
  };

  const toggleCat = (catId) => {
    const current = tx.categorieIds || [];
    if (current.includes(catId)) {
      // Au moins une catégorie reste sélectionnée
      if (current.length === 1) return;
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
        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 space-y-2">
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
            <label className="flex items-center gap-2.5 cursor-pointer ml-6">
              <input
                type="checkbox"
                checked={tx.rembourse}
                onChange={(e) => setTx({ ...tx, rembourse: e.target.checked })}
                className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900/20"
              />
              <span className="text-sm text-stone-600">Déjà remboursée</span>
            </label>
          )}
        </div>
      )}

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
    const txs = parseTransactionsFromText(extractedText);
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
                <div className="flex-1 grid grid-cols-12 gap-2 items-center">
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
                    className="col-span-5 text-sm py-1.5"
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
                                      if (cur.length > 1) next[idx].categorieIds = cur.filter(id => id !== c.id);
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
  const [tab, setTab] = useState('weeks'); // weeks | months | custom
  const [customStart, setCustomStart] = useState(toISODate(addMonths(new Date(), -3)));
  const [customEnd, setCustomEnd] = useState(toISODate(new Date()));

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';
  const getCatName = (id) => categories.find(c => c.id === id)?.name || 'Inconnue';

  // Filtre actif (exclut les remboursables remboursés et garde les dépenses)
  const expenses = transactions.filter(t => t.type === 'dépense' && !(t.remboursable && t.rembourse));

  // -------- 4 dernières semaines --------
  const weeksData = useMemo(() => {
    const today = startOfDay(new Date());
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const start = startOfWeek(addDays(today, -7 * i));
      const end = addDays(start, 6);
      const total = expenses
        .filter(t => {
          const d = new Date(t.date);
          return d >= start && d <= addDays(end, 1);
        })
        .reduce((s, t) => s + Math.abs(t.montant), 0);
      weeks.push({
        label: `${formatDateShort(start)}`,
        total: Math.round(total * 100) / 100,
        isCurrent: i === 0,
      });
    }
    return weeks;
  }, [expenses]);

  const currentWeek = weeksData[3]?.total || 0;
  const avg3PrevWeeks = weeksData.slice(0, 3).reduce((s, w) => s + w.total, 0) / 3;

  const top5Period = useMemo(() => {
    const cutoff = addDays(startOfDay(new Date()), -28);
    return [...expenses]
      .filter(t => new Date(t.date) >= cutoff)
      .sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant))
      .slice(0, 5);
  }, [expenses]);

  // -------- 12 derniers mois --------
  const monthsData = useMemo(() => {
    const today = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const start = startOfMonth(addMonths(today, -i));
      const end = startOfMonth(addMonths(today, -i + 1));
      const total = expenses
        .filter(t => {
          const d = new Date(t.date);
          return d >= start && d < end;
        })
        .reduce((s, t) => s + Math.abs(t.montant), 0);
      months.push({
        label: start.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        total: Math.round(total * 100) / 100,
      });
    }
    return months;
  }, [expenses]);

  const monthAvg = monthsData.reduce((s, m) => s + m.total, 0) / 12;
  const maxMonth = [...monthsData].sort((a, b) => b.total - a.total)[0];

  const categoryDistribution12mo = useMemo(() => {
    const cutoff = startOfMonth(addMonths(new Date(), -11));
    const totals = {};
    expenses.forEach(t => {
      if (new Date(t.date) >= cutoff) {
        const ids = getCatIds(t);
        if (ids.length === 0) return;
        const share = Math.abs(t.montant) / ids.length;
        ids.forEach(id => { totals[id] = (totals[id] || 0) + share; });
      }
    });
    return Object.entries(totals)
      .map(([id, total]) => ({ name: getCatName(id), value: Math.round(total * 100) / 100, color: getCatColor(id) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [expenses, categories]);

  // -------- Plage personnalisée --------
  const customData = useMemo(() => {
    const start = startOfDay(new Date(customStart));
    const end = startOfDay(new Date(customEnd));
    if (isNaN(start) || isNaN(end) || start > end) return { line: [], donut: [], total: 0 };

    const filtered = expenses.filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= addDays(end, 1);
    });

    // Agrège par jour si moins de 60 jours, sinon par mois
    const dayDiff = (end - start) / (1000 * 60 * 60 * 24);
    const byPeriod = {};
    filtered.forEach(t => {
      const d = new Date(t.date);
      const key = dayDiff < 60
        ? toISODate(d)
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byPeriod[key] = (byPeriod[key] || 0) + Math.abs(t.montant);
    });
    const line = Object.entries(byPeriod)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => ({
        label: dayDiff < 60 ? formatDateShort(key) : key,
        total: Math.round(total * 100) / 100,
      }));

    const totals = {};
    filtered.forEach(t => {
      const ids = getCatIds(t);
      if (ids.length === 0) return;
      const share = Math.abs(t.montant) / ids.length;
      ids.forEach(id => { totals[id] = (totals[id] || 0) + share; });
    });
    const donut = Object.entries(totals)
      .map(([id, total]) => ({ name: getCatName(id), value: Math.round(total * 100) / 100, color: getCatColor(id) }))
      .filter(d => d.value > 0);

    const total = filtered.reduce((s, t) => s + Math.abs(t.montant), 0);
    return { line, donut, total };
  }, [expenses, customStart, customEnd, categories]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-fit">
        {[
          { id: 'weeks', label: '4 semaines' },
          { id: 'months', label: '12 mois' },
          { id: 'custom', label: 'Période libre' },
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

      {tab === 'weeks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 p-5">
            <h3 className="font-serif text-lg text-stone-900 mb-4">Dépenses par semaine</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeksData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                  <XAxis dataKey="label" stroke="#78716c" fontSize={12} />
                  <YAxis stroke="#78716c" fontSize={12} tickFormatter={(v) => `${v}€`} />
                  <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
                  <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                    {weeksData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.isCurrent ? '#1c1917' : '#a8a29e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-serif text-lg text-stone-900 mb-4">Comparatif</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500">Semaine en cours</p>
                <p className="text-2xl font-serif text-stone-900 mt-1">{formatEUR(currentWeek)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500">Moyenne 3 semaines précédentes</p>
                <p className="text-2xl font-serif text-stone-700 mt-1">{formatEUR(avg3PrevWeeks)}</p>
              </div>
              <div className={`mt-4 p-3 rounded-xl ${currentWeek > avg3PrevWeeks ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                <div className="flex items-center gap-2">
                  {currentWeek > avg3PrevWeeks
                    ? <TrendingUp size={16} className="text-rose-700" />
                    : <TrendingDown size={16} className="text-emerald-700" />}
                  <span className={`text-sm font-medium ${currentWeek > avg3PrevWeeks ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {avg3PrevWeeks === 0
                      ? '—'
                      : `${currentWeek > avg3PrevWeeks ? '+' : ''}${(((currentWeek - avg3PrevWeeks) / avg3PrevWeeks) * 100).toFixed(1)}%`}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-3 p-5">
            <h3 className="font-serif text-lg text-stone-900 mb-4">Top 5 des dépenses (4 dernières semaines)</h3>
            {top5Period.length === 0 ? (
              <p className="text-stone-500 text-sm">Aucune dépense sur la période.</p>
            ) : (
              <div className="space-y-2">
                {top5Period.map((t, idx) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                    <div className="w-7 h-7 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-medium">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-900 truncate">{t.libelle}</p>
                      <p className="text-xs text-stone-500">{formatDateFR(t.date)}</p>
                    </div>
                    <CatBadges ids={getCatIds(t)} categories={categories} max={2} />
                    <p className="font-serif text-lg text-stone-900">{formatEUR(Math.abs(t.montant))}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'months' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 p-5">
            <h3 className="font-serif text-lg text-stone-900 mb-4">Évolution mensuelle</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                  <XAxis dataKey="label" stroke="#78716c" fontSize={12} />
                  <YAxis stroke="#78716c" fontSize={12} tickFormatter={(v) => `${v}€`} />
                  <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
                  <Line type="monotone" dataKey="total" stroke="#1c1917" strokeWidth={2.5} dot={{ fill: '#1c1917', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-serif text-lg text-stone-900 mb-4">Indicateurs</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500">Moyenne mensuelle</p>
                <p className="text-2xl font-serif text-stone-900 mt-1">{formatEUR(monthAvg)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500">Mois le plus dépensier</p>
                <p className="text-lg text-stone-900 mt-1">{maxMonth?.label}</p>
                <p className="text-stone-600 text-sm">{formatEUR(maxMonth?.total || 0)}</p>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-3 p-5">
            <h3 className="font-serif text-lg text-stone-900 mb-4">Répartition par catégorie</h3>
            {categoryDistribution12mo.length === 0 ? (
              <p className="text-stone-500 text-sm">Aucune dépense sur les 12 derniers mois.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryDistribution12mo}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={110}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {categoryDistribution12mo.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {categoryDistribution12mo.map(c => {
                    const total = categoryDistribution12mo.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? (c.value / total) * 100 : 0;
                    return (
                      <div key={c.name} className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="flex-1 text-sm text-stone-700">{c.name}</span>
                        <span className="text-sm text-stone-500 tabular-nums">{pct.toFixed(1)}%</span>
                        <span className="text-sm font-medium text-stone-900 tabular-nums w-24 text-right">{formatEUR(c.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'custom' && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Du</label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-44" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Au</label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-44" />
              </div>
              <div className="ml-auto">
                <p className="text-xs uppercase tracking-wider text-stone-500">Total dépensé</p>
                <p className="text-2xl font-serif text-stone-900">{formatEUR(customData.total)}</p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-serif text-lg text-stone-900 mb-4">Évolution</h3>
              <div className="h-64">
                {customData.line.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-stone-500 text-sm">Aucune donnée sur cette période.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={customData.line}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                      <XAxis dataKey="label" stroke="#78716c" fontSize={11} />
                      <YAxis stroke="#78716c" fontSize={11} tickFormatter={(v) => `${v}€`} />
                      <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
                      <Line type="monotone" dataKey="total" stroke="#1c1917" strokeWidth={2.5} dot={{ fill: '#1c1917', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-serif text-lg text-stone-900 mb-4">Répartition</h3>
              <div className="h-64">
                {customData.donut.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-stone-500 text-sm">Aucune donnée.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={customData.donut} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value">
                        {customData.donut.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// CALENDRIER
// ============================================================

const CalendarView = ({ transactions, categories, onAddTx }) => {
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);

  const expenses = transactions.filter(t => t.type === 'dépense' && !(t.remboursable && t.rembourse));

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
      const dayTxs = expenses.filter(t => t.date === isoStr);
      const total = dayTxs.reduce((s, t) => s + Math.abs(t.montant), 0);
      arr.push({ date: dateObj, iso: isoStr, total, count: dayTxs.length, txs: dayTxs });
    }
    return arr;
  }, [cursor, expenses]);

  const maxDayTotal = Math.max(...days.filter(Boolean).map(d => d.total), 1);

  const intensity = (val) => {
    if (val === 0) return null;
    const pct = val / maxDayTotal;
    if (pct < 0.25) return 'bg-stone-100 text-stone-700';
    if (pct < 0.5) return 'bg-stone-300 text-stone-800';
    if (pct < 0.75) return 'bg-stone-600 text-white';
    return 'bg-stone-900 text-white';
  };

  const getCatColor = (id) => categories.find(c => c.id === id)?.color || '#9c9c9c';
  const getCatName = (id) => categories.find(c => c.id === id)?.name || 'Inconnue';

  const monthTotal = days.filter(Boolean).reduce((s, d) => s + d.total, 0);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft size={18} />
          </Button>
          <h3 className="font-serif text-xl text-stone-900 capitalize w-48 text-center">{monthName}</h3>
          <Button variant="ghost" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight size={18} />
          </Button>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-stone-500">Total du mois</p>
          <p className="font-serif text-xl text-stone-900">{formatEUR(monthTotal)}</p>
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
          const cls = intensity(d.total);
          const isDark = cls && cls.includes('text-white');

          // Récolte les couleurs distinctes des catégories du jour
          const catColors = [];
          d.txs.forEach(tx => {
            const ids = getCatIds(tx);
            ids.forEach(id => {
              const col = getCatColor(id);
              if (!catColors.includes(col)) catColors.push(col);
            });
          });

          return (
            <button
              key={d.iso}
              onClick={() => setSelectedDay(d)}
              className={`aspect-square min-h-[68px] rounded-xl p-1.5 flex flex-col items-stretch justify-between transition relative text-left overflow-hidden
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

              {d.total > 0 && (
                <span className={`text-[10px] font-medium tabular-nums ${isDark ? '' : 'text-stone-700'}`}>
                  {Math.round(d.total)}€
                </span>
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
            <div className="flex items-center justify-between">
              <p className="text-stone-600 text-sm">
                {selectedDay.count} transaction{selectedDay.count > 1 ? 's' : ''} · {formatEUR(selectedDay.total)}
              </p>
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
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-900 truncate">{t.libelle}</p>
                      <CatBadges ids={getCatIds(t)} categories={categories} max={3} />
                    </div>
                    <p className="font-serif text-lg text-stone-900">{formatEUR(Math.abs(t.montant))}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
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
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Le navigateur a bloqué l\'ouverture de la fenêtre. Autorisez les pop-ups pour ce site.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
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
                  <p className="font-medium text-stone-900 truncate">{t.libelle}</p>
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
                  <p className="font-medium text-stone-900 truncate line-through">{t.libelle}</p>
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
            <p className="text-sm text-stone-400">
              {selectedTxs.length} dépense{selectedTxs.length > 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setInvoiceOpen(false)} className="flex-1">Annuler</Button>
            <Button onClick={generateInvoice} disabled={selectedTxs.length === 0} className="flex-1">
              <FileText size={14} /> Générer le document
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ============================================================
// CATÉGORIES
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
    </Card>
  );
};

// ============================================================
// TABLEAU DE BORD
// ============================================================

const Dashboard = ({ transactions, categories }) => {
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

  // Pending de remboursement (sur tout le registre)
  const pendingReimb = transactions
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
      {/* Hero */}
      <Card className="p-6 bg-gradient-to-br from-stone-900 to-stone-800 text-stone-50 border-stone-900">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Solde du mois · {monthLabel}</p>
            <p className="font-serif text-5xl mt-2">{formatEUR(balance)}</p>
            <p className="text-sm text-stone-400 mt-2">
              {revenue > 0 ? `${formatEUR(revenue)} de revenus · ` : ''}{formatEUR(netExpenses)} de dépenses nettes
            </p>
          </div>
          <Wallet size={32} className="text-stone-700" />
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Dépenses nettes</p>
          <p className="font-serif text-2xl text-stone-900 mt-1">{formatEUR(netExpenses)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Dépenses brutes</p>
          <p className="font-serif text-2xl text-stone-900 mt-1">{formatEUR(grossExpenses)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-stone-500">Revenus</p>
          <p className="font-serif text-2xl text-emerald-700 mt-1">{formatEUR(revenue)}</p>
        </Card>
        <Card className="p-4 bg-amber-50/40 border-amber-100">
          <p className="text-xs uppercase tracking-wider text-amber-800">À recevoir</p>
          <p className="font-serif text-2xl text-stone-900 mt-1">{formatEUR(pendingReimb)}</p>
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
// APPLICATION PRINCIPALE
// ============================================================

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [view, setView] = useState('dashboard'); // dashboard | times | calendar | reimb | tx | cats
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [defaultDate, setDefaultDate] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const importJsonRef = useRef(null);

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

  const exportData = () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      transactions,
      categories,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finances-${toISODate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
    { id: 'calendar', label: 'Calendrier', icon: CalendarIcon },
    { id: 'tx', label: 'Transactions', icon: Receipt },
    { id: 'reimb', label: 'Remboursables', icon: RefreshCw },
    { id: 'cats', label: 'Catégories', icon: Tags },
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
        {view === 'dashboard' && <Dashboard transactions={transactions} categories={categories} />}
        {view === 'times' && <TimeViews transactions={transactions} categories={categories} />}
        {view === 'calendar' && <CalendarView transactions={transactions} categories={categories} onAddTx={(date) => { setDefaultDate(date); setShowTxForm(true); }} />}
        {view === 'tx' && <TransactionsList transactions={transactions} categories={categories} onEdit={(t) => { setEditingTx(t); setShowTxForm(true); }} onDelete={deleteTransaction} />}
        {view === 'reimb' && <ReimbursableView transactions={transactions} categories={categories} onUpdate={updateTransaction} />}
        {view === 'cats' && <CategoriesView categories={categories} transactions={transactions} onCategoriesChange={setCategories} />}
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

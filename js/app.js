// =============================================================== Calendrier copte — application
const $app = document.getElementById('app');
const PAR = window.PAROISSES, RITES = window.RITES;

// ------------------------------------------------------------- état
const DEFAUT = {
  reglages: { main: 'copte', langue: 'fr', first: 'lun', wk: true, theme: 'nuit', taille: 1, contraste: false, couleurs: 'simples', ville: 'paris',
    calques: { jeunes: true, careme: true, mv: true, fetes: true, saints: true, lectures: true }, rappels: { veille: true, fete: true, matin: false } },
  paroisse: { idx: -1, patrons: [], cal: true, rappel: true },
  evenements: [],
};
let P = JSON.parse(JSON.stringify(DEFAUT)); // données personnelles, sauvegardées
const aujCivil = () => { const d = new Date(); return gregVersJdn(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
const S = { vue: 'mois', sel: aujCivil(), mois: null, annee: null, lundi: null, riteGroupe: 'p', riteSel: null, q: '', retour: 'mois', evt: null, confirmerEffacer: false, sauvegarde: 'aucun' };

// ------------------------------------------------------------- sauvegarde (compte claude.ai, sinon cet appareil)
let db = null, docRef = null, timer = null;
const CLE = 'calendrier-copte-v1';
function chargerLocal() { try { const t = localStorage.getItem(CLE); if (t) fusion(JSON.parse(t)); S.sauvegarde = 'local'; } catch (e) { S.sauvegarde = 'aucun'; } }
function fusion(o) {
  if (!o || typeof o !== 'object') return;
  P.reglages = { ...DEFAUT.reglages, ...(o.reglages || {}), calques: { ...DEFAUT.reglages.calques, ...((o.reglages || {}).calques || {}) }, rappels: { ...DEFAUT.reglages.rappels, ...((o.reglages || {}).rappels || {}) } };
  P.paroisse = { ...DEFAUT.paroisse, ...(o.paroisse || {}) };
  if (!Array.isArray(P.paroisse.patrons)) P.paroisse.patrons = [];
  if (P.paroisse.idx >= 0 && !P.paroisse.patrons.length) P.paroisse.patrons = patronsDe(P.paroisse.idx);
  P.evenements = Array.isArray(o.evenements) ? o.evenements : [];
}
// Saints patrons : chaque saint a sa propre fête (date copte courante, modifiable)
const FETES_SAINTS = [
  [/vierge|marie|notre/i, 'Vierge Marie', 16, 12], [/rapha/i, 'Archange Raphaël', 3, 13], [/michel/i, 'Archange Michel', 12, 3],
  [/georges/i, 'Saint Georges', 23, 8], [/mina/i, 'Saint Mina', 15, 3], [/merc|marcur/i, 'Saint Philopatir Mercure', 25, 3],
  [/mo[iï]se/i, 'Saint Moïse le Noir', 24, 10], [/samuel/i, 'Saint Samuel le Confesseur', 8, 4], [/antoine/i, 'Saint Antoine', 22, 5],
  [/pierre/i, 'Saints Pierre et Paul', 5, 11], [/paul/i, 'Saint Paul l’Ermite', 2, 6], [/bichoy/i, 'Saint Bichoy', 8, 11],
  [/kar[a]?s/i, 'Anba Karas l’Anachorète', 8, 11], [/cyril/i, 'Pape Cyrille VI', 30, 6], [/jean/i, 'Saint Jean l’Évangéliste', 4, 5], [/marc\b/i, 'Saint Marc', 30, 8],
];
// Fête fixe (synaxaire) d'un saint connu : sa date ne se modifie pas
const feteFixe = (nom) => FETES_SAINTS.find(([re]) => re.test(nom || ''));
function fixerDatesPatrons() { if (P.paroisse.idx >= 0) P.paroisse.patrons = patronsDe(P.paroisse.idx); }
function patronsDe(idx) {
  const p = PAR[idx]; if (!p) return [];
  const morceaux = p.saints.split(/\s+et\s+|\s*&\s*|,\s*/i).filter(Boolean);
  const out = [];
  for (const m of morceaux) {
    if (/paul/i.test(m) && /pierre/i.test(p.saints)) continue; // Pierre et Paul : fête commune du 5 Abib
    const f = FETES_SAINTS.find(([re]) => re.test(m));
    const nom = f ? f[1] : m.replace(/^./, (c) => c.toUpperCase());
    if (out.some((x) => x.nom === nom)) continue; // « Saint Pierre et saint Paul » → une seule fête commune
    out.push({ nom, jour: f ? f[2] : 1, mois: f ? f[3] : 1 });
  }
  return out;
}
function prochaineDate(pt, depuis) { let j = depuis; while (!(jdnVersCopte(j).mois === pt.mois && jdnVersCopte(j).jour === pt.jour) && j < depuis + 400) j++; return j; }
function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(P)); } catch (e) {}
  clearTimeout(timer);
  timer = setTimeout(async () => { if (docRef) { try { await docRef.set({ etat: JSON.stringify(P), maj: Date.now() }); } catch (e) {} } }, 600);
}
async function brancherCompte() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [d, u] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!d || !u) return;
    const id = await u.id();
    if (!id) return;
    db = d; docRef = db.collection('data/users/' + id).doc('etat');
    const snap = await Promise.race([docRef.get(), new Promise((_, r) => setTimeout(() => r(new Error('délai')), 10000))]);
    const data = snap && (snap.data ? snap.data() : snap);
    if (data && data.etat) { fusion(JSON.parse(data.etat)); try { localStorage.setItem(CLE, JSON.stringify(P)); } catch (e) {} }
    else await docRef.set({ etat: JSON.stringify(P), maj: Date.now() });
    S.sauvegarde = 'compte';
    appliquerApparence(); rendre();
  } catch (e) { /* on reste sur la sauvegarde locale */ }
}

// ------------------------------------------------------------- outils
const R = () => P.reglages;
const AR = () => R().langue === 'ar';
const t = (k) => T[AR() ? 'ar' : 'fr'][k];
const n = (v) => AR() ? chiffresAr(v) : String(v);
const maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nomMoisC = (m) => AR() ? MOIS_COPTES_AR[m - 1] : MOIS_COPTES[m - 1];
const nomMoisG = (m) => AR() ? MOIS_GREGORIENS_AR[m - 1] : MOIS_GREGORIENS[m - 1];
const nomJour = (j) => AR() ? JOURS_AR[jourSemaine(j)] : JOURS[jourSemaine(j)];
const courtJour = (j) => AR() ? JOURS_AR[jourSemaine(j)] : JOURS[jourSemaine(j)].slice(0, 3);
const fCopte = (j) => { const c = jdnVersCopte(j); return `${n(c.jour)} ${nomMoisC(c.mois)} ${n(c.an)}`; };
const fCopteCourt = (j) => { const c = jdnVersCopte(j); return `${n(c.jour)} ${nomMoisC(c.mois)}`; };
const fGreg = (j, annee = true) => { const g = jdnVersGreg(j); return `${nomJour(j)} ${AR() ? n(g.d) : (g.d === 1 ? '1er' : g.d)} ${nomMoisG(g.m)}${annee ? ' ' + n(g.y) : ''}`; };
const nomEvt = (id, nom) => AR() ? nomAr(id) : nom;
const VILLE = () => VILLES[R().ville] || VILLES.paris;
const decalage = () => R().first === 'dim' ? 1 : 0; // colonnes : lundi ou dimanche en premier
const colonne = (j) => (jourSemaine(j) + decalage()) % 7;
const icone = {
  prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  reglages: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  loupe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  lune: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  croix: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const fleche = (sens) => (AR() ? (sens === 'prev' ? icone.next : icone.prev) : icone[sens]);

// Événements personnels : occurrences dans un intervalle
function occurrences(e, j1, j2) {
  const out = [];
  let j = e.jdn, c0 = jdnVersCopte(e.jdn), g0 = jdnVersGreg(e.jdn), garde = 0;
  while (j <= j2 && garde++ < 2000) {
    if (j >= j1) out.push(j);
    if (e.rep === 'aucune') break;
    if (e.rep === 'semaine') j += 7;
    else if (e.rep === 'mois') { const g = jdnVersGreg(j); const nm = g.m === 12 ? 1 : g.m + 1, ny = g.m === 12 ? g.y + 1 : g.y; j = gregVersJdn(ny, nm, Math.min(g0.d, 28)); }
    else if (e.rep === 'moisCopte') { const c = jdnVersCopte(j); let mm = c.mois + 1, aa = c.an; if (mm > 12) { mm = 1; aa++; } j = copteVersJdn(aa, mm, Math.min(c0.jour, 30)); }
    else if (e.rep === 'anneeCopte') j = copteVersJdn(jdnVersCopte(j).an + 1, c0.mois, c0.jour);
    else break;
  }
  return out;
}
const evenementsDu = (j) => P.evenements.filter((e) => occurrences(e, j, j).length).sort((a, b) => a.debut.localeCompare(b.debut));
// Icônes des saints patrons (fournies par la paroisse), reconnues d'après le nom du saint
const ICONES_SAINTS = [[/pierre/i, 'pierrepaul'], [/bichoy/i, 'bichoy'], [/kar[a]?s/i, 'karas'], [/paul/i, 'paul'], [/mo[iï]se/i, 'moise'], [/samuel/i, 'samuel'], [/merc|marcur|seifein|philopat/i, 'mercure'], [/\bmina\b|m[eé]nas/i, 'mina'], [/cyril|kyril/i, 'kyrillos'], [/\bmarc\b/i, 'marc'], [/georges|guirguis/i, 'georges'], [/antoine/i, 'antoine'], [/rapha/i, 'raphael'], [/jean/i, 'jean'], [/vierge|marie|notre/i, 'vierge'], [/michel/i, 'michel']];
// Icônes des jours de la Semaine sainte et des rites
const RITE_ICONE = { jeudi: 'judas', vendredi: 'crucifixion', lakkan: 'lakkan', rameaux: 'rameaux' };
const iconeRite = (id) => RITE_ICONE[id] && window.ICONES ? window.ICONES[RITE_ICONE[id]] : null;
const CADRAGE = { moise: [50, 15, 3.4], samuel: [50, 33, 1.9], mercure: [49, 19, 3.8], kyrillos: [52, 23, 3.4], mina: [50, 9, 3.6], marc: [50, 20, 3.2], georges: [44, 35, 4.2], antoine: [50, 19, 3.4], raphael: [48, 20, 3], jean: [49, 26, 3.2], vierge: [45, 20, 2.2], michel: [50, 11, 3.6] }; // visage : position x %, y %, zoom
const cadrageSaint = (nom) => { const f = ICONES_SAINTS.find(([re]) => re.test(nom || '')); const c = f && CADRAGE[f[1]]; return c ? `object-position:${c[0]}% ${c[1]}%;transform:scale(${c[2]});transform-origin:${c[0]}% ${c[1]}%` : ''; };
const iconeSaint = (nom) => { const f = ICONES_SAINTS.find(([re]) => re.test(nom || '')); return f && window.ICONES ? window.ICONES[f[1]] : null; };
function patronsDu(j) {
  const p = P.paroisse;
  if (p.idx < 0 || !p.cal) return [];
  const c = jdnVersCopte(j);
  return p.patrons.filter((pt) => pt.mois === c.mois && pt.jour === c.jour);
}
function fetePatronaleDu(j) {
  const p = P.paroisse;
  if (p.idx < 0 || !p.cal) return null;
  const c = jdnVersCopte(j);
  const l = p.patrons.filter((pt) => pt.mois === c.mois && pt.jour === c.jour);
  return l.length ? `${t('fetePatronale')} · ${l.map((pt) => pt.nom).join(', ')}${enSemaineSainte(j) ? ' — ' + NON_CELEBRE() : ''}` : null;
}

// Informations d'un jour, filtrées par les réglages
function jour(j) {
  const x = infoJour(j), K = R().calques;
  let couleur = x.couleur;
  if (couleur === 'jeune' && !K.jeunes) couleur = null;
  if ((couleur === 'careme' || couleur === 'semaine-sainte') && !K.careme) couleur = null;
  if (couleur === 'mercredi-vendredi' && !K.mv) couleur = null;
  const fetes = K.fetes ? x.fetesIds.map((id, i) => nomEvt(id, x.fetes[i])) : [];
  const fp = fetePatronaleDu(j);
  if (fp) fetes.push(fp);
  const jeune = !!couleur && couleur !== 'resurrection';
  const periode = x.periodeJeuneId ? nomEvt(x.periodeJeuneId, x.periodeJeune) : null;
  const libelleJeune = jeune ? (couleur === 'mercredi-vendredi' ? t('jeuneDu')(nomJour(j)) : periode) : null;
  const niveau = jeune && x.niveauCle ? (AR() ? NIVEAUX_AR[x.niveauCle] : NIVEAUX[x.niveauCle]) : null;
  return { ...x, couleur, fetes, jeune, libelleJeune, niveau };
}
// Jeûne de Ninive (Jonas) : petits poissons
const POISSON = '<svg class="poisson" viewBox="0 0 24 14" aria-hidden="true"><path d="M2 7c3-5 10-6 15-2l5-4v12l-5-4c-5 4-12 3-15-2z" fill="currentColor"/><circle cx="7" cy="6" r="1.1" fill="var(--bg,#111)"/></svg>';
const estNinive = (x) => x.periodeJeuneId === 'ninive' && x.jeune;
const PAR_JEUNE = { ninive: '#3E7CA6', 'nativite-jeune': '#A2803A', apotres: '#3F8A5A', vierge: '#5468B8', 'paramoun-nativite': '#A2803A', 'paramoun-theophanie': '#3E7CA6' };
function teinte(x) {
  // couleur de remplissage d'une case selon le code couleur
  if (x.couleur === 'careme') return 'var(--careme)';
  if (x.couleur === 'semaine-sainte') return 'var(--careme2)';
  if (x.couleur === 'resurrection') return 'var(--resur)';
  if (x.couleur === 'jeune') return R().couleurs === 'parJeune' && PAR_JEUNE[x.periodeJeuneId] ? PAR_JEUNE[x.periodeJeuneId] : 'var(--ochrebg)';
  return null;
}

// Jour liturgique : après le coucher du soleil, on est dans la veille du lendemain
function etatLiturgique() {
  const j = aujCivil(), v = VILLE();
  const jl = jourLiturgique(j, Date.now(), v);
  return { ...jl, ville: v };
}

// ------------------------------------------------------------- apparence
function appliquerApparence() {
  const r = R(), html = document.documentElement;
  const sombre = r.theme === 'nuit' || (r.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  html.classList.toggle('clair', !sombre);
  html.classList.toggle('contraste', !!r.contraste);
  html.lang = AR() ? 'ar' : 'fr';
  html.dir = AR() ? 'rtl' : 'ltr';
  html.style.setProperty('--z', String(r.taille));
}

// ------------------------------------------------------------- en-tête commun des vues
function entete(titreCopte, titre) {
  const onglets = ['jour', 'semaine', 'mois', 'annee', 'avenir', 'actus'].map((v) => `<button class="onglet${S.vue === v ? ' actif' : ''}" data-a="vue" data-v="${v}" ${S.vue === v ? 'aria-current="page"' : ''}>${v === 'avenir' ? (AR() ? 'القادم' : 'À venir') : v === 'actus' ? (AR() ? 'أخبار' : 'Actus') + (S.vue !== 'actus' && actusNouvelles() ? `<i class="pastille-new" aria-label="${actusNouvelles()} nouvelles"></i>` : '') : t(v)}</button>`).join('');
  return `<header class="entete">
    <div class="ligne-titre">
      <div class="titres"><span class="surtitre">${esc(titreCopte)}</span><h1 class="titre">${esc(titre)}</h1></div>
      <div class="actions"><button class="pilule" data-a="aujourdhui">${t('aujourdhui')}</button>
      <button class="rond" data-a="ouvrir" data-v="reglages" aria-label="${t('reglages')}">${icone.reglages}</button></div>
    </div>
    <button class="barre-recherche" data-a="ouvrir" data-v="recherche">${icone.loupe}<span>${t('recherche')}</span></button>
    <nav class="onglets" aria-label="${t('vues')}">${onglets}</nav>
  </header>`;
}
// Barre du bas : les saints patrons de la paroisse (accès direct à leur fête) et le bouton « + »
const fab = () => {
  const p = P.paroisse, auj = aujCivil();
  const saints = p.idx >= 0 ? p.patrons.map((pt, i) => {
    const ic = iconeSaint(pt.nom), j = prochaineDate(pt, auj);
    const label = `${t('fetePatronale')} : ${pt.nom}, ${fGreg(j)}`;
    return `<button class="saint-rond${ic ? '' : ' sans-icone'}" data-a="allerPatron" data-i="${i}" aria-label="${esc(label)}" title="${esc(pt.nom)}">${ic ? `<img src="${ic}" alt="">` : `<span aria-hidden="true">${esc((pt.nom.replace(/^(Saints?|Sainte|Archange|Anba|Pape)\s+/i, '')[0] || '✝').toUpperCase())}</span>`}</button>`;
  }).join('') : '';
  return `<div class="barre-bas">${saints}<button class="fab" data-a="nouvelEvt" aria-label="${t('ajouter')}">${icone.plus}</button></div>`;
};

// Rites qui commencent ce jour-là (fête d'un jour, jour de la Semaine sainte, début d'une période)
function ritesDuJour(j) {
  const an = jdnVersCopte(j).an;
  const evs = [...evenementsAnneeCopte(an - 1), ...evenementsAnneeCopte(an), ...evenementsAnneeCopte(an + 1)].filter((e) => e.debut === j);
  const AUSSI = { nativite: ['nativite'], epiphanie: ['theophanie'], apotres: ['fete-apotres'], vierge: ['assomption'] };
  return RITES.filter((r) => { const ids = [RITE_EVT[r.id], ...(AUSSI[r.id] || [])].filter(Boolean); return evs.some((e) => ids.some((ev) => ev.endsWith('-') ? e.id.startsWith(ev) : e.id === ev)); });
}
// ------------------------------------------------------------- vue Jour
// Dimanche du mois copte : « 1er dimanche de Hatour »
const ORD_AR = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'];
function dimancheCopte(j) {
  if (jourSemaine(j) !== 6) return '';
  const c = jdnVersCopte(j), k = Math.floor((c.jour - 1) / 7) + 1;
  return AR() ? `الأحد ${ORD_AR[k - 1]} من ${nomMoisC(c.mois)}` : `${k === 1 ? '1er' : k + 'e'} dimanche de ${nomMoisC(c.mois)}`;
}
// Commémorations mensuelles : 12 = Archange Michel, 21 = Vierge Marie (sauf Nasie)
// Fêtes de l'archange Gabriel (Psalmodie : 13 Hatour, 22 Kiahk, 30 Baramhat, 13 et 26 Baouna)
const FETES_GABRIEL = ['3-13', '4-22', '7-30', '10-13', '10-26'];
function commemoMensuelle(j) {
  const c = jdnVersCopte(j); if (c.mois === 13) return null;
  if (c.jour === 12) return AR() ? 'رئيس الملائكة ميخائيل' : 'Archange Michel';
  if (c.jour === 21) return AR() ? 'السيدة العذراء مريم' : 'Vierge Marie';
  if (FETES_GABRIEL.includes(c.mois + '-' + c.jour)) return AR() ? 'رئيس الملائكة غبريال' : 'Archange Gabriel';
  return null;
}
const ICO_COMMEMO = { 'Archange Michel': 'michel', 'Vierge Marie': 'vierge', 'رئيس الملائكة ميخائيل': 'michel', 'السيدة العذراء مريم': 'vierge', 'Archange Gabriel': 'gabriel', 'رئيس الملائكة غبريال': 'gabriel' };

function carteChant(D) {
  const ch = D && D.chant; if (!ch) return '';
  return `<section class="carte axios chant"><small class="etiquette">${AR() ? ch.titreAr : ch.titre}</small><p class="copte titre-chant" lang="cop" dir="ltr">}\`ctoly</p>${ch.strophes.map((x) => `<div class="str"><p class="copte" lang="cop" dir="ltr">${esc(x.c).replace(/@/g, '@<br>')}</p>${AR() ? `<p class="fr ar" dir="rtl" lang="ar">${esc(x.a)}</p>` : `<p class="fr">${esc(x.f)}</p>`}</div>`).join('')}<small class="mut src">${AR() ? (ch.sourceAr || ch.source) : ch.source}</small></section>`;
}
function carteCommemo(j) {
  const nom = commemoMensuelle(j); if (!nom) return '';
  const cle = ICO_COMMEMO[nom], ic = window.ICONES && window.ICONES[cle], c = jdnVersCopte(j);
  const gab = cle === 'gabriel';
  const grande = (cle === 'michel' && c.mois === 3) || gab; // 12 Hatour (Michel) ; fêtes de Gabriel
  const D = (cle === 'michel' || gab) ? (window.SAINTS || {})[cle] || {} : {};
  const nomFete = gab ? (AR() ? 'تذكار رئيس الملائكة غبريال' : 'Fête de l’archange Gabriel') : AR() ? 'عيد رئيس الملائكة ميخائيل' : 'Fête de l’archange Michel';
  const nomDox = gab ? (AR() ? 'ذكصولوجية رئيس الملائكة غبريال' : 'Doxologie de l’archange Gabriel') : AR() ? 'ذكصولوجية رئيس الملائكة ميخائيل' : 'Doxologie de l’archange Michel';
  const dox = (D.dox || [])[0];
  const strophes = dox ? dox.strophes.map((x) => `<div class="str"><p class="copte" lang="cop" dir="ltr">${esc(x.c).replace(/@/g, '@<br>')}</p>${AR() && x.a ? `<p class="fr ar" dir="rtl" lang="ar">${esc(x.a)}</p>` : `<p class="fr">${esc(x.f)}</p>`}</div>`).join('') : '';
  return `<section class="carte carte-patron carte-commemo">${ic ? `<img class="icone-saint" src="${ic}" alt="${t('iconeDe')} ${esc(nom)}">` : ''}<span><small class="etiquette">${grande ? (AR() ? 'العيد' : 'Fête') : AR() ? 'تذكار شهري' : 'Commémoration mensuelle'}</small><b class="serif">${esc(grande ? nomFete : nom)}</b><small class="mut">${grande ? `${c.jour} ${nomMoisC(c.mois)}` : AR() ? 'كل شهر قبطي' : 'Chaque ' + c.jour + ' du mois copte'}</small></span></section>
  ${D.axios ? `<section class="carte axios commemo-axios"><p class="copte" lang="cop" dir="ltr">${esc(D.axios)}</p><p class="mut"${AR() ? ' dir="rtl"' : ''}>${esc(AR() ? D.axiosAr : D.axiosFr)}</p></section>` : ''}
  ${carteChant(D)}
  ${dox ? `<details class="carte dox commemo-dox"><summary><b>${nomDox}</b><small class="mut">${n(dox.strophes.length)} ${AR() ? 'مقاطع' : 'strophes'}</small></summary>${strophes}<small class="mut src">${AR() ? 'الإبصلمودية السنوية' : 'Psalmodie annuelle'}</small></details>` : ''}`;
}

// ------------------------------------------------------------- Offices annoncés par les paroisses
const isoJ = (j) => { const g = jdnVersGreg(j); return `${g.y}-${String(g.m).padStart(2, '0')}-${String(g.d).padStart(2, '0')}`; };
const nomCourtPar = (p) => p.nom.replace(/^Paroisse (de la |de |)/, '');
function officesDu(j) {
  const d = isoJ(j), out = [];
  PAR.forEach((p, i) => (p.offices || []).forEach((o) => { if (o.date === d && (i === P.paroisse.idx || o.diocese)) out.push({ ...o, idx: i, mienne: i === P.paroisse.idx }); }));
  return out.sort((x, y) => (y.mienne - x.mienne) || x.debut.localeCompare(y.debut));
}
function carteOffices(j) {
  const l = officesDu(j); if (!l.length) return '';
  const miens = l.filter((o) => o.mienne), autres = l.filter((o) => !o.mienne);
  const ligne = (o) => `<li><b>${o.debut} – ${o.fin}</b> <span>${esc(AR() && o.titreAr ? o.titreAr : o.titre)}</span>${o.fete ? `<small class="mut">${esc(o.fete)}</small>` : ''}</li>`;
  return `${miens.length ? `<section class="carte carte-offices"><small class="etiquette">${AR() ? 'في كنيستي' : 'À ma paroisse'}</small><ul>${miens.map(ligne).join('')}</ul></section>` : ''}
  ${autres.length ? `<section class="carte carte-offices autres"><small class="etiquette">${AR() ? 'في الإيبارشية' : 'Dans le diocèse'}</small><ul>${autres.map((o) => ligne(o).replace('</span>', ` · ${esc(nomCourtPar(PAR[o.idx]))}</span>`)).join('')}</ul></section>` : ''}`;
}
function vueJour() {
  const sel = S.sel, x = jour(sel), c = jdnVersCopte(sel), g = jdnVersGreg(sel), auj = aujCivil();
  const lundi = sel - colonne(sel);
  let bande = '';
  for (let k = 0; k < 7; k++) {
    const j = lundi + k, y = jour(j);
    bande += `<button class="case-jour${j === sel ? ' choisi' : ''}${j === auj ? ' auj' : ''}" data-a="choisir" data-j="${j}" aria-label="${esc(fGreg(j) + ', ' + fCopteCourt(j))}">
      <span class="pj">${courtJour(j)}</span><span class="gn">${n(jdnVersGreg(j).d)}</span><span class="pc">${AR() ? fCopteCourt(j) : jdnVersCopte(j).jour + ' ' + jdnVersCopte(j).nomMois.slice(0, 3) + '.'}</span><span class="point${y.jeune ? ' on' : ''}"></span></button>`;
  }
  const grandCopte = R().main === 'copte';
  const lit = etatLiturgique();
  const lendemain = jdnVersCopte(sel + 1);
  let ligneVeille = '';
  if (sel === auj && lit.veille) ligneVeille = t('veilleMaintenant')(`${n(lendemain.jour)} ${nomMoisC(lendemain.mois)}`);
  else { const h = heureLocale(coucherDuSoleil(sel, lit.ville.lat, lit.ville.lon), lit.ville.fuseau); ligneVeille = t('veille')(AR() ? n(h.replace(' h ', ':')) : h, lit.ville.nom, `${n(lendemain.jour)} ${nomMoisC(lendemain.mois)}`); }
  const synKey = `${c.mois}-${c.jour}`;
  let syn = '';
  if (R().calques.saints) {
    const lignes = SYNAXAIRE[synKey] && !AR() ? SYNAXAIRE[synKey] : null;
    syn = `<section class="carte"><div class="carte-tete"><h2>${t('synaxaire')}</h2><span class="mut">${fCopteCourt(sel)}</span></div>
      ${lignes && enSemaineSainte(sel) ? `<p class="avis-hs">${AR() ? 'لا يُقرأ السنكسار في أسبوع الآلام.' : 'Non célébré : pendant la Semaine sainte, le synaxaire n’est pas lu et les fêtes des saints ne sont pas célébrées.'}</p>` : ''}
      ${(lignes || [t('synAbsent')]).map((l) => `<p class="ligne-syn${lignes && enSemaineSainte(sel) ? ' barre' : ''}">${esc(l.replace(/\.$/, ''))}</p>`).join('')}
      ${lignes ? `<small class="mut">${t('sourceKat')}</small>` : ''}
      ${R().calques.lectures ? `<a class="lien" href="https://katameros.app/fr/">${t('lectures')} ${AR() ? '←' : '→'}</a>` : ''}</section>`;
  }
  const evts = evenementsDu(sel);
  const listeEvts = evts.length ? evts.map((e) => `<div class="evt"><span class="evt-h">${n(e.debut)}</span><span class="evt-t">${esc(e.titre)}${e.lieu >= 0 ? `<small>${esc(PAR[e.lieu].adresse.replace(/^.*\d{5} /, ''))}</small>` : ''}</span><button class="mini" data-a="supprEvt" data-id="${e.id}" aria-label="${t('supprimer')} ${esc(e.titre)}">${icone.croix}</button></div>`).join('') : `<p class="mut">${t('aucunEvenement')}</p>`;
  const apres = [...evenementsAnneeCopte(c.an), ...evenementsAnneeCopte(c.an + 1)].filter((e) => e.debut > sel).sort((a, b) => a.debut - b.debut);
  const pj = apres.find((e) => (e.type === 'jeune' || e.type === 'careme') && !e.id.startsWith('paramoun'));
  const riteIds = Object.entries(RITE_EVT).filter(([k]) => RITES.find((r) => r.id === k && r.groupe === 'p'));
  const pr = apres.find((e) => riteIds.some(([, ev]) => ev === e.id));
  const riteId = pr ? riteIds.find(([, ev]) => ev === pr.id)[0] : null;
  return `${entete(`${nomMoisC(c.mois)} ${n(c.an)}`, `${maj(nomMoisG(g.m))} ${n(g.y)}`)}
  <div class="contenu">
    <div class="bande"><button class="fl" data-a="decaler" data-d="-7" aria-label="${t('precedent')}">${fleche('prev')}</button><div class="bande-jours">${bande}</div><button class="fl" data-a="decaler" data-d="7" aria-label="${t('suivant')}">${fleche('next')}</button></div>
    <section class="carte heros">
      <div class="heros-gauche">
        <span class="grand-num">${grandCopte ? n(c.jour) : n(g.d)}</span>
        <span class="grand-mois">${grandCopte ? nomMoisC(c.mois) : maj(nomMoisG(g.m))}</span>
      </div>
      <div class="heros-droite">
        <span class="etiquette">${grandCopte ? t('gregorien') : t('copte')}</span>
        <span class="date-sec">${grandCopte ? maj(fGreg(sel)) : maj(nomJour(sel)) + ' · ' + fCopte(sel)}</span>
        ${dimancheCopte(sel) ? `<span class="puce-dim">${esc(dimancheCopte(sel))}</span>` : ''}
        ${x.jeune ? `<span class="puce-jeune">${estNinive(x) ? POISSON : ''}${esc(x.libelleJeune || '')}${estNinive(x) ? POISSON : ''}</span>` : ''}
        ${estNinive(x) ? `<div class="banc" aria-hidden="true">${POISSON.repeat(5)}</div>` : ''}
        ${x.fetes.length ? `<span class="puce-fete">${esc(x.fetes.join(' · '))}</span>` : ''}
        <span class="veille">${icone.lune}${esc(ligneVeille)}</span>
      </div>
    </section>
    ${carteOffices(sel)}
    ${carteCommemo(sel)}
    ${patronsDu(sel).map((pt) => { const ic = iconeSaint(pt.nom), ch = PAR[P.paroisse.idx]; return `<section class="carte carte-patron">${ic ? `<img class="icone-saint" src="${ic}" alt="${t('iconeDe')} ${esc(pt.nom)}">` : ''}<span><small class="etiquette">${t('fetePatronale')}</small><b class="serif">${esc(pt.nom)}</b><small class="mut">${esc(ch.nom.replace(/^Paroisse (de la |de |)/, ''))}</small></span></section>`; }).join('')}
    ${ritesDuJour(sel).map((r) => `<button class="carte carte-rite" data-a="ouvrirRite" data-v="${r.id}">${iconeRite(r.id) ? `<img class="icone-saint icone-rite" src="${iconeRite(r.id)}" alt="">` : `<i class="barre" style="background:${r.color}"></i>`}<span><small class="etiquette">${t('riteDuJour')} · ${t('serviceDiacre')}</small><b class="serif">${esc(AR() ? (nomAr(RITE_EVT[r.id]) || r.nom) : r.nom)}</b><span class="lien">${t('lireRite')} ${fleche('next')}</span></span></button>`).join('')}
    ${syn}
    <section class="carte"><div class="carte-tete"><h2>${t('mesEvenements')}</h2></div>${listeEvts}</section>
    ${pj ? `<div class="carte ligne-info"><span><b><i class="carre" style="background:${pj.type === 'careme' ? 'var(--careme)' : 'var(--ochre)'}"></i>${esc(t('prochainJeune')(pj.debut - sel, nomEvt(pj.id, pj.nom)))}</b><small>${maj(fGreg(pj.debut, false))} · ${fCopteCourt(pj.debut)}</small></span></div>` : ''}
    ${riteId ? `<button class="carte ligne-info" data-a="ouvrirRite" data-v="${riteId}"><span><b><i class="carre" style="background:var(--gold)"></i>${t('prochainePeriode')} : ${esc(AR() ? nomAr(pr.id) : RITE_COURT[riteId])}</b><small>${maj(fGreg(pr.debut, false))} · ${fCopteCourt(pr.debut)}</small></span><span class="lien">${t('lireRite')} ${fleche('next')}</span></button>` : ''}
  </div>${fab()}`;
}

// ------------------------------------------------------------- vue Semaine
function vueSemaine() {
  const lundi = S.sel - colonne(S.sel), auj = aujCivil();
  let lignes = '';
  for (let k = 0; k < 7; k++) {
    const j = lundi + k, x = jour(j), c = jdnVersCopte(j);
    const evs = evenementsDu(j);
    const syn = R().calques.saints && !AR() && SYNAXAIRE[`${c.mois}-${c.jour}`] ? (enSemaineSainte(j) ? 'Synaxaire non lu (Semaine sainte)' : SYNAXAIRE[`${c.mois}-${c.jour}`][0].replace(/\.$/, '')) : '';
    const texte = [...x.fetes, ...evs.map((e) => `${n(e.debut)} ${e.titre}`)].join(' · ') || syn || (x.cinquanteJours ? (AR() ? 'الخماسين المقدسة' : 'Cinquante jours après Pâques') : '');
    const bande = teinte(x) || (x.couleur === 'mercredi-vendredi' ? 'var(--ochreline)' : 'var(--line)');
    lignes += `<button class="ligne-sem${j === auj ? ' auj' : ''}" data-a="voirJour" data-j="${j}">
      <span class="ls-date"><small>${courtJour(j)}</small><b>${n(CP() ? c.jour : jdnVersGreg(j).d)}</b></span><i class="ls-bande" style="background:${bande}"></i>
      <span class="ls-txt"><span class="ls-haut"><b class="or">${CP() ? gCourt(j) : fCopteCourt(j)}</b><em>${esc([dimancheCopte(j), x.libelleJeune].filter(Boolean).join(' · '))}${estNinive(x) ? POISSON : ''}</em></span><span class="ls-bas">${esc(texte)}</span></span></button>`;
  }
  const g1 = jdnVersGreg(lundi), g2 = jdnVersGreg(lundi + 6), c1 = jdnVersCopte(lundi), c2 = jdnVersCopte(lundi + 6);
  const plage = g1.m === g2.m ? `${n(g1.d)} – ${n(g2.d)} ${nomMoisG(g2.m)}` : `${n(g1.d)} ${nomMoisG(g1.m)} – ${n(g2.d)} ${nomMoisG(g2.m)}`;
  const tC = c1.mois === c2.mois ? `${nomMoisC(c1.mois)} ${n(c2.an)}` : `${nomMoisC(c1.mois)} – ${nomMoisC(c2.mois)} ${n(c2.an)}`, tG = `${maj(nomMoisG(g2.m))} ${n(g2.y)}`;
  return `${CP() ? entete(R().wk ? `${tG} · ${t('semaineN')(semaineIso(lundi))}` : tG, tC) : entete(tC, R().wk ? t('semaineN')(semaineIso(lundi)) : tG)}
  <div class="contenu">
    <div class="nav"><button class="fl" data-a="decaler" data-d="-7" aria-label="${t('precedent')}">${fleche('prev')}</button>
    <span class="nav-txt">${CP() ? `<b>${n(c1.jour)} ${c1.mois === c2.mois ? '' : nomMoisC(c1.mois) + ' '}– ${n(c2.jour)} ${nomMoisC(c2.mois)}</b><small>${plage} ${n(g2.y)}</small>` : `<b>${plage}</b><small>${n(c1.jour)} ${nomMoisC(c1.mois)} – ${n(c2.jour)} ${nomMoisC(c2.mois)} · ${n(g2.y)}</small>`}</span>
    <button class="fl" data-a="decaler" data-d="7" aria-label="${t('suivant')}">${fleche('next')}</button></div>
    <div class="liste-sem">${lignes}</div>
  </div>${fab()}`;
}
function semaineIso(j) { const jeudi = j - jourSemaine(j) + 3, an = jdnVersGreg(jeudi).y; return Math.floor((jeudi - gregVersJdn(an, 1, 1)) / 7) + 1; }

// ------------------------------------------------------------- vue Mois
const CP = () => R().main === 'copte';
const finMoisC = (an, mois) => (mois === 13 ? copteVersJdn(an + 1, 1, 1) : copteVersJdn(an, mois + 1, 1)) - 1;
const ABR_G = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const gCourt = (j) => { const g = jdnVersGreg(j); return `${n(g.d)} ${AR() ? nomMoisG(g.m) : ABR_G[g.m - 1]}`; };
function vueMois() {
  const g = jdnVersGreg(S.sel), y = g.y, m = g.m, auj = aujCivil(), cs = jdnVersCopte(S.sel);
  const premier = CP() ? copteVersJdn(cs.an, cs.mois, 1) : gregVersJdn(y, m, 1), dernier = CP() ? finMoisC(cs.an, cs.mois) : gregVersJdn(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1;
  const gp = jdnVersGreg(premier), gd = jdnVersGreg(dernier);
  const titreG = gp.y === gd.y ? (gp.m === gd.m ? `${maj(nomMoisG(gp.m))} ${n(gp.y)}` : `${maj(nomMoisG(gp.m))} – ${nomMoisG(gd.m)} ${n(gd.y)}`) : `${maj(nomMoisG(gp.m))} ${n(gp.y)} – ${nomMoisG(gd.m)} ${n(gd.y)}`;
  const c1 = jdnVersCopte(premier), c2 = jdnVersCopte(dernier);
  const titreC = c1.an === c2.an ? (c1.mois === c2.mois ? `${nomMoisC(c1.mois)} ${n(c1.an)}` : `${nomMoisC(c1.mois)} – ${nomMoisC(c2.mois)} ${n(c2.an)}`) : `${nomMoisC(c1.mois)} ${n(c1.an)} – ${nomMoisC(c2.mois)} ${n(c2.an)}`;
  const tetes = Array.from({ length: 7 }, (_, k) => { const j = premier - colonne(premier) + k; return `<span>${courtJour(j)}</span>`; }).join('');
  let grille = '';
  let j = premier - colonne(premier);
  while (j <= dernier) {
    if (R().wk) grille += `<span class="num-sem">${n(semaineIso(j))}</span>`;
    for (let k = 0; k < 7; k++, j++) {
      if (j < premier || j > dernier) { grille += '<span></span>'; continue; }
      const x = jour(j), fill = teinte(x), evs = evenementsDu(j).length;
      const cls = ['case-mois', j === S.sel ? 'choisi' : '', j === auj ? 'auj' : '', fill ? 'pleine' : '', x.couleur === 'resurrection' ? 'resur' : '', (x.couleur === 'careme' || x.couleur === 'semaine-sainte') ? 'violette' : ''].join(' ');
      grille += `<button class="${cls}" data-a="voirJour" data-j="${j}" ${fill ? `style="--fill:${fill}"` : ''} aria-label="${esc(fGreg(j) + ', ' + fCopteCourt(j) + (x.jeune ? ', ' + t('jeune') : '') + (x.fetes.length ? ', ' + x.fetes.join(', ') : ''))}">
        ${CP() ? `<b>${n(jdnVersCopte(j).jour)}</b><small>${gCourt(j)}</small>` : `<b>${n(jdnVersGreg(j).d)}</b><small>${n(jdnVersCopte(j).jour)} ${AR() ? '' : jdnVersCopte(j).nomMois.slice(0, 3) + '.'}</small>`}
        ${x.fetes.length && x.couleur !== 'resurrection' ? '<i class="pt-fete"></i>' : ''}${evs || officesDu(j).some((o) => o.mienne) ? '<i class="pt-evt"></i>' : ''}${x.couleur === 'mercredi-vendredi' ? '<i class="trait"></i>' : ''}${estNinive(x) ? `<i class="poissons-case">${POISSON}${POISSON}</i>` : ''}</button>`;
    }
  }
  const s = jour(S.sel), notes = [];
  if (dimancheCopte(S.sel)) notes.push(dimancheCopte(S.sel) + '.');
  officesDu(S.sel).forEach((o) => notes.push(`${o.mienne ? '' : nomCourtPar(PAR[o.idx]) + ' : '}${AR() && o.titreAr ? o.titreAr : o.titre} ${o.debut}–${o.fin}.`));
  { const cm = commemoMensuelle(S.sel); if (cm) notes.push((ICO_COMMEMO[cm] === 'gabriel' ? (AR() ? 'تذكار: ' : 'Fête : ') : AR() ? 'تذكار شهري: ' : 'Commémoration mensuelle : ') + cm + '.'); }
  if (s.fetes.length) notes.push(s.fetes.join(' · ') + '.');
  if (s.jeune) { notes.push(s.libelleJeune + '.'); if (s.niveau) notes.push(s.niveau + '.'); }
  if (!s.jeune && !s.fetes.length) notes.push(s.cinquanteJours ? t('cinquante') : t('pasDeJeune'));
  evenementsDu(S.sel).forEach((e) => notes.push(`${n(e.debut)} · ${e.titre}.`));
  const legende = [`<i class="sw" style="background:var(--careme)"></i>${t('legCareme')}`, `<i class="sw" style="background:var(--ochrebg);box-shadow:inset 0 0 0 1px var(--ochreline)"></i>${t('legJeune')}`,
    `<i class="trait-l"></i>${t('legMV')}`, `<i class="pt" style="background:var(--coral)"></i>${t('legFete')}`, `<i class="sw" style="box-shadow:inset 0 0 0 1.5px var(--gold)"></i>${t('legAuj')}`].map((l) => `<span>${l}</span>`).join('');
  return `${CP() ? entete(titreG, `${nomMoisC(cs.mois)} ${n(cs.an)}`) : entete(titreC, `${maj(nomMoisG(m))} ${n(y)}`)}
  <div class="contenu">
    <div class="nav"><button class="fl" data-a="moisDecal" data-d="-1" aria-label="${t('precedent')}">${fleche('prev')}</button>
    <span class="nav-txt"><small>${CP() ? (AR() ? `١ ${nomMoisC(cs.mois)} = ${fGreg(premier, false)} · ${n(jdnVersCopte(dernier).jour)} ${nomMoisC(cs.mois)} = ${fGreg(dernier, false)}` : `1er ${nomMoisC(cs.mois)} = ${gp.d} ${nomMoisG(gp.m)} · ${jdnVersCopte(dernier).jour} ${nomMoisC(cs.mois)} = ${gd.d} ${nomMoisG(gd.m)}`) : AR() ? `١ ${nomMoisG(m)} = ${n(c1.jour)} ${nomMoisC(c1.mois)} · ${n(jdnVersGreg(dernier).d)} ${nomMoisG(m)} = ${n(c2.jour)} ${nomMoisC(c2.mois)}` : `1er ${nomMoisG(m)} = ${c1.jour} ${c1.nomMois} · ${jdnVersGreg(dernier).d} ${nomMoisG(m)} = ${c2.jour} ${c2.nomMois}`}</small></span>
    <button class="fl" data-a="moisDecal" data-d="1" aria-label="${t('suivant')}">${fleche('next')}</button></div>
    <div class="grille-mois${R().wk ? ' avec-sem' : ''}"><span class="num-sem">${R().wk ? (AR() ? 'أ' : 'S.') : ''}</span>${tetes}${grille}</div>
    <div class="legende">${legende}</div>
    <section class="carte detail">
      <div class="carte-tete"><h2 class="serif">${maj(nomJour(S.sel))} ${n(jdnVersGreg(S.sel).d)}${S.sel === auj ? ' · ' + t('aujourdhui').toLowerCase() : ''}</h2><span class="tag">${s.fetes.length ? t('fete') : s.jeune ? t('jeune') : ''}</span></div>
      <div class="tuiles"><div><small>${t('copte')}</small><b class="or">${fCopte(S.sel)}</b></div><div><small>${t('gregorien')}</small><b>${n(jdnVersGreg(S.sel).d)} ${nomMoisG(jdnVersGreg(S.sel).m)} ${n(jdnVersGreg(S.sel).y)}</b></div></div>
      <p>${esc(notes.join(' '))}</p>
    </section>
  </div>${fab()}`;
}

// ------------------------------------------------------------- vue À venir
const f_fete = (x) => x.fete;
function aVenirListe() {
  const auj = aujCivil(), fin = auj + 365, L = [];
  const types = T[AR() ? 'ar' : 'fr'].types, reps = t('rep');
  // 1. Mes événements : prochaine occurrence (les répétitions ne sont montrées qu'une fois)
  P.evenements.forEach((e) => {
    const o = occurrences(e, auj, fin)[0]; if (o === undefined) return;
    const sous = [types[e.type], e.debut ? n(e.debut) : '', e.rep !== 'aucune' ? reps[e.rep] : '', e.lieu >= 0 && PAR[e.lieu] ? PAR[e.lieu].nom.replace(/^Paroisse (de la |de |)/, '') : ''].filter(Boolean).join(' · ');
    L.push({ j: o, cat: 'moi', titre: e.titre, sous, couleur: 'var(--accent)' });
  });
  // 2. Ma paroisse : fêtes patronales
  if (P.paroisse.idx >= 0) P.paroisse.patrons.forEach((pt) => {
    const o = prochaineDate(pt, auj); if (o > fin) return;
    L.push({ j: o, cat: 'paroisse', titre: (AR() ? 'العيد الشفيع: ' : 'Fête patronale : ') + pt.nom, sous: [PAR[P.paroisse.idx].nom.replace(/^Paroisse (de la |de |)/, ''), enSemaineSainte(o) ? NON_CELEBRE() : ''].filter(Boolean).join(' · '), couleur: 'var(--gold)', ic: iconeSaint(pt.nom), cad: cadrageSaint(pt.nom) });
  });
  // 2b. Offices annoncés par ma paroisse
  if (P.paroisse.idx >= 0) (PAR[P.paroisse.idx].offices || []).forEach((o) => {
    const [y, m, d] = o.date.split('-').map(Number), j = gregVersJdn(y, m, d); if (j < auj || j > fin) return;
    L.push({ j, cat: 'paroisse', titre: `${AR() && o.titreAr ? o.titreAr : o.titre} · ${o.debut}–${o.fin}`, sous: o.fete || '', couleur: 'var(--accent)' });
  });
  // 3. Église : fêtes, jeûnes, carême (périodes en cours comprises)
  const an = jdnVersCopte(auj).an, vus = new Set();
  [...evenementsAnneeCopte(an - 1), ...evenementsAnneeCopte(an), ...evenementsAnneeCopte(an + 1)].forEach((e) => {
    if (e.type === 'fete-mois' || e.id === 'cinquantaine' || e.fin < auj || e.debut > fin) return;
    const k = e.id + e.debut; if (vus.has(k)) return; vus.add(k);
    const jeune = e.type === 'jeune', car = e.type === 'careme' || e.type === 'semaine-sainte';
    const duree = e.fin > e.debut ? (AR() ? `حتى ${fCopteCourt(e.fin)}` : `jusqu’au ${fGreg(e.fin, false)}`) : '';
    L.push({ fete: e.type.startsWith('fete'), j: Math.max(e.debut, auj), cat: 'eglise', titre: nomEvt(e.id, e.nom), sous: [e.debut < auj ? (AR() ? 'جارٍ' : 'En cours') : '', duree].filter(Boolean).join(' · '),
      couleur: car ? 'var(--careme)' : jeune ? 'var(--ochre)' : e.type === 'periode' ? 'var(--dim)' : 'var(--coral)', grande: e.type === 'fete-majeure' });
  });
  const jp = new Set(L.filter((x) => x.cat === 'paroisse').map((x) => x.j));
  return L.filter((x) => !(x.cat === 'eglise' && jp.has(x.j) && f_fete(x))).sort((a, b) => a.j - b.j || (a.cat === 'moi' ? -1 : 1));
}
function vueAVenir() {
  const auj = aujCivil(), f = S.avFiltre || 'tout';
  const filtres = [['tout', AR() ? 'الكل' : 'Tout'], ['moi', AR() ? 'أحداثي' : 'Mes événements'], ['eglise', AR() ? 'الكنيسة' : 'Fêtes & jeûnes'], ['paroisse', AR() ? 'كنيستي' : 'Ma paroisse']];
  const liste = aVenirListe().filter((x) => f === 'tout' || x.cat === f);
  const dans = (d) => d === 0 ? (AR() ? 'اليوم' : 'aujourd’hui') : d === 1 ? (AR() ? 'غدًا' : 'demain') : AR() ? `بعد ${n(d)} يوم` : `dans ${d} j`;
  let html = '', moisCourant = '';
  liste.forEach((x) => {
    const g = jdnVersGreg(x.j), cleM = `${g.y}-${g.m}`;
    if (cleM !== moisCourant) { moisCourant = cleM; html += `<h2 class="sous-titre av-mois">${maj(nomMoisG(g.m))} ${n(g.y)}</h2>`; }
    html += `<button class="ligne-av${x.cat === 'moi' ? ' mien' : ''}" data-a="voirJour" data-j="${x.j}">
      <span class="ls-date"><small>${courtJour(x.j)}</small><b>${n(g.d)}</b></span><i class="ls-bande" style="background:${x.couleur}"></i>
      ${x.ic ? `<span class="saint-rond av-ic"><img src="${x.ic}" alt=""></span>` : ''}
      <span class="ls-txt"><span class="ls-haut"><b${x.grande ? ' class="or"' : ''}>${esc(x.titre)}</b></span><span class="ls-bas">${fCopteCourt(x.j)}${x.sous ? ' · ' + esc(x.sous) : ''}</span></span>
      <span class="av-dans">${dans(x.j - auj)}</span></button>`;
  });
  if (!liste.length) html = `<p class="mut vide">${f === 'moi' ? (AR() ? 'لا توجد أحداث. اضغط + لإضافة حدث.' : 'Aucun événement ajouté. Touchez + pour en créer un.') : f === 'paroisse' ? (AR() ? 'اختر كنيستك في الإعدادات.' : 'Choisissez votre paroisse pour voir ses fêtes patronales.') : ''}</p>`;
  return `${entete(AR() ? 'السنة القادمة' : 'Les 12 prochains mois', AR() ? 'القادم' : 'À venir')}
  <div class="contenu">
    <div class="puces defile">${filtres.map(([v, l]) => `<button class="puce${f === v ? ' on' : ''}" data-a="avFiltre" data-v="${v}" aria-pressed="${f === v}">${l}</button>`).join('')}</div>
    <div class="liste-av">${html}</div>
  </div>${fab()}`;
}

// ------------------------------------------------------------- vue Actus (vidéos YouTube du diocèse et de la paroisse)
const CLE_VU = 'ti-rompi-actus-vu';
let ACTUS = null, actusEtat = 'rien', actusVu = 0;
try { actusVu = +localStorage.getItem(CLE_VU) || 0; } catch (e) {}
function chargerActus() {
  if (actusEtat === 'chargement') return; actusEtat = 'chargement';
  fetch('data/actus.json', { cache: 'no-cache' }).then((r) => r.ok ? r.json() : Promise.reject()).then((d) => { ACTUS = d; actusEtat = 'ok'; rendre(); })
    .catch(() => { actusEtat = 'erreur'; if (S.vue === 'actus') rendre(); });
}
function videosActus(toutes) {
  if (!ACTUS) return [];
  const ch = ACTUS.chaines || {}, mienne = P.paroisse.idx >= 0 ? 'p' + P.paroisse.idx : '';
  // les paroisses hors diocèse (ex. Genève) n'apparaissent que si on les a choisies
  const hors = (k) => /^p\d+$/.test(k) && PAR[+k.slice(1)] && PAR[+k.slice(1)].horsDiocese && k !== mienne;
  const cles = (toutes ? Object.keys(ch) : ['diocese', mienne].filter(Boolean)).filter((k) => !hors(k));
  return cles.filter((k) => ch[k]).flatMap((k) => ch[k].videos.map((v) => ({ ...v, cle: k, source: k === 'diocese' ? 'dco' : k === mienne ? 'paroisse' : 'autre', chaine: ch[k].nom, t: Date.parse(v.date) })))
    .sort((a, b) => b.t - a.t);
}
const actusNouvelles = () => videosActus().filter((v) => v.t > actusVu).length;
function ilYa(t) {
  const j = Math.floor((Date.now() - t) / 864e5), d = new Date(t);
  if (j <= 0) return AR() ? 'اليوم' : 'aujourd’hui';
  if (j === 1) return AR() ? 'أمس' : 'hier';
  if (j < 7) return AR() ? `منذ ${n(j)} أيام` : `il y a ${j} j`;
  return `${n(d.getDate())} ${nomMoisG(d.getMonth() + 1).slice(0, AR() ? 99 : 4)}${AR() ? '' : '.'}${d.getFullYear() !== new Date().getFullYear() ? ' ' + n(d.getFullYear()) : ''}`;
}
function vueActus() {
  if (actusEtat === 'rien' || actusEtat === 'erreur') chargerActus();
  const f = S.acFiltre || 'tout', vuAvant = actusVu;
  const par = P.paroisse.idx >= 0 ? PAR[P.paroisse.idx] : null;
  const toutes = videosActus(f === 'diocese'), liste = toutes.filter((v) => f === 'tout' || f === 'diocese' || v.source === f);
  // marquer comme vues
  const miens = videosActus(); if (miens.length) { const max = Math.max(...miens.map((v) => v.t)); if (max > actusVu) { actusVu = max; try { localStorage.setItem(CLE_VU, String(max)); } catch (e) {} } }
  const filtres = [['tout', AR() ? 'الكل' : 'Tout'], ['dco', 'DCO Anba Marc'], ['diocese', AR() ? 'الإيبارشية' : 'Diocèse'], ['paroisse', AR() ? 'كنيستي' : 'Ma paroisse']];
  let corps;
  if (!ACTUS) corps = `<p class="mut vide">${actusEtat === 'erreur' ? (AR() ? 'تعذر تحميل الأخبار. تحقق من الاتصال.' : 'Impossible de charger les actus. Vérifiez la connexion.') : (AR() ? 'جارٍ التحميل…' : 'Chargement…')}</p>`;
  else if (!liste.length) corps = `<p class="mut vide">${f === 'paroisse' ? (!par ? (AR() ? 'اختر كنيستك أولاً.' : 'Choisissez d’abord votre paroisse.') : (AR() ? 'لا توجد قناة مسجلة لهذه الكنيسة بعد.' : 'Pas encore de chaîne YouTube enregistrée pour votre paroisse.')) : (AR() ? 'لا توجد فيديوهات.' : 'Aucune vidéo pour l’instant.')}</p>`;
  else corps = liste.map((v) => `<a class="carte-video" href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener">
      <span class="miniature"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg" alt="" loading="lazy">${(f === 'diocese' && v.source === 'autre' ? Date.now() - v.t < 2 * 864e5 : v.t > vuAvant && vuAvant) ? `<b class="nouveau">${AR() ? 'جديد' : 'Nouveau'}</b>` : ''}</span>
      <span class="video-txt"><b>${esc(v.titre)}</b><small><i class="pt-src ${v.source}"></i>${esc(v.chaine)} · ${ilYa(v.t)}</small></span></a>`).join('');
  return `${entete(AR() ? 'يوتيوب' : 'Vidéos YouTube', AR() ? 'الأخبار' : 'Actus')}
  <div class="contenu">
    <div class="puces defile">${filtres.map(([v, l]) => `<button class="puce${f === v ? ' on' : ''}" data-a="acFiltre" data-v="${v}" aria-pressed="${f === v}">${l}</button>`).join('')}</div>
    <div class="liste-video">${corps}</div>
    ${ACTUS ? `<small class="mut maj-actus">${AR() ? 'آخر تحديث' : 'Mis à jour'} ${ilYa(Date.parse(ACTUS.maj))}${AR() ? '' : ' à ' + new Date(ACTUS.maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>` : ''}
  </div>${fab()}`;
}

// ------------------------------------------------------------- vue Année
function vueAnnee() {
  const y = jdnVersGreg(S.sel).y, auj = aujCivil(), anC = jdnVersCopte(S.sel).an;
  let mois = '';
  for (let m = 1; m <= (CP() ? 13 : 12); m++) {
    const premier = CP() ? copteVersJdn(anC, m, 1) : gregVersJdn(y, m, 1), dernier = CP() ? finMoisC(anC, m) : gregVersJdn(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1;
    const c1 = jdnVersCopte(premier), c2 = jdnVersCopte(dernier);
    let cases = '<span></span>'.repeat(colonne(premier));
    for (let j = premier; j <= dernier; j++) {
      const x = jour(j), fill = teinte(x), fe = x.fetesIds.some((f) => !f.startsWith('29-')) && R().calques.fetes;
      const cls = ['mc', j === auj ? 'auj' : '', fill ? 'pleine' : '', x.couleur === 'resurrection' ? 'resur' : '', fe ? 'fete' : '', (x.couleur === 'careme' || x.couleur === 'semaine-sainte') ? 'violette' : ''].join(' ');
      cases += `<span class="${cls}" ${fill ? `style="--fill:${fill}"` : ''}>${n(CP() ? jdnVersCopte(j).jour : jdnVersGreg(j).d)}</span>`;
    }
    const cur = auj >= premier && auj <= dernier, g1 = jdnVersGreg(premier), g2 = jdnVersGreg(dernier);
    mois += `<button class="mini-mois${cur ? ' cur' : ''}" data-a="ouvrirMois" data-j="${cur ? auj : premier}"><b>${CP() ? nomMoisC(m) : maj(nomMoisG(m))}</b><small>${CP() ? (g1.m === g2.m ? maj(nomMoisG(g1.m)) : maj(nomMoisG(g1.m)) + ' · ' + nomMoisG(g2.m)) : c1.mois === c2.mois ? nomMoisC(c1.mois) : nomMoisC(c1.mois) + ' · ' + nomMoisC(c2.mois)}</small><span class="mini-grille">${cases}</span></button>`;
  }
  const a1 = jdnVersCopte(gregVersJdn(y, 1, 1)).an;
  const legende = [`<i class="sw" style="background:var(--careme)"></i>${t('legCareme')}`, `<i class="sw" style="background:var(--careme2)"></i>${t('legSS')}`, `<i class="sw" style="background:var(--jeunefill)"></i>${t('legJeune')}`,
    `<b style="color:var(--coraltx)">${n(12)}</b>${t('legFete')}`, `<i class="sw" style="background:var(--resur)"></i>${t('legRes')}`].map((l) => `<span>${l}</span>`).join('');
  const yP = CP() ? jdnVersGreg(copteVersJdn(anC, 8, 1)).y : y;
  return `${CP() ? entete(`${n(jdnVersGreg(copteVersJdn(anC, 1, 1)).y)} – ${n(jdnVersGreg(finMoisC(anC, 13)).y)}`, AR() ? `${n(anC)} للشهداء` : `${anC} des Martyrs`) : entete(AR() ? `${n(a1)} – ${n(a1 + 1)} للشهداء` : `${a1} – ${a1 + 1} des Martyrs`, n(y))}
  <div class="contenu">
    <div class="nav"><button class="fl" data-a="anneeDecal" data-d="-1" aria-label="${t('precedent')}">${fleche('prev')}</button>
    <span class="nav-txt"><small>${t('paquesLe')(fGreg(paques(yP), false))}</small></span>
    <button class="fl" data-a="anneeDecal" data-d="1" aria-label="${t('suivant')}">${fleche('next')}</button></div>
    <div class="grille-annee">${mois}</div>
    <div class="legende">${legende}</div>
  </div>`;
}

// ------------------------------------------------------------- Recherche
const sansAccent = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
let cacheIndex = null, cleIndex = '';
function indexRecherche() {
  const cle = aujCivil() + '|' + R().langue + '|' + P.evenements.length;
  if (cacheIndex && cle === cleIndex) return cacheIndex;
  cleIndex = cle; cacheIndex = indexRecherche0();
  return cacheIndex;
}
function indexRecherche0() {
  const auj = aujCivil(), c = jdnVersCopte(auj).an, items = [];
  const vus = new Set();
  for (const an of [c - 1, c, c + 1, c + 2]) {
    for (const e of evenementsAnneeCopte(an)) {
      if (e.fin < auj - 1 || e.id.startsWith('29-')) continue;
      const cle = e.id + '|' + an;
      if (vus.has(cle)) continue; vus.add(cle);
      items.push({ type: e.type.startsWith('fete') ? 'fete' : 'jeune', titre: nomEvt(e.id, e.nom), mots: sansAccent(e.nom + ' ' + nomAr(e.id) + ' ' + e.id + ' ' + jdnVersGreg(e.debut).y + (e.id === 'nativite' || e.id.startsWith('nativite') ? ' noel' : '') + (e.id === 'paques' ? ' paques resurrection' : '')), debut: e.debut, fin: e.fin, id: e.id });
    }
  }
  RITES.forEach((r) => items.push({ type: 'rite', titre: `${t('rite')} · ${r.nom}`, mots: sansAccent('rite ' + r.nom + ' ' + RITE_COURT[r.id]), riteId: r.id }));
  P.evenements.forEach((e) => items.push({ type: 'evt', titre: e.titre, mots: sansAccent(e.titre + ' ' + e.type), debut: occurrences(e, auj, auj + 800)[0] || e.jdn, fin: occurrences(e, auj, auj + 800)[0] || e.jdn }));
  if (!AR()) { const an0 = jdnVersCopte(auj).an; Object.entries(SYNAXAIRE).forEach(([k, l]) => { const [m, d] = k.split('-').map(Number); let j = null; for (let a = an0; a <= an0 + 4 && j === null; a++) { const x = copteVersJdn(a, m, d); if (x >= auj && jdnVersCopte(x).mois === m) j = x; } if (j !== null) l.forEach((s) => items.push({ type: 'saint', titre: s.replace(/\.$/, ''), mots: sansAccent(s), debut: j, fin: j })); }); }
  return items;
}
function rechercher(q) {
  const auj = aujCivil();
  const texte = sansAccent(q.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
  if (!texte) return { top: null, autres: [] };
  // date copte : « 7 Kiahk » ou « ٧ كيهك »
  const m = texte.match(/^(\d{1,2})\s+(.+)$/);
  if (m) {
    const idx = [...MOIS_COPTES.map(sansAccent), ...MOIS_COPTES_AR.map(sansAccent)].findIndex((x) => x.startsWith(m[2]) || m[2].startsWith(x));
    if (idx >= 0) {
      const mois = (idx % 13) + 1, jj = +m[1];
      let j = auj; while (!(jdnVersCopte(j).mois === mois && jdnVersCopte(j).jour === jj) && j < auj + 400) j++;
      if (j < auj + 400) return { top: { type: 'conv', titre: fCopte(j), debut: j, fin: j }, autres: [] };
    }
  }
  if (/prochain jeune|الصوم القادم/.test(texte)) {
    const j = Array.from({ length: 400 }, (_, k) => auj + 1 + k).find((d) => jour(d).jeune);
    if (j) return { top: { type: 'jeune', titre: t('prochainJeuneTitre') + ' · ' + (jour(j).libelleJeune || ''), debut: j, fin: j }, autres: [] };
  }
  const mots = texte.split(/\s+/).filter((w) => w.length > 1 && !['de', 'la', 'le', 'du', 'des', 'l', 'saint', 'sainte', 'st', 'ste'].includes(w));
  // variantes d'écriture courantes (Bichoy = Pichoï, Mina = Ménas, Abou Seifein = Mercure…)
  const VARIANTES = { bichoy: ['pichoi', 'pichai'], bishoy: ['pichoi', 'pichai'], mina: ['menas'], mena: ['menas'], guirguis: ['georges'], girgis: ['georges'], george: ['georges'], abanoub: ['noub'], shenouda: ['chenouda', 'chenoute'], chenouda: ['chenoute'], seifein: ['mercure'], marcurios: ['mercure'], mercorious: ['mercure'], kyrillos: ['cyrille'], cyril: ['cyrille'], karass: ['karas'], kiahk: ['kiahk'], noel: ['nativite'] };
  const groupes = mots.map((w) => [w, ...(VARIANTES[w] || [])]);
  const res = indexRecherche().map((it) => ({ it, s: groupes.filter((g) => g.some((w) => it.mots.includes(w))).length + (it.mots.includes(texte) ? 10 : 0) - (/^(rite|29-)/.test(it.mots) ? 0.5 : 0) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || (a.it.debut || 1e9) - (b.it.debut || 1e9));
  return { top: res[0] ? res[0].it : null, autres: res.slice(1, 9).map((x) => x.it) };
}
function vueRecherche() {
  const { top, autres } = rechercher(S.q);
  const date = (it) => it.debut ? (it.fin && it.fin !== it.debut ? `${maj(fGreg(it.debut))} → ${fGreg(it.fin)}` : maj(fGreg(it.debut))) : '';
  const carte = (it) => it.riteId ? `<button class="res" data-a="ouvrirRite" data-v="${it.riteId}"><b>${esc(it.titre)}</b><small>${t('serviceDiacre')}</small></button>`
    : `<button class="res" data-a="voirJour" data-j="${it.debut}"><b>${esc(it.titre)}</b><small>${date(it)}${it.debut ? ' · ' + fCopteCourt(it.debut) : ''}</small></button>`;
  return `<header class="entete simple"><button class="rond" data-a="fermer" aria-label="${t('retour')}">${fleche('prev')}</button>
    <label class="champ-recherche">${icone.loupe}<input id="q" value="${esc(S.q)}" placeholder="${t('recherche')}" autocomplete="off" aria-label="${t('recherche')}"></label>
    ${S.q ? `<button class="texte-btn" data-a="viderQ">${t('effacer')}</button>` : ''}</header>
  <div class="contenu">
    <div class="puces">${t('suggestions').map((s) => `<button class="puce${sansAccent(s) === sansAccent(S.q) ? ' on' : ''}" data-a="suggestion" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    ${top ? `<section class="carte top"><span class="etiquette">${top.type === 'conv' ? t('conversion') : top.type === 'rite' ? t('rite') : top.type === 'fete' ? t('fete') : top.type === 'evt' ? t('mesEvenements') : top.type === 'saint' ? t('synaxaire') : t('jeune')}</span>
      <h2 class="serif grand">${esc(top.titre)}</h2>
      ${top.debut ? `<div class="tuiles"><div><small>${t('copte')}</small><b class="or">${fCopte(top.debut)}</b></div><div><small>${t('gregorien')}</small><b>${top.fin && top.fin !== top.debut ? maj(fGreg(top.debut, false)) + ' → ' + fGreg(top.fin) : maj(fGreg(top.debut))}</b></div></div>
      <button class="bouton-or" data-a="voirJour" data-j="${top.debut}">${t('voirCalendrier')}</button>` : `<button class="bouton-or" data-a="ouvrirRite" data-v="${top.riteId}">${t('lireRite')}</button>`}</section>` : ''}
    ${autres.length ? `<h3 class="sous-titre">${t('aussiTrouve')}</h3>${autres.map(carte).join('')}` : ''}
    ${!top && S.q ? `<p class="mut">${t('aucunResultat')}</p>` : ''}
    ${!S.q ? `<p class="aide">${t('rechercheVide')}</p>` : ''}
  </div>`;
}

// ------------------------------------------------------------- Rites
function prochainDebut(riteId) {
  const auj = aujCivil(), c = jdnVersCopte(auj).an, ev = RITE_EVT[riteId];
  const l = [...evenementsAnneeCopte(c), ...evenementsAnneeCopte(c + 1)].filter((e) => (ev.endsWith('-') ? e.id.startsWith(ev) : e.id === ev) && e.debut >= auj).sort((a, b) => a.debut - b.debut);
  return l[0] || null;
}
function vueRites() {
  const liste = RITES.filter((r) => r.groupe === S.riteGroupe).map((r) => ({ r, e: prochainDebut(r.id) })).sort((a, b) => (a.e ? a.e.debut : 1e9) - (b.e ? b.e.debut : 1e9));
  if (!S.riteSel || !liste.find((x) => x.r.id === S.riteSel)) S.riteSel = liste[0].r.id;
  const cur = RITES.find((r) => r.id === S.riteSel), e = prochainDebut(cur.id);
  const puces = liste.map(({ r }) => `<button class="puce${r.id === S.riteSel ? ' on' : ''}" data-a="choisirRite" data-v="${r.id}" role="tab" aria-selected="${r.id === S.riteSel}"><i class="pt" style="background:${r.color}"></i>${esc(RITE_COURT[r.id])}</button>`).join('');
  // Le texte n'est jamais modifié : on ajoute seulement des repères de navigation, une introduction et des citations repliables.
  const seg = (g) => g.c !== undefined ? `<span class="copte" lang="cop">${esc(g.c)}</span>` : g.q !== undefined ? `<details class="citation"><summary>${t('citation')} · ${esc(g.ref)} <small>${t('toucherDeplier')}</small></summary><span>${esc(g.q)}</span></details>` : esc(g.t);
  const para = (p) => `<div class="para">${p.map(seg).join('')}</div>`;
  const reperes = cur.blocs.filter((b) => b.repere);
  const mots = cur.blocs.reduce((n, b) => n + b.paras.reduce((m, p) => m + p.map((g) => g.t || g.q || g.c || '').join('').split(/\s+/).length, 0), 0);
  const texte = (reperes.length ? `<nav class="sommaire" aria-label="${t('aller')}"><span class="etiquette">${t('aller')}</span><div class="puces">${reperes.map((b) => `<button class="puce" data-a="allerRepere" data-v="r-${cur.blocs.indexOf(b)}">${esc(b.titre)}</button>`).join('')}</div><small class="mut">${t('tempsLecture')(Math.max(1, Math.round(mots / 220)))}</small></nav>` : '')
    + cur.blocs.map((b, k) => b.replie ? `<details class="intro"><summary>${t('lireIntro')}</summary>${b.paras.map(para).join('')}</details>`
      : `${b.hasTitre ? `<h3 class="${b.repere ? 'repere' : 'sous-titre-rite'}" id="r-${k}">${esc(b.titre)}</h3>` : ''}${b.repere && /Lakkan/.test(b.titre) && cur.id !== 'lakkan' && window.ICONES && window.ICONES.lakkan ? `<img class="icone-saint icone-repere" src="${window.ICONES.lakkan}" alt="${t('iconeDe')} Lakkan">` : ''}${b.paras.map(para).join('')}`).join('');
  return `<header class="entete simple"><button class="rond" data-a="fermer" aria-label="${t('retour')}">${fleche('prev')}</button>
    <div class="titres"><span class="surtitre">${t('serviceDiacre')}</span><h1 class="titre">${t('rites')}</h1></div></header>
  <div class="contenu">
    <div class="onglets deux">${['p', 'f'].map((g) => `<button class="onglet${S.riteGroupe === g ? ' actif' : ''}" data-a="riteGroupe" data-v="${g}">${g === 'p' ? t('periodes') : t('fetesUnJour')}</button>`).join('')}</div>
    <div class="puces defile" role="tablist">${puces}</div>
    <section class="carte rite-tete">${iconeRite(cur.id) ? `<img class="icone-saint icone-rite-grande" src="${iconeRite(cur.id)}" alt="${t('iconeDe')} ${esc(cur.nom)}">` : `<i class="barre" style="background:${cur.color}"></i>`}<div><small class="etiquette">${esc(cur.kind)} · ${t('debut')}</small>
      <h2 class="serif">${esc(cur.nom)}</h2>${e ? `<b class="or">${maj(fGreg(e.debut))} · ${fCopte(e.debut)}</b>` : ''}</div></section>
    ${AR() ? `<p class="aide">${t('ritesFrSeulement')}</p>` : ''}
    <article class="texte-rite" lang="fr" dir="ltr"><span class="etiquette">${t('rite')}</span>${texte}<p class="source">${t('source')(cur.pages)}</p></article>
  </div>`;
}

// ------------------------------------------------------------- Paroisse
function vueParoisse() {
  fixerDatesPatrons();
  const p = P.paroisse, auj = aujCivil();
  const regions = [...new Set(PAR.map((x) => x.region))];
  const options = regions.map((rg) => `<optgroup label="${esc(rg)}">${PAR.map((x, i) => x.region === rg ? `<option value="${i}"${p.idx === i ? ' selected' : ''}>${esc(x.nom.replace(/^Paroisse (de la |de |)/, '') + ' — ' + x.adresse.replace(/^.*\d{5} /, ''))}</option>` : '').join('')}</optgroup>`).join('');
  const ch = PAR[p.idx];
  return `<header class="entete simple"><button class="rond" data-a="fermer" aria-label="${t('retour')}">${fleche('prev')}</button><h1 class="titre">${t('maParoisse')}</h1></header>
  <div class="contenu formulaire">
    <label><span class="etiquette">${t('paroisse')}</span><select data-c="par-idx"><option value="-1">${t('choisirParoisse')}</option>${options}</select>${ch ? `<small class="mut">${esc(ch.adresse)}</small>` : ''}</label>
    ${ch ? `<span class="etiquette">${t('saintsPatrons')} · ${n(p.patrons.length)}</span>
    ${p.patrons.map((pt, i) => { const j = prochaineDate(pt, auj), ic = iconeSaint(pt.nom), fixe = feteFixe(pt.nom); return `<section class="carte patron">${ic ? `<img class="icone-saint" src="${ic}" alt="${t('iconeDe')} ${esc(pt.nom)}">` : ''}<div class="patron-corps">
      <div class="carte-tete">${fixe ? `<b class="nom-patron serif">${esc(pt.nom)}</b>` : `<input class="nom-patron" data-c="pat-nom" data-i="${i}" value="${esc(pt.nom)}" aria-label="${t('saintsPatrons')} ${i + 1}">`}</div>
      ${fixe ? '' : `<div class="deux-col"><label><small class="mut">${t('jourLabel')}</small><select data-c="pat-jour" data-i="${i}">${Array.from({ length: pt.mois === 13 ? 6 : 30 }, (_, k) => `<option value="${k + 1}"${pt.jour === k + 1 ? ' selected' : ''}>${n(k + 1)}</option>`).join('')}</select></label>
      <label><small class="mut">${t('moisCopteLabel')}</small><select data-c="pat-mois" data-i="${i}">${MOIS_COPTES.map((m, k) => `<option value="${k + 1}"${pt.mois === k + 1 ? ' selected' : ''}>${nomMoisC(k + 1)}</option>`).join('')}</select></label></div>`}
      <span class="or">${t('fetePatronale')} · ${maj(fGreg(j))}</span><small class="mut">${n(pt.jour)} ${nomMoisC(pt.mois)} · ${t('dans')(j - auj)}</small></div></section>`; }).join('')}
    <p class="aide">${AR() ? 'لكل شفيع عيده الخاص، بتاريخ ثابت حسب السنكسار.' : 'Chaque saint patron a sa propre fête, à date fixe selon le synaxaire.'}</p>` : `<p class="aide">${t('paroisseAChoisir')}</p>`}
    <div class="groupe">${interrupteur('par-cal', p.cal, t('afficherCal'), t('afficherCalSub'))}${interrupteur('par-rappel', p.rappel, t('rappelVeille'), t('rappelVeilleSub'))}</div>
  </div>`;
}
const interrupteur = (cle, on, titre, sous) => `<div class="ligne-reglage"><span><b>${esc(titre)}</b>${sous ? `<small>${esc(sous)}</small>` : ''}</span><button class="inter${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(titre)}" data-a="bascule" data-c="${cle}"><i></i></button></div>`;
const segment = (cle, val, opts, titre, sous) => `<div class="ligne-reglage"><span><b>${esc(titre)}</b>${sous ? `<small>${esc(sous)}</small>` : ''}</span><span class="seg">${opts.map(([v, l]) => `<button class="${String(val) === String(v) ? 'on' : ''}" aria-pressed="${String(val) === String(v)}" data-a="segment" data-c="${cle}" data-v="${v}">${esc(l)}</button>`).join('')}</span></div>`;

// ------------------------------------------------------------- Nouvel événement
function vueEvenement() {
  const e = S.evt;
  const [y, m, d] = e.date.split('-').map(Number);
  const j0 = gregVersJdn(y, m, d), c0 = jdnVersCopte(j0);
  const tmp = { ...e, jdn: j0 };
  const prochaines = occurrences(tmp, j0, j0 + 800).slice(0, 3);
  const reps = Object.entries(t('rep')).map(([v, l]) => [v, v === 'semaine' ? `${l} (${nomJour(j0)})` : v === 'moisCopte' ? `${l} (${n(c0.jour)})` : v === 'anneeCopte' ? `${l} (${n(c0.jour)} ${nomMoisC(c0.mois)})` : v === 'mois' ? `${l} (${n(d)})` : l]);
  const x = jour(j0);
  return `<header class="entete simple barre-actions"><button class="texte-btn" data-a="fermer">${t('annuler')}</button><h1 class="titre petit">${t('nouvelEvenement')}</h1><button class="bouton-or" data-a="enregistrerEvt">${t('enregistrer')}</button></header>
  <div class="contenu formulaire">
    <label><span class="etiquette">${t('titre')}</span><input data-c="evt-titre" value="${esc(e.titre)}" placeholder="${t('titrePh')}"></label>
    <div class="puces">${t('types').map((ty, i) => `<button class="puce${e.type === i ? ' on' : ''}" data-a="evtType" data-v="${i}">${esc(ty)}</button>`).join('')}</div>
    <div class="trois-col"><label><span class="etiquette">${t('date')}</span><input type="date" data-c="evt-date" value="${e.date}"></label>
      <label><span class="etiquette">${t('heureDebut')}</span><input type="time" data-c="evt-debut" value="${e.debut}"></label>
      <label><span class="etiquette">${t('heureFin')}</span><input type="time" data-c="evt-fin" value="${e.fin}"></label></div>
    <span class="or">${maj(nomJour(j0))} · ${fCopte(j0)}${x.fetes.length ? ' · ' + esc(x.fetes.join(', ')) : ''}</span>
    <label><span class="etiquette">${t('lieu')}</span><select data-c="evt-lieu"><option value="-1">${t('aucunLieu')}</option>${PAR.map((p, i) => `<option value="${i}"${e.lieu === i ? ' selected' : ''}>${esc(p.nom.replace(/^Paroisse (de la |de |)/, '') + ' — ' + p.adresse.replace(/^.*\d{5} /, ''))}</option>`).join('')}</select></label>
    <label><span class="etiquette">${t('repetition')}</span><select data-c="evt-rep">${reps.map(([v, l]) => `<option value="${v}"${e.rep === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label><span class="etiquette">${t('rappel')}</span><select data-c="evt-rappel">${Object.entries(t('rappels')).map(([v, l]) => `<option value="${v}"${e.rappel === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <section class="carte"><span class="etiquette">${t('apercu')}</span><h2 class="serif">${esc(e.titre || t('types')[e.type])} · ${n(e.debut)}–${n(e.fin)}</h2>
      <span class="mut">${e.lieu >= 0 ? esc(PAR[e.lieu].adresse) : t('aucunLieu')}</span><span class="etiquette">${t('prochainesDates')}</span>${prochaines.map((j) => `<span>${maj(fGreg(j))} · ${fCopte(j)}</span>`).join('')}</section>
  </div>`;
}

// ------------------------------------------------------------- Réglages
function vueReglages() {
  const r = R(), o = t('opts'), g = t('groupes'), L = t('rg');
  const villes = Object.entries(VILLES).map(([k, v]) => [k, v.nom]);
  const ch = PAR[P.paroisse.idx];
  return `<header class="entete simple"><button class="rond" data-a="fermer" aria-label="${t('retour')}">${fleche('prev')}</button><h1 class="titre">${t('reglages')}</h1></header>
  <div class="contenu reglages">
    <h3 class="sous-titre">${g.affichage}</h3><div class="groupe">
      ${segment('main', r.main, [['copte', o.copte], ['gregorien', o.gregorien]], L.main, L.mainSub)}
      ${segment('langue', r.langue, [['fr', 'Français'], ['ar', 'العربية']], L.langue, L.langueSub)}
      ${segment('first', r.first, [['lun', o.lun], ['dim', o.dim]], L.first)}
      ${interrupteur('wk', r.wk, L.wk)}
      ${segment('theme', r.theme, [['nuit', o.nuit], ['jour', o.jourT], ['auto', o.auto]], L.theme)}
      ${segment('taille', r.taille, [[1, 'A'], [1.12, 'A+'], [1.25, 'A++']], L.taille, L.tailleSub)}
      ${interrupteur('contraste', r.contraste, L.contraste, L.contrasteSub)}
      ${segment('couleurs', r.couleurs, [['simples', o.simples], ['parJeune', o.parJeune]], L.couleurs, L.couleursSub)}
      <div class="ligne-reglage"><span><b>${L.ville}</b><small>${L.villeSub}</small></span><select class="petit-select" data-c="ville" aria-label="${L.ville}">${villes.map(([k, v]) => `<option value="${k}"${r.ville === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <h3 class="sous-titre">${g.paroisse}</h3><div class="groupe">
      <button class="ligne-reglage lien-ligne" data-a="ouvrir" data-v="paroisse"><span><b>${L.paroisse}</b><small>${ch ? esc(ch.nom.replace(/^Paroisse (de la |de |)/, '')) : t('choisirParoisse')}</small></span>${fleche('next')}</button></div>
    <h3 class="sous-titre">${g.calques}</h3><div class="groupe">
      ${interrupteur('cal-jeunes', r.calques.jeunes, L.jeunes, L.jeunesSub)}${interrupteur('cal-careme', r.calques.careme, L.careme, L.caremeSub)}
      ${interrupteur('cal-mv', r.calques.mv, L.mv)}${interrupteur('cal-fetes', r.calques.fetes, L.fetes)}
      ${interrupteur('cal-saints', r.calques.saints, L.saints)}${interrupteur('cal-lectures', r.calques.lectures, L.lectures, L.lecturesSub)}
    </div>
    <h3 class="sous-titre">${g.rappels}</h3><div class="groupe">
      ${interrupteur('rap-veille', r.rappels.veille, L.rVeille, '20:00')}${interrupteur('rap-fete', r.rappels.fete, L.rFete, '08:00')}${interrupteur('rap-matin', r.rappels.matin, L.rMatin)}
      <p class="note">${L.rappelsNote}</p>
      <button class="ligne-reglage lien-ligne" data-a="exporter"><span><b>${L.exporter}</b><small>${L.exporterSub}</small></span>${fleche('next')}</button></div>
    <h3 class="sous-titre">${g.confid}</h3><div class="groupe">
      <div class="ligne-reglage"><span><b>${L.aucuneDonnee}</b><small>${L.aucuneDonneeSub}</small></span></div>
      <div class="ligne-reglage"><span><b>${L.sauvegarde}</b><small>${S.sauvegarde === 'compte' ? t('sauveCompte') : S.sauvegarde === 'local' ? t('sauveLocal') : t('sauveAucun')}</small></span></div>
      ${S.confirmerEffacer ? `<div class="ligne-reglage"><span><b>${L.effacer} ?</b></span><span class="seg"><button data-a="effacerTout" class="danger">${L.confirmerEffacer}</button><button data-a="annulerEffacer">${L.annulerEffacer}</button></span></div>`
        : `<button class="ligne-reglage lien-ligne" data-a="demanderEffacer"><span><b>${L.effacer}</b><small>${L.effacerSub}</small></span>${fleche('next')}</button>`}
    </div>
    <h3 class="sous-titre">${g.apropos}</h3><div class="groupe"><button class="ligne-reglage lien-ligne marque" data-a="ouvrir" data-v="nouveautes"><img src="${window.LOGO || ''}" alt="" width="48" height="48"><span><b class="copte-titre" lang="cop">}rompi</b><small>Ti rompi · ${AR() ? 'الإصدار' : 'Version'} ${n(VER.version)}${VER.maj ? ' · ' + (AR() ? 'حُدّث في ' : 'mise à jour le ') + VER.maj : ''}</small><small class="or">${AR() ? 'ما الجديد' : 'Voir les nouveautés'}</small></span>${fleche('next')}</button></div>
  </div>`;
}

// ------------------------------------------------------------- export vers le calendrier du téléphone (.ics)
function exporterCalendrier() {
  const auj = aujCivil(), fin = auj + 400, an = jdnVersCopte(auj).an, r = R().rappels;
  const d8 = (j) => { const g = jdnVersGreg(j); return `${g.y}${String(g.m).padStart(2, '0')}${String(g.d).padStart(2, '0')}`; };
  const txt = (v) => String(v).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ti rompi//Calendrier copte//FR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Ti rompi · Calendrier copte'];
  const ajout = (uid, nom, j1, j2, desc, alarme) => {
    L.push('BEGIN:VEVENT', `UID:${uid}@ti-rompi`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(j1)}`, `DTEND;VALUE=DATE:${d8(j2 + 1)}`, `SUMMARY:${txt(nom)}`, `DESCRIPTION:${txt(desc)}`, 'TRANSP:TRANSPARENT');
    if (alarme) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${txt(nom)}`, `TRIGGER:${alarme}`, 'END:VALARM');
    L.push('END:VEVENT');
  };
  const vus = new Set();
  for (const a of [an, an + 1]) for (const e of evenementsAnneeCopte(a)) {
    if (e.fin < auj || e.debut > fin || e.type === 'fete-mois' || e.type === 'periode' || vus.has(e.id + e.debut)) continue;
    vus.add(e.id + e.debut);
    const jeune = ['jeune', 'careme', 'semaine-sainte'].includes(e.type);
    const c = jdnVersCopte(e.debut);
    ajout(`${e.id}-${e.debut}`, nomEvt(e.id, e.nom), e.debut, e.fin, `${c.jour} ${nomMoisC(c.mois)} ${c.an}`,
      jeune ? (r.veille ? '-PT4H' : null) : (r.fete ? 'PT8H' : null));
  }
  if (P.paroisse.idx >= 0) P.paroisse.patrons.forEach((pt, i) => {
    const j = prochaineDate(pt, auj);
    ajout(`patron-${i}-${j}`, `${t('fetePatronale')} · ${pt.nom}`, j, j, PAR[P.paroisse.idx].nom, P.paroisse.rappel ? '-PT4H' : null);
  });
  L.push('END:VCALENDAR');
  const blob = new Blob([L.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ti-rompi.ics';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ------------------------------------------------------------- Nouveautés (historique des versions)
const VER = window.TI_VERSION || { version: '0.5', maj: '', nouveautes: [] };
function vueNouveautes() {
  return `<header class="entete simple"><button class="rond" data-a="ouvrir" data-v="reglages" aria-label="${t('retour')}">${fleche('prev')}</button><h1 class="titre">${AR() ? 'ما الجديد' : 'Nouveautés'}</h1></header>
  <div class="contenu">
    ${VER.nouveautes.map((x, i) => `<section class="carte"><div class="carte-tete"><h2 class="serif">${AR() ? 'الإصدار' : 'Version'} ${n(x.v)}</h2><span class="tag">${i === 0 ? (AR() ? 'الحالية' : 'actuelle') : esc(x.date)}</span></div>
      ${i === 0 && x.date ? `<small class="mut">${esc(x.date)}</small>` : ''}<ul class="liste-nouv">${x.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></section>`).join('')}
  </div>`;
}

// ------------------------------------------------------------- Semaine sainte : pas de synaxaire ni de fête de saint
const _ss = {};
function enSemaineSainte(j) {
  const an = jdnVersCopte(j).an;
  for (const a of [an - 1, an]) {
    if (!(a in _ss)) { const e = evenementsAnneeCopte(a).find((x) => x.id === 'semaine-sainte'); _ss[a] = e ? [e.debut, e.fin] : null; }
    if (_ss[a] && j >= _ss[a][0] && j <= _ss[a][1]) return true;
  }
  return false;
}
const NON_CELEBRE = () => AR() ? 'لا يُحتفل به (أسبوع الآلام)' : 'Non célébrée (Semaine sainte)';
// ------------------------------------------------------------- Page d'un saint patron
const CLES_SAINTS = [[/vierge|marie|notre/i, 'vierge'], [/rapha/i, 'raphael'], [/michel/i, 'michel'], [/georges/i, 'georges'], [/mina/i, 'mina'], [/merc|marcur|philopat/i, 'mercure'], [/mo[iï]se/i, 'moise'], [/samuel/i, 'samuel'], [/antoine/i, 'antoine'], [/pierre/i, 'pierrepaul'], [/paul/i, 'paul'], [/bichoy/i, 'bichoy'], [/kar[a]?s/i, 'karas'], [/cyril|kyril/i, 'kyrillos'], [/jean/i, 'jean'], [/marc\b/i, 'marc']];
const cleSaint = (nom) => (CLES_SAINTS.find(([re]) => re.test(nom || '')) || [])[1];
let SV = null, svEtat = 'rien';
function chargerSV() { if (svEtat !== 'rien') return; svEtat = 'chargement'; fetch('data/saints-videos.json', { cache: 'no-cache' }).then((r) => r.ok ? r.json() : Promise.reject()).then((d) => { SV = d; svEtat = 'ok'; if (S.vue === 'saint') rendre(); }).catch(() => { svEtat = 'erreur'; }); }
function videosSaint(cle) {
  const pk = 'p' + P.paroisse.idx, par = PAR[P.paroisse.idx] || {};
  let l = (SV && SV.paroisses && SV.paroisses[pk] && SV.paroisses[pk][cle]) || [];
  if (!l.length && par.videos_manuelles && par.videos_manuelles[cle]) l = par.videos_manuelles[cle];
  return l.slice(0, 3);
}
function vueSaint() {
  chargerSV();
  const pt = P.paroisse.patrons[S.saint] || P.paroisse.patrons[0]; if (!pt) return vueParoisse();
  const cle = cleSaint(pt.nom), D = (window.SAINTS || {})[cle] || {}, auj = aujCivil(), j = prochaineDate(pt, auj), g = jdnVersGreg(j);
  const ic = iconeSaint(pt.nom), hs = enSemaineSainte(j), dans = j - auj;
  const secs = [D.axios ? ['axios', 'Axios'] : null, D.dox && D.dox.length ? ['dox', AR() ? 'الذكصولوجية' : 'Doxologie'] : null, D.resume ? ['hist', AR() ? 'السيرة' : 'Histoire'] : null, ['vid', AR() ? 'فيديوهات' : 'Vidéos']].filter(Boolean);
  const strophes = (l) => l.map((x) => `<div class="str"><p class="copte" lang="cop" dir="ltr">${esc(x.c).replace(/@/g, '@<br>')}</p>${AR() && x.a ? `<p class="fr ar" dir="rtl" lang="ar">${esc(x.a)}</p>` : `<p class="fr">${esc(x.f)}</p>`}</div>`).join('');
  const dox = (D.dox || []).map((d, i) => `<details class="carte dox"${i === 0 ? ' open' : ''}><summary><b>${esc(D.dox.length > 1 ? d.titre.replace(/^Saint\w* |^L[ae]s? |^L’/i, '').replace(/^./, (c) => c.toUpperCase()) : (AR() ? 'الذكصولوجية' : 'Doxologie'))}</b><small class="mut">${n(d.strophes.length)} ${AR() ? 'مقاطع' : 'strophes'}</small></summary>${strophes(d.strophes)}<small class="mut src">${AR() ? 'الإبصلمودية السنوية' : 'Psalmodie annuelle'}</small></details>`).join('');
  const vids = videosSaint(cle);
  const vidsHtml = vids.length ? vids.map((v) => `<a class="carte-video" href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener"><span class="miniature"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg" alt="" loading="lazy"></span><span class="video-txt"><b>${esc(v.titre)}</b>${v.date ? `<small><i class="pt-src paroisse"></i>${ilYa(Date.parse(v.date))}</small>` : ''}</span></a>`).join('')
    : `<p class="mut vide">${svEtat === 'chargement' ? (AR() ? 'جارٍ التحميل…' : 'Chargement…') : (AR() ? 'لا توجد فيديوهات بعد.' : 'Pas encore de vidéo trouvée sur la chaîne de la paroisse.')}</p>`;
  return `<header class="entete simple"><button class="rond" data-a="fermer" aria-label="${t('retour')}">${fleche('prev')}</button><h1 class="titre">${esc(pt.nom)}</h1></header>
  <div class="contenu page-saint">
    <div class="saint-hero">${ic ? `<span class="arche-grande"><img src="${ic}" alt="${t('iconeDe')} ${esc(pt.nom)}"></span>` : ''}
      <button class="fete-saint" data-a="voirJour" data-j="${j}"><small>${t('fetePatronale')}</small><b class="serif">${n(pt.jour)} ${nomMoisC(pt.mois)}</b><span>${maj(nomJour(j))} ${n(g.d)} ${nomMoisG(g.m)} ${n(g.y)}</span>
      ${hs ? `<span class="chip-hs">${NON_CELEBRE()}</span>` : `<span class="chip">${dans === 0 ? (AR() ? 'اليوم' : 'aujourd’hui') : AR() ? `بعد ${n(dans)} يوم` : `dans ${dans} jour${dans > 1 ? 's' : ''}`}</span>`}</button></div>
    ${secs.length > 1 ? `<nav class="puces defile saut">${secs.map(([id, l]) => `<a class="puce" href="#s-${id}" data-a="saut" data-v="s-${id}">${l}</a>`).join('')}</nav>` : ''}
    ${D.axios ? `<section id="s-axios"><h2 class="sous-titre">Axios</h2><div class="carte axios"><p class="copte" lang="cop" dir="ltr">${esc(D.axios)}</p>${(AR() ? D.axiosAr : D.axiosFr) ? `<p class="mut"${AR() ? ' dir="rtl"' : ''}>${esc(AR() ? D.axiosAr : D.axiosFr)}</p>` : ''}</div></section>` : ''}
    ${D.chant ? `<section id="s-chant"><h2 class="sous-titre">${AR() ? 'لحن' : 'Chant'}</h2>${carteChant(D)}</section>` : ''}
    ${dox ? `<section id="s-dox"><h2 class="sous-titre">${AR() ? 'الذكصولوجية' : 'Doxologie'}</h2>${dox}</section>` : ''}
    ${D.resume ? `<section id="s-hist"><h2 class="sous-titre">${AR() ? 'السيرة' : 'Histoire'}</h2><div class="carte hist">${D.resume.map((p) => `<p>${esc(p)}</p>`).join('')}${D.lien ? `<a class="lien" href="${D.lien}" target="_blank" rel="noopener">${AR() ? 'السيرة الكاملة على كاتاميروس' : 'Lire l’histoire complète sur Katameros'} ${AR() ? '←' : '→'}</a>` : ''}</div></section>` : ''}
    <section id="s-vid"><h2 class="sous-titre">${AR() ? 'فيديوهات' : 'Vidéos'}</h2><div class="liste-video">${vidsHtml}</div></section>
  </div>${fab()}`;
}

// ------------------------------------------------------------- rendu et navigation
const VUES = { jour: vueJour, semaine: vueSemaine, mois: vueMois, annee: vueAnnee, avenir: vueAVenir, actus: vueActus, recherche: vueRecherche, rites: vueRites, paroisse: vueParoisse, evenement: vueEvenement, reglages: vueReglages, nouveautes: vueNouveautes, saint: vueSaint };
let derniereVue = null;
function rendre(garderFocus) {
  const actif = document.activeElement, idFocus = actif && actif.id, pos = actif && actif.selectionStart;
  const defile = $app.querySelector('.contenu') ? $app.querySelector('.contenu').scrollTop : 0;
  $app.innerHTML = `<div class="ecran${derniereVue !== S.vue ? ' entree' : ''}">${VUES[S.vue]()}</div>`;
  if (derniereVue === S.vue && $app.querySelector('.contenu')) $app.querySelector('.contenu').scrollTop = defile;
  if (derniereVue !== S.vue) { try { window.scrollTo(0, 0); } catch (e) {} }
  derniereVue = S.vue;
  if (garderFocus && idFocus) { const el = document.getElementById(idFocus); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} } }
  try { if (['jour', 'semaine', 'mois', 'annee', 'recherche', 'rites', 'reglages'].includes(S.vue) && location.hash !== '#' + S.vue) history.replaceState(null, '', '#' + S.vue); } catch (e) {}
}
function ouvrir(v) { if (['jour', 'semaine', 'mois', 'annee', 'avenir', 'actus'].includes(S.vue)) S.retour = S.vue; S.vue = v; rendre(); }


// ------------------------------------------------------------- glisser pour changer de jour / semaine / mois / année
(function () {
  const PAS = { jour: ['decaler', 1], semaine: ['decaler', 7], mois: ['moisDecal', 1], annee: ['anneeDecal', 1] };
  let x0 = 0, y0 = 0, t0 = 0, sens = null, cible = null, actif = false, retour = null;
  // pages secondaires (Réglages, Rites, Paroisse, Nouveautés…) : glisser vers la droite = bouton retour
  const boutonRetour = () => $app.querySelector('header.entete.simple > .rond[data-a]');
  const ignorer = (el) => el.closest('input, textarea, select, .defile, .barre-bas, .entete, [contenteditable]');
  $app.addEventListener('touchstart', (e) => {
    actif = false; sens = null;
    retour = PAS[S.vue] ? null : boutonRetour();
    if ((!PAS[S.vue] && !retour) || e.touches.length !== 1 || ignorer(e.target)) return;
    actif = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    cible = $app.querySelector('.contenu');
  }, { passive: true });
  $app.addEventListener('touchmove', (e) => {
    if (!actif) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (!sens && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) sens = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
    if (sens === 'v') { actif = false; return; }
    if (sens === 'h') {
      e.preventDefault();
      const vers = AR() ? -dx : dx;
      if (retour && vers < 0) return; // retour : seulement vers la droite (gauche en arabe)
      if (cible) { cible.style.transition = 'none'; cible.style.transform = `translateX(${retour ? dx * 0.8 : dx * 0.45}px)`; cible.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, 0.35)); }
    }
  }, { passive: false });
  const fin = (e) => {
    if (!actif || sens !== 'h') { actif = false; return; }
    actif = false;
    const dx = (e.changedTouches[0] || {}).clientX - x0, vite = Math.abs(dx) / Math.max(1, Date.now() - t0) > 0.45;
    const remettre = () => { if (cible) { cible.style.transition = 'transform .2s ease, opacity .2s ease'; cible.style.transform = ''; cible.style.opacity = ''; } };
    if (Math.abs(dx) < 70 && !vite) { remettre(); return; }
    if (retour) {
      if ((AR() ? -dx : dx) <= 0) { remettre(); return; }
      retour.click();
      const c = $app.querySelector('.contenu'); if (c) { c.classList.add('glisse-prec'); }
      return;
    }
    // vers la gauche = suivant (inversé en arabe, lecture de droite à gauche)
    let d = dx < 0 ? 1 : -1; if (AR()) d = -d;
    const [a, pas] = PAS[S.vue], b = document.createElement('button');
    b.dataset.a = a; b.dataset.d = String(d * pas); b.hidden = true; $app.appendChild(b); b.click(); b.remove();
    const c = $app.querySelector('.contenu');
    if (c) { c.classList.remove('glisse-suiv', 'glisse-prec'); void c.offsetWidth; c.classList.add((dx < 0) ? 'glisse-suiv' : 'glisse-prec'); }
    try { navigator.vibrate && navigator.vibrate(8); } catch (err) {}
  };
  $app.addEventListener('touchend', fin, { passive: true });
  $app.addEventListener('touchcancel', () => { actif = false; const c = $app.querySelector('.contenu'); if (c) { c.style.transform = ''; c.style.opacity = ''; } }, { passive: true });
})();

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a, v = b.dataset.v, j = b.dataset.j ? +b.dataset.j : null, d = b.dataset.d ? +b.dataset.d : 0;
  switch (a) {
    case 'vue': S.vue = v; break;
    case 'avFiltre': S.avFiltre = v; break;
    case 'acFiltre': S.acFiltre = v; break;
    case 'aujourdhui': S.sel = aujCivil(); break;
    case 'choisir': S.sel = j; break;
    case 'decaler': S.sel += d; break;
    case 'moisDecal': { if (CP()) { const c = jdnVersCopte(S.sel); let mo = c.mois + d, an = c.an; if (mo < 1) { mo = 13; an--; } if (mo > 13) { mo = 1; an++; } const a = jdnVersCopte(aujCivil()); S.sel = a.an === an && a.mois === mo ? aujCivil() : copteVersJdn(an, mo, 1); break; } const g = jdnVersGreg(S.sel); let m = g.m + d, y = g.y; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } const auj = jdnVersGreg(aujCivil()); S.sel = auj.y === y && auj.m === m ? aujCivil() : gregVersJdn(y, m, 1); break; }
    case 'anneeDecal': { if (CP()) { const c = jdnVersCopte(S.sel); S.sel = copteVersJdn(c.an + d, Math.min(c.mois, 12), 1); break; } const g = jdnVersGreg(S.sel); S.sel = gregVersJdn(g.y + d, Math.min(g.m, 12), 1); break; }
    case 'ouvrirMois': S.sel = j; S.vue = 'mois'; break;
    case 'voirJour': S.sel = j; S.vue = 'jour'; break;
    case 'ouvrir': ouvrir(v); return;
    case 'fermer': S.vue = S.retour || 'mois'; S.confirmerEffacer = false; break;
    case 'ouvrirRite': S.riteSel = v; S.riteGroupe = RITES.find((r) => r.id === v).groupe; ouvrir('rites'); return;
    case 'choisirRite': S.riteSel = v; break;
    case 'allerRepere': { const el = document.getElementById(v); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    case 'riteGroupe': S.riteGroupe = v; S.riteSel = null; break;
    case 'suggestion': S.q = v; break;
    case 'viderQ': S.q = ''; break;
    case 'nouvelEvt': { const g = jdnVersGreg(S.sel); S.evt = { titre: '', type: 0, date: `${g.y}-${String(g.m).padStart(2, '0')}-${String(g.d).padStart(2, '0')}`, debut: '09:00', fin: '10:00', lieu: P.paroisse.idx, rep: 'aucune', rappel: 'aucun' }; ouvrir('evenement'); return; }
    case 'evtType': S.evt.type = +v; break;
    case 'enregistrerEvt': { const e = S.evt; const [y, m, dd] = e.date.split('-').map(Number); P.evenements.push({ id: 'e' + Date.now(), titre: e.titre.trim() || T[AR() ? 'ar' : 'fr'].types[e.type], type: e.type, jdn: gregVersJdn(y, m, dd), debut: e.debut, fin: e.fin, lieu: e.lieu, rep: e.rep, rappel: e.rappel }); sauver(); S.sel = gregVersJdn(y, m, dd); S.vue = 'jour'; break; }
    case 'supprEvt': P.evenements = P.evenements.filter((e) => e.id !== b.dataset.id); sauver(); break;
    case 'bascule': basculer(b.dataset.c); break;
    case 'segment': { const c = b.dataset.c; R()[c] = c === 'taille' ? +v : v; sauver(); appliquerApparence(); break; }
    case 'allerPatron': { if (P.paroisse.patrons[+b.dataset.i]) { S.saint = +b.dataset.i; if (S.vue !== 'saint') S.retour = S.vue; S.vue = 'saint'; } break; }
    case 'saut': { const el = document.getElementById(b.dataset.v); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    case 'supprPatron': P.paroisse.patrons.splice(+b.dataset.i, 1); sauver(); break;
    case 'ajoutPatron': P.paroisse.patrons.push({ nom: '', jour: 1, mois: 1 }); sauver(); break;
    case 'exporter': exporterCalendrier(); return;
    case 'demanderEffacer': S.confirmerEffacer = true; break;
    case 'annulerEffacer': S.confirmerEffacer = false; break;
    case 'effacerTout': P = JSON.parse(JSON.stringify(DEFAUT)); S.confirmerEffacer = false; sauver(); appliquerApparence(); break;
    default: return;
  }
  rendre();
});
function basculer(c) {
  const r = R();
  if (c.startsWith('cal-')) r.calques[c.slice(4)] = !r.calques[c.slice(4)];
  else if (c.startsWith('rap-')) r.rappels[c.slice(4)] = !r.rappels[c.slice(4)];
  else if (c === 'par-cal') P.paroisse.cal = !P.paroisse.cal;
  else if (c === 'par-rappel') P.paroisse.rappel = !P.paroisse.rappel;
  else r[c] = !r[c];
  sauver(); appliquerApparence();
}
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'q') { S.q = el.value; rendre(true); return; }
  const c = el.dataset.c;
  if (!c) return;
  if (c === 'evt-titre') { S.evt.titre = el.value; return; }
  if (c === 'pat-nom') { P.paroisse.patrons[+el.dataset.i].nom = el.value; sauver(); return; }
});
document.addEventListener('change', (ev) => {
  const el = ev.target, c = el.dataset.c;
  if (!c) return;
  if (c.startsWith('evt-')) { const k = c.slice(4); S.evt[k] = k === 'lieu' ? +el.value : el.value; if (k === 'titre') return; }
  else if (c === 'par-idx') { P.paroisse.idx = +el.value; P.paroisse.patrons = patronsDe(+el.value); sauver(); }
  else if (c === 'pat-jour') { P.paroisse.patrons[+el.dataset.i].jour = +el.value; sauver(); }
  else if (c === 'pat-mois') { const pt = P.paroisse.patrons[+el.dataset.i]; pt.mois = +el.value; pt.jour = Math.min(pt.jour, pt.mois === 13 ? 6 : 30); sauver(); }
  else if (c === 'pat-nom') { P.paroisse.patrons[+el.dataset.i].nom = el.value; sauver(); }
  else if (c === 'ville') { R().ville = el.value; sauver(); }
  rendre();
});
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (VUES[h] && h !== S.vue && !['evenement', 'paroisse'].includes(h)) { S.vue = h; rendre(); } });
if (window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (R().theme === 'auto') appliquerApparence(); }); } catch (e) {} }

// Bascule automatique au coucher du soleil et passage à minuit
let jourAffiche = aujCivil(), veilleAffichee = etatLiturgique().veille;
setInterval(() => {
  const j = aujCivil(), v = etatLiturgique().veille;
  if (j !== jourAffiche || v !== veilleAffichee) { if (S.sel === jourAffiche) S.sel = j; jourAffiche = j; veilleAffichee = v; rendre(); }
}, 60000);

// ------------------------------------------------------------- démarrage
chargerLocal();
const h0 = location.hash.slice(1);
if (['jour', 'semaine', 'mois', 'annee', 'avenir', 'actus', 'recherche', 'rites', 'reglages'].includes(h0)) S.vue = h0;
appliquerApparence();
fixerDatesPatrons();
rendre();
chargerActus();
brancherCompte();

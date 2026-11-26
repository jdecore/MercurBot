import { useState, type ChangeEvent } from 'react';
import { Mascota } from '../../shared/ui/Mascota';
import type { MascotaMood } from '../../entities/robot/types';

type Lang = 'en' | 'es' | 'jp';

interface CustomerRow {
  id: string;
  risk: string;
  eqpdays: string;
  usageDrop: string;
}

const DEFAULT_CUSTOMERS: CustomerRow[] = [
  { id: '1000001', risk: '82%', eqpdays: '361', usageDrop: '-42%' },
  { id: '1000412', risk: '76%', eqpdays: '490', usageDrop: '-38%' },
  { id: '1000895', risk: '71%', eqpdays: '412', usageDrop: '-31%' },
];

const I18N: Record<Lang, {
  subtitle: string;
  uploadLabel: string;
  robotIntro: string;
  step1: string;
  step2: string;
  pokaTitle: string;
  pokaDesc: string;
  msg: string;
  send: string;
  skip: string;
  ready: string;
  sent: string;
  skipped: string;
  loadedCsv: string;
  planTitle: string;
  planSteps: { phase: string; desc: string }[];
  risksTitle: string;
  risks: { risk: string; mitigation: string }[];
}> = {
  en: {
    subtitle: 'Telecom Retention AI • Poka-Yoke + Omotenashi',
    uploadLabel: 'Upload Scored CSV',
    robotIntro: 'Ready to analyze Company A churn risk. Select a customer or upload your scored CSV.',
    step1: '1. Top 20% Risk Queue (Model Output)',
    step2: '2. Opt-in WhatsApp Outreach',
    pokaTitle: 'Poka-Yoke Filter:',
    pokaDesc: 'Passed (Top 20% Risk + Usage Drop). Eligible for soft opt-in outreach.',
    msg: 'Hello! We noticed your recent usage changed. As a valued customer, reply YES to activate a 10% micro-recharge bonus this week.',
    send: 'Send Opt-in Offer',
    skip: 'Skip (Control Group)',
    ready: 'Status: Ready for pilot dispatch.',
    sent: 'Opt-in offer sent to Customer ',
    skipped: 'Assigned to A/B Control Group for Customer ',
    loadedCsv: 'Loaded CSV rows into RetainBot: ',
    planTitle: '3. Detailed Implementation Plan (Next Steps)',
    planSteps: [
      { phase: 'Month 1 — Scoring & Genba', desc: 'Batch score customers with LightGBM + Poka-Yoke filter; validate pain points with field interviews.' },
      { phase: 'Months 2–3 — Kaizen A/B Pilot', desc: 'Test 1,000 flagged customers (opt-in WhatsApp offer) vs. 1,000 control group.' },
      { phase: 'Month 4 — ROI Gate & Scale', desc: 'Evaluate win-back rate vs. break-even; scale if net lift is positive and retrain quarterly.' },
    ],
    risksTitle: '4. Potential Risks & Mitigations',
    risks: [
      { risk: 'Paying offers to loyal customers', mitigation: 'Poka-Yoke double filter (Top 20% risk + usage drop).' },
      { risk: 'Seasonality drift', mitigation: 'Automated quarterly retraining on recent usage data.' },
      { risk: 'False positives / annoyance', mitigation: 'Soft opt-in WhatsApp message; customer can decline.' },
      { risk: 'Data privacy', mitigation: 'Anonymized Customer_IDs only; no PII stored.' },
    ],
  },
  es: {
    subtitle: 'IA de Retención Telecom • Poka-Yoke + Omotenashi',
    uploadLabel: 'Subir CSV con Riesgo',
    robotIntro: 'Listo para analizar el churn de Company A. Selecciona un cliente o sube tu CSV.',
    step1: '1. Cola Top 20% Riesgo (Salida del Modelo)',
    step2: '2. Envío Opt-in por WhatsApp',
    pokaTitle: 'Filtro Poka-Yoke:',
    pokaDesc: 'Aprobado (Top 20% Riesgo + Caída de uso). Apto para oferta suave.',
    msg: '¡Hola! Notamos un cambio en tu uso reciente. Responde SÍ para activar un bono de 10% en tu próxima recarga.',
    send: 'Enviar Oferta Opt-in',
    skip: 'Omitir (Grupo Control)',
    ready: 'Estado: Listo para envío del piloto.',
    sent: 'Oferta opt-in enviada al Cliente ',
    skipped: 'Asignado a Grupo Control A/B para Cliente ',
    loadedCsv: 'Filas CSV cargadas en RetainBot: ',
    planTitle: '3. Plan de Implementación Detallado (Next Steps)',
    planSteps: [
      { phase: 'Mes 1 — Scoring y Genba', desc: 'Scoring mensual con LightGBM + filtro Poka-Yoke; validación cualitativa en campo.' },
      { phase: 'Meses 2–3 — Piloto Kaizen A/B', desc: '1,000 clientes en riesgo (oferta opt-in por WhatsApp) vs. 1,000 grupo control.' },
      { phase: 'Mes 4 — Evaluación y Escala', desc: 'Medir tasa de retención vs. punto de equilibrio; escalar y reentrenar cada trimestre.' },
    ],
    risksTitle: '4. Riesgos Potenciales y Mitigación',
    risks: [
      { risk: 'Dar ofertas a clientes leales', mitigation: 'Doble filtro Poka-Yoke (Top 20% riesgo + caída de uso).' },
      { risk: 'Estacionalidad', mitigation: 'Reentrenamiento trimestral automático con datos recientes.' },
      { risk: 'Falsos positivos', mitigation: 'Mensaje opt-in suave; el cliente decide si acepta.' },
      { risk: 'Privacidad de datos', mitigation: 'Solo Customer_ID anonimizado; sin datos personales.' },
    ],
  },
  jp: {
    subtitle: '通信リテンションAI • ポカヨケ + おもてなし',
    uploadLabel: '予測CSVをアップロード',
    robotIntro: 'Company Aの解約リスク分析の準備が完了しました。顧客を選択するかCSVをアップロードしてください。',
    step1: '1. リスク上位20%顧客（モデル出力）',
    step2: '2. オプトインWhatsApp配信',
    pokaTitle: 'ポカヨケ判定:',
    pokaDesc: '通過（リスク上位20% + 利用減少）。事前オファー対象。',
    msg: 'いつもご利用ありがとうございます。YESと返信すると、今週の少額チャージ10%ボーナスが有効になります。',
    send: 'オファーを送信',
    skip: 'スキップ（対照群）',
    ready: 'ステータス: パイロット配信準備完了',
    sent: 'オファー送信済み — 顧客ID ',
    skipped: 'A/B対照群に割当 — 顧客ID ',
    loadedCsv: 'CSVデータを読み込みました: ',
    planTitle: '3. 詳細導入計画（Next Steps）',
    planSteps: [
      { phase: '1ヶ月目 — スコアリング & 現場検証', desc: 'LightGBM + ポカヨケ判定で対象抽出し、顧客ヒアリングを実施。' },
      { phase: '2〜3ヶ月目 — カイゼンA/Bパイロット', desc: '対象1,000名（WhatsAppオファー）と対照群1,000名で効果検証。' },
      { phase: '4ヶ月目 — ROI評価 & 展開', desc: '損益分岐点を超える場合のみ全体展開し、四半期ごとに再学習。' },
    ],
    risksTitle: '4. 想定リスクと対策',
    risks: [
      { risk: '継続顧客への過剰オファー', mitigation: 'ポカヨケ二重フィルタ（上位20% + 利用減少）。' },
      { risk: '季節性による精度低下', mitigation: '四半期ごとの自動再学習を実施。' },
      { risk: '誤検知による顧客離反', mitigation: 'オプトイン型のソフトな提案のみ実施。' },
      { risk: 'プライバシー保護', mitigation: '匿名化IDのみ使用し、個人情報は保持しない。' },
    ],
  },
};

export function RetainBotPanel() {
  const [lang, setLang] = useState<Lang>('en');
  const [customers, setCustomers] = useState<CustomerRow[]>(DEFAULT_CUSTOMERS);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_CUSTOMERS[0].id);
  const [statusText, setStatusText] = useState<string>(I18N.en.robotIntro);
  const [mood, setMood] = useState<MascotaMood>('neutro');
  const t = I18N[lang];

  const handleCsvUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMood('pensando');
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idIdx = headers.findIndex((h) => h.includes('customer_id') || h === 'id');
    const eqpIdx = headers.findIndex((h) => h.includes('eqpdays'));
    const riskIdx = headers.findIndex((h) => h.includes('risk') || h.includes('prob') || h.includes('churn'));
    const parsed: CustomerRow[] = lines.slice(1, 6).map((line, i) => {
      const cols = line.split(',');
      return {
        id: idIdx >= 0 && cols[idIdx] ? cols[idIdx].trim() : `ROW-${i + 1}`,
        risk: riskIdx >= 0 && cols[riskIdx] ? cols[riskIdx].trim() : 'Top 20%',
        eqpdays: eqpIdx >= 0 && cols[eqpIdx] ? cols[eqpIdx].trim() : '-',
        usageDrop: 'Filtered',
      };
    });
    if (parsed.length > 0) {
      setCustomers(parsed);
      setSelectedId(parsed[0].id);
      setStatusText(`${t.loadedCsv}${parsed.length}`);
      setMood('feliz');
    }
  };

  return (
    <div style={{ background: '#FFFFFF', color: '#1A2A4A', minHeight: '100vh', width: '100%', boxSizing: 'border-box', padding: '24px 36px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #E8EAF0', paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="/retainbot_logo.jpg" alt="RetainBot Logo" style={{ height: '48px', width: 'auto', objectFit: 'contain', borderRadius: '8px' }} />
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>RetainBot</h1>
            <span style={{ fontSize: '12px', color: '#5A6780' }}>{t.subtitle}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, padding: '7px 12px', border: '1px solid #E8EAF0', borderRadius: '6px', cursor: 'pointer', background: '#F7F9FC', color: '#1A2A4A' }}>
            {t.uploadLabel}
            <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['en', 'es', 'jp'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => { setLang(l); setStatusText(I18N[l].robotIntro); setMood('neutro'); }}
                style={{
                  border: `1px solid ${lang === l ? '#1A2A4A' : '#E8EAF0'}`,
                  background: lang === l ? '#1A2A4A' : '#FFFFFF',
                  color: lang === l ? '#FFFFFF' : '#1A2A4A',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                {l === 'jp' ? '日本語' : l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px 20px', border: '1px solid #E8EAF0', borderRadius: '10px', background: '#F7F9FC', marginBottom: '24px' }}>
        <div style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
          <Mascota mood={mood} />
        </div>
        <div style={{ fontSize: '14px', lineHeight: 1.5, color: '#1A2A4A', fontWeight: 500 }}>
          {statusText}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <section style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '20px', background: '#FFFFFF' }}>
          <h2 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5A6780', marginBottom: '14px' }}>{t.step1}</h2>
          {customers.map((c) => {
            const isSelected = c.id === selectedId;
            return (
              <div
                key={c.id}
                onClick={() => { setSelectedId(c.id); setStatusText(t.ready); setMood('neutro'); }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  border: `1px solid ${isSelected ? '#1A2A4A' : '#E8EAF0'}`,
                  borderRadius: '8px',
                  marginBottom: '10px',
                  cursor: 'pointer',
                  background: isSelected ? '#F7F9FC' : '#FFFFFF',
                }}
              >
                <div>
                  <strong>ID: {c.id}</strong>
                  <div style={{ fontSize: '12px', color: '#5A6780' }}>eqpdays: {c.eqpdays} • mou: {c.usageDrop}</div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: '#FDECE8', color: '#C73E1D' }}>
                  Risk: {c.risk}
                </span>
              </div>
            );
          })}
          <div style={{ marginTop: '14px', padding: '12px', borderLeft: '3px solid #1A2A4A', background: '#F7F9FC', fontSize: '13px', lineHeight: 1.5 }}>
            <strong>{t.pokaTitle}</strong> {t.pokaDesc}
          </div>
        </section>

        <section style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '20px', background: '#FFFFFF' }}>
          <h2 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5A6780', marginBottom: '14px' }}>{t.step2}</h2>
          <div style={{ border: '1px solid #E8EAF0', borderRadius: '8px', padding: '16px', background: '#FAFBFD', minHeight: '140px', fontSize: '14px', lineHeight: 1.5, marginBottom: '14px' }}>
            {t.msg}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { setStatusText(`${t.sent}${selectedId}`); setMood('feliz'); }}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px', background: '#C73E1D', color: '#FFFFFF' }}
            >
              {t.send}
            </button>
            <button
              onClick={() => { setStatusText(`${t.skipped}${selectedId}`); setMood('neutro'); }}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px', background: '#E8EAF0', color: '#1A2A4A' }}
            >
              {t.skip}
            </button>
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <section style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '20px', background: '#F7F9FC' }}>
          <h2 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5A6780', marginBottom: '14px' }}>{t.planTitle}</h2>
          {t.planSteps.map((s) => (
            <div key={s.phase} style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2A4A' }}>{s.phase}</div>
              <div style={{ fontSize: '13px', color: '#5A6780', lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          ))}
        </section>

        <section style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '20px', background: '#F7F9FC' }}>
          <h2 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5A6780', marginBottom: '14px' }}>{t.risksTitle}</h2>
          {t.risks.map((r) => (
            <div key={r.risk} style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#C73E1D' }}>{r.risk}</div>
              <div style={{ fontSize: '13px', color: '#5A6780', lineHeight: 1.4 }}>{r.mitigation}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

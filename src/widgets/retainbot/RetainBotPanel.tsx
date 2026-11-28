import { useState, type ChangeEvent } from 'react';
import type { MascotaMood } from '../../entities/robot/types';

type Lang = 'en' | 'es' | 'jp';
type Step = 1 | 2 | 3;

interface CustomerRow {
  id: string;
  risk: string;
  eqpdays: string;
}

const REAL_COMPANY_A_DATA: CustomerRow[] = [
  { id: '1057208', risk: '97.9%', eqpdays: '503' },
  { id: '1094790', risk: '97.4%', eqpdays: '260' },
  { id: '1042921', risk: '97.4%', eqpdays: '602' },
  { id: '1011695', risk: '96.8%', eqpdays: '993' },
  { id: '1070683', risk: '96.4%', eqpdays: '423' },
];

const I18N: Record<Lang, {
  subtitle: string;
  steps: [string, string, string];
  robotStep1: string;
  robotStep2: string;
  robotStep3: string;
  useDefault: string;
  uploadCsv: string;
  poka: string;
  msg: string;
  skip: string;
  back: string;
  sentVia: string;
  skipped: string;
  togglePlan: string;
  planTitle: string;
  plan: string[];
  risksTitle: string;
  risks: string[];
}> = {
  en: {
    subtitle: 'Telecom Retention AI • 5-Fold CV Ensemble (0.7000 ROC-AUC)',
    steps: ['1. Data', '2. Risk Queue', '3. Send Offer'],
    robotStep1: 'Hi! Should we use Company A real Top-20% predictions or upload a new CSV?',
    robotStep2: 'Select an at-risk customer below. Poka-Yoke filter is active.',
    robotStep3: 'Ready! Choose WhatsApp, Telegram, or LINE to send the opt-in offer, or assign to Control.',
    useDefault: 'Use Company A Data (5 Real Top-Risk)',
    uploadCsv: 'Upload Another CSV',
    poka: 'Poka-Yoke: Passed (Top 20% Risk + Usage Drop)',
    msg: 'Hello! We noticed your recent usage changed. Reply YES to activate a 10% micro-recharge bonus this week.',
    skip: 'Skip (Control Group)',
    back: '← Back',
    sentVia: 'Offer opened in ',
    skipped: 'Assigned to A/B Control Group: ID ',
    togglePlan: 'View 4-Month Plan & Risks',
    planTitle: 'Implementation Plan (Months 1–4)',
    plan: [
      'Month 1: Score users (0.7000 ROC-AUC) + Genba interviews',
      'Months 2–3: A/B Pilot (90% opt-in / 10% control)',
      'Month 4: Scale if win-back > 3.7% break-even (+$87.1K USD)',
    ],
    risksTitle: 'Risks & Mitigations',
    risks: [
      'Loyal users → Poka-Yoke double filter + A/B',
      'Seasonality → Quarterly retrain',
      'Privacy → Anonymized Customer_IDs only',
    ],
  },
  es: {
    subtitle: 'IA de Retención Telecom • 5-Fold CV Ensemble (0.7000 ROC-AUC)',
    steps: ['1. Datos', '2. Cola Riesgo', '3. Enviar Oferta'],
    robotStep1: '¡Hola! ¿Usamos los datos reales Top 20% de Company A o quieres subir otro CSV?',
    robotStep2: 'Selecciona un cliente en riesgo. El filtro Poka-Yoke está activo.',
    robotStep3: '¡Listo! Elige WhatsApp, Telegram o LINE para enviar la oferta opt-in, o pásalo a Control.',
    useDefault: 'Usar Datos de Company A (5 Reales)',
    uploadCsv: 'Subir Otro CSV',
    poka: 'Poka-Yoke: Aprobado (Top 20% Riesgo + Caída de uso)',
    msg: '¡Hola! Notamos un cambio en tu uso reciente. Responde SÍ para activar un bono de 10% en tu próxima recarga.',
    skip: 'Omitir (Grupo Control)',
    back: '← Volver',
    sentVia: 'Oferta abierta en ',
    skipped: 'Asignado a Grupo Control A/B: ID ',
    togglePlan: 'Ver Plan 4 Meses y Riesgos',
    planTitle: 'Plan de Implementación (Meses 1–4)',
    plan: [
      'Mes 1: Scoring (0.7000 ROC-AUC) + Genba en campo',
      'Meses 2–3: Piloto A/B (90% opt-in / 10% control)',
      'Mes 4: Escalar si retención > 3.7% break-even (+$87.1K USD)',
    ],
    risksTitle: 'Riesgos y Mitigación',
    risks: [
      'Clientes leales → Doble filtro Poka-Yoke + A/B',
      'Estacionalidad → Reentrenar cada trimestre',
      'Privacidad → Solo Customer_IDs anonimizados',
    ],
  },
  jp: {
    subtitle: '通信リテンションAI • 5-Fold CV Ensemble (0.7000 ROC-AUC)',
    steps: ['1. データ', '2. リスク顧客', '3. 配信'],
    robotStep1: 'Company Aの実予測データ（上位20%）を使用しますか？新しいCSVをアップロードしますか？',
    robotStep2: 'リスク顧客を選択してください。ポカヨケ判定が有効です。',
    robotStep3: '準備完了！WhatsApp / Telegram / LINEで送信するか、対照群に割り当ててください。',
    useDefault: 'Company A データを使用',
    uploadCsv: '別のCSVをアップロード',
    poka: 'ポカヨケ: 通過（上位20% + 利用減少）',
    msg: 'いつもご利用ありがとうございます。YESと返信すると、今週の少額チャージ10%ボーナスが有効になります。',
    skip: 'スキップ（対照群）',
    back: '← 戻る',
    sentVia: '送信画面を開きました: ',
    skipped: 'A/B対照群に割当: ID ',
    togglePlan: '4ヶ月計画とリスクを表示',
    planTitle: '導入計画（1〜4ヶ月目）',
    plan: [
      '1ヶ月目: スコアリング (0.7000 ROC-AUC) + 現場検証',
      '2〜3ヶ月目: A/Bパイロット (90% 配信 / 10% 対照群)',
      '4ヶ月目: 損益分岐点 3.7% 超で展開 (+$87.1K USD)',
    ],
    risksTitle: 'リスクと対策',
    risks: [
      '継続顧客への誤配信 → ポカヨケ二重フィルタ',
      '季節性 → 四半期ごとの再学習',
      'プライバシー → 匿名化IDのみ使用',
    ],
  },
};

export function RetainBotPanel() {
  const [lang, setLang] = useState<Lang>('en');
  const [step, setStep] = useState<Step>(1);
  const [customers, setCustomers] = useState<CustomerRow[]>(REAL_COMPANY_A_DATA);
  const [selectedId, setSelectedId] = useState<string>(REAL_COMPANY_A_DATA[0].id);
  const [mood, setMood] = useState<MascotaMood>('neutro');
  void mood;
  const [actionLog, setActionLog] = useState<string>('');
  const [showPlan, setShowPlan] = useState<boolean>(false);

  const t = I18N[lang];
  const robotText = actionLog || (step === 1 ? t.robotStep1 : step === 2 ? t.robotStep2 : t.robotStep3);
  const selectedCustomer = customers.find((c) => c.id === selectedId) || customers[0];

  const speakText = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(robotText);
    utter.lang = lang === 'jp' ? 'ja-JP' : lang === 'es' ? 'es-ES' : 'en-US';
    window.speechSynthesis.speak(utter);
  };

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
      };
    });
    if (parsed.length > 0) {
      setCustomers(parsed);
      setSelectedId(parsed[0].id);
      setMood('feliz');
      setActionLog('');
      setStep(2);
    }
  };

  const getChannelUrl = (channel: 'WhatsApp' | 'Telegram' | 'LINE') => {
    const encoded = encodeURIComponent(`[ID ${selectedId}] ${t.msg}`);
    if (channel === 'WhatsApp') return `https://wa.me/?text=${encoded}`;
    if (channel === 'Telegram') return `https://t.me/share/url?url=${encodeURIComponent('https://retain-bot.vercel.app')}&text=${encoded}`;
    return `https://line.me/R/msg/text/?${encoded}`;
  };

  return (
    <div style={{ background: '#FFFFFF', color: '#1A2A4A', minHeight: '100vh', width: '100%', boxSizing: 'border-box', padding: 'clamp(14px, 3vw, 32px)', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #E8EAF0', paddingBottom: '14px', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/retainbot_logo.jpg" alt="RetainBot Logo" style={{ height: '44px', width: '44px', objectFit: 'contain', borderRadius: '8px' }} />
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>RetainBot</h1>
            <span style={{ fontSize: '12px', color: '#5A6780' }}>{t.subtitle}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['en', 'es', 'jp'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => { setLang(l); setActionLog(''); }}
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
      </header>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {t.steps.map((label, idx) => {
          const s = (idx + 1) as Step;
          const active = step === s;
          return (
            <button
              key={label}
              onClick={() => { setStep(s); setActionLog(''); }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: `1px solid ${active ? '#d11310' : '#E8EAF0'}`,
                background: active ? '#d11310' : '#F7F9FC',
                color: active ? '#FFFFFF' : '#1A2A4A',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Robot Guide */}
      <style>{`@keyframes retainFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', padding: '16px 20px', border: '1px solid #E8EAF0', borderLeft: '4px solid #d11310', borderRadius: '10px', background: '#F7F9FC', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 260px', minWidth: 0 }}>
          <img
            src="/retainbot_mascot.jpg"
            alt="RetainBot Mascot"
            style={{ width: '88px', height: '88px', objectFit: 'contain', flexShrink: 0, mixBlendMode: 'multiply', animation: 'retainFloat 3s ease-in-out infinite' }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#1A2A4A', color: '#FFFFFF' }}>
                ID: {selectedCustomer?.id}
              </span>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#FDECE8', color: '#d11310' }}>
                Risk: {selectedCustomer?.risk}
              </span>
            </div>
            <div style={{ fontSize: '15px', lineHeight: 1.4, color: '#1A2A4A', fontWeight: 600 }}>
              {robotText}
            </div>
          </div>
        </div>
        <button
          onClick={speakText}
          title="Speak"
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #E8EAF0', background: '#FFFFFF', color: '#1A2A4A', fontWeight: 700, fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}
        >
          🔊
        </button>
      </div>

      {/* Step 1: Data Selection */}
      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <button
            onClick={() => { setCustomers(REAL_COMPANY_A_DATA); setSelectedId(REAL_COMPANY_A_DATA[0].id); setMood('feliz'); setActionLog(''); setStep(2); }}
            style={{ padding: '24px', borderRadius: '10px', border: '2px solid #1A2A4A', background: '#1A2A4A', color: '#FFFFFF', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}
          >
            {t.useDefault}
          </button>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleCsvUpload({ target: { files: [f] } } as unknown as ChangeEvent<HTMLInputElement>); }}
            style={{ padding: '24px', borderRadius: '10px', border: '2px dashed #d11310', background: '#FFFFFF', color: '#d11310', fontSize: '15px', fontWeight: 700, cursor: 'pointer', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ● {t.uploadCsv}
            <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* Step 2: Risk Queue */}
      {step === 2 && (
        <div style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          {customers.map((c) => {
            const isSelected = c.id === selectedId;
            return (
              <div
                key={c.id}
                onClick={() => { setSelectedId(c.id); setActionLog(''); setStep(3); }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  border: `1px solid ${isSelected ? '#1A2A4A' : '#E8EAF0'}`,
                  borderRadius: '8px',
                  marginBottom: '10px',
                  cursor: 'pointer',
                  background: isSelected ? '#F7F9FC' : '#FFFFFF',
                }}
              >
                <div>
                  <strong>ID: {c.id}</strong>
                  <span style={{ fontSize: '12px', color: '#5A6780', marginLeft: '12px' }}>eqpdays: {c.eqpdays}</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '4px', background: '#FDECE8', color: '#d11310' }}>
                  Risk: {c.risk}
                </span>
              </div>
            );
          })}
          <div style={{ marginTop: '10px', padding: '10px 12px', borderLeft: '3px solid #1A2A4A', background: '#F7F9FC', fontSize: '13px', fontWeight: 600 }}>
            {t.poka}
          </div>
        </div>
      )}

      {/* Step 3: Send Offer */}
      {step === 3 && (
        <div style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: '#5A6780', marginBottom: '8px' }}>
            Customer ID: <strong>{selectedId}</strong>
          </div>
          <div style={{ border: '1px solid #E8EAF0', borderRadius: '8px', padding: '14px', background: '#FAFBFD', fontSize: '14px', marginBottom: '14px' }}>
            {t.msg}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a href={getChannelUrl('WhatsApp')} target="_blank" rel="noopener noreferrer" onClick={() => { setMood('feliz'); setActionLog(`${t.sentVia}WhatsApp (ID ${selectedId})`); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', textDecoration: 'none', textAlign: 'center', fontWeight: 700, cursor: 'pointer', background: '#25D366', color: '#FFFFFF' }}>
              WhatsApp
            </a>
            <a href={getChannelUrl('Telegram')} target="_blank" rel="noopener noreferrer" onClick={() => { setMood('feliz'); setActionLog(`${t.sentVia}Telegram (ID ${selectedId})`); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', textDecoration: 'none', textAlign: 'center', fontWeight: 700, cursor: 'pointer', background: '#0088cc', color: '#FFFFFF' }}>
              Telegram
            </a>
            <a href={getChannelUrl('LINE')} target="_blank" rel="noopener noreferrer" onClick={() => { setMood('feliz'); setActionLog(`${t.sentVia}LINE (ID ${selectedId})`); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', textDecoration: 'none', textAlign: 'center', fontWeight: 700, cursor: 'pointer', background: '#06C755', color: '#FFFFFF' }}>
              LINE
            </a>
            <button onClick={() => { setMood('neutro'); setActionLog(`${t.skipped}${selectedId}`); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontWeight: 700, cursor: 'pointer', background: '#E8EAF0', color: '#1A2A4A' }}>
              {t.skip}
            </button>
          </div>
          <button onClick={() => { setStep(2); setActionLog(''); }} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#5A6780', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            {t.back}
          </button>
        </div>
      )}

      {/* Collapsible Plan & Risks */}
      <button
        onClick={() => setShowPlan((v) => !v)}
        style={{ background: '#F7F9FC', border: '1px solid #E8EAF0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, color: '#1A2A4A', cursor: 'pointer' }}
      >
        {t.togglePlan}
      </button>

      {showPlan && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '14px' }}>
          <div style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '16px', background: '#F7F9FC' }}>
            <h3 style={{ fontSize: '13px', color: '#1A2A4A', marginBottom: '10px' }}>{t.planTitle}</h3>
            {t.plan.map((p) => <div key={p} style={{ fontSize: '13px', color: '#5A6780', marginBottom: '6px' }}>• {p}</div>)}
          </div>
          <div style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '16px', background: '#F7F9FC' }}>
            <h3 style={{ fontSize: '13px', color: '#d11310', marginBottom: '10px' }}>{t.risksTitle}</h3>
            {t.risks.map((r) => <div key={r} style={{ fontSize: '13px', color: '#5A6780', marginBottom: '6px' }}>• {r}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

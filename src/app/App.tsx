import { useState } from 'react';

type Lang = 'en' | 'es' | 'jp';

interface Customer {
  id: string;
  risk: string;
  eqpdays: number;
  usageDrop: string;
}

const CUSTOMERS: Customer[] = [
  { id: '1000001', risk: '82%', eqpdays: 361, usageDrop: '-42%' },
  { id: '1000412', risk: '76%', eqpdays: 490, usageDrop: '-38%' },
  { id: '1000895', risk: '71%', eqpdays: 412, usageDrop: '-31%' },
];

const I18N: Record<Lang, {
  subtitle: string;
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
}> = {
  en: {
    subtitle: 'Telecom Retention MVP • Poka-Yoke + Omotenashi',
    step1: '1. Top 20% Risk Queue (Model Output)',
    step2: '2. Opt-in WhatsApp Outreach',
    pokaTitle: 'Poka-Yoke Filter:',
    pokaDesc: 'Passed (Top 20% Risk + Usage Drop). Eligible for soft opt-in outreach.',
    msg: 'Hello! We noticed your recent usage changed. As a valued customer, reply YES to activate a 10% micro-recharge bonus this week.',
    send: 'Send Opt-in Offer',
    skip: 'Skip (Control Group)',
    ready: 'Status: Ready for pilot dispatch.',
    sent: 'Logged: Opt-in offer sent to Customer ',
    skipped: 'Logged: Assigned to A/B Control Group for Customer ',
  },
  es: {
    subtitle: 'MVP de Retención Telecom • Poka-Yoke + Omotenashi',
    step1: '1. Cola Top 20% Riesgo (Salida del Modelo)',
    step2: '2. Envío Opt-in por WhatsApp',
    pokaTitle: 'Filtro Poka-Yoke:',
    pokaDesc: 'Aprobado (Top 20% Riesgo + Caída de uso). Apto para oferta suave.',
    msg: '¡Hola! Notamos un cambio en tu uso reciente. Responde SÍ para activar un bono de 10% en tu próxima recarga.',
    send: 'Enviar Oferta Opt-in',
    skip: 'Omitir (Grupo Control)',
    ready: 'Estado: Listo para envío del piloto.',
    sent: 'Registrado: Oferta opt-in enviada al Cliente ',
    skipped: 'Registrado: Asignado a Grupo Control A/B para Cliente ',
  },
  jp: {
    subtitle: '通信リテンションMVP • ポカヨケ + おもてなし',
    step1: '1. リスク上位20%顧客（モデル出力）',
    step2: '2. オプトインWhatsApp配信',
    pokaTitle: 'ポカヨケ判定:',
    pokaDesc: '通過（リスク上位20% + 利用減少）。事前オファー対象。',
    msg: 'いつもご利用ありがとうございます。YESと返信すると、今週の少額チャージ10%ボーナスが有効になります。',
    send: 'オファーを送信',
    skip: 'スキップ（対照群）',
    ready: 'ステータス: パイロット配信準備完了',
    sent: '記録完了: オファー送信済み — 顧客ID ',
    skipped: '記録完了: A/B対照群に割当 — 顧客ID ',
  },
};

export default function App() {
  const [lang, setLang] = useState<Lang>('en');
  const [selectedId, setSelectedId] = useState<string>(CUSTOMERS[0].id);
  const [statusText, setStatusText] = useState<string>(I18N.en.ready);

  const t = I18N[lang];

  const handleLangChange = (newLang: Lang) => {
    setLang(newLang);
    setStatusText(I18N[newLang].ready);
  };

  return (
    <div style={{ background: '#FFFFFF', color: '#1A2A4A', minHeight: '100vh', padding: '32px', maxWidth: '960px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #E8EAF0', paddingBottom: '16px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="/retainbot_logo.jpg" alt="RetainBot Logo" style={{ height: '48px', width: 'auto', objectFit: 'contain' }} />
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>RetainBot</h1>
            <span style={{ fontSize: '12px', color: '#5A6780' }}>{t.subtitle}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['en', 'es', 'jp'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => handleLangChange(l)}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <section style={{ border: '1px solid #E8EAF0', borderRadius: '10px', padding: '20px', background: '#FFFFFF' }}>
          <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5A6780', marginBottom: '14px' }}>{t.step1}</h2>
          {CUSTOMERS.map((c) => {
            const isSelected = c.id === selectedId;
            return (
              <div
                key={c.id}
                onClick={() => { setSelectedId(c.id); setStatusText(t.ready); }}
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
          <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5A6780', marginBottom: '14px' }}>{t.step2}</h2>
          <div style={{ border: '1px solid #E8EAF0', borderRadius: '8px', padding: '16px', background: '#FAFBFD', minHeight: '140px', fontSize: '14px', lineHeight: 1.5, marginBottom: '14px' }}>
            {t.msg}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setStatusText(`${t.sent}${selectedId}`)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px', background: '#C73E1D', color: '#FFFFFF' }}
            >
              {t.send}
            </button>
            <button
              onClick={() => setStatusText(`${t.skipped}${selectedId}`)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px', background: '#E8EAF0', color: '#1A2A4A' }}
            >
              {t.skip}
            </button>
          </div>
          <div style={{ marginTop: '14px', fontSize: '12px', color: '#5A6780' }}>{statusText}</div>
        </section>
      </div>
    </div>
  );
}

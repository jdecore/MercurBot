import * as ort from 'onnxruntime-web';
import { AutoTokenizer, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.localModelPath = '/home/juanxi/model-tests/killkli-laya/';

env.allowRemoteModels = false;
export const QTYPES = { choice: 0, score: 1, noul: 2 };

export function renderOptions(q) {
  const crit = q.criteria;
  if (q.type === 'choice') return Object.entries(crit).map(([k, v]) => (v ? `${k}: ${v}` : k));
  if (q.type === 'score') return crit.map((c, i) => `level ${i}: ${c}`);
  return [
    `false: ${crit?.false ?? 'no, the statement does not hold'}`,
    `true: ${crit?.true ?? 'yes, the statement holds'}`,
  ];
}

export function buildSequence(tok, state, q, maxLen = 1024, headMaxLen = 256) {
  const maskTok = tok.mask_token;
  const opts = renderOptions(q);
  const ins = String(q.instructions).replaceAll(maskTok, ' ');
  const enc = (s) => Array.from(tok(s, { add_special_tokens: false }).input_ids.data, Number);
  let headIds = enc(`${q.type} question: ${ins}`);
  let optIds = opts.map((o) => [Number(tok.mask_token_id), ...enc(` ${o.replaceAll(maskTok, ' ')}`).slice(0, 48)]);
  let optBudget = headMaxLen - optIds.reduce((a, o) => a + o.length, 0);
  if (optBudget < 16) {
    const per = Math.max(4, Math.floor((headMaxLen - 16) / Math.max(1, optIds.length)));
    optIds = optIds.map((o) => o.slice(0, per));
    optBudget = headMaxLen - optIds.reduce((a, o) => a + o.length, 0);
  }
  headIds = headIds.slice(0, Math.max(8, optBudget));
  const CLS = Number(tok.cls_token_id ?? tok.bos_token_id);
  const SEP = Number(tok.sep_token_id ?? tok.eos_token_id);
  let ids = [CLS, ...headIds, SEP];
  const markers = [];
  for (const o of optIds) {
    markers.push(ids.length);
    ids = ids.concat(o);
  }
  ids.push(SEP);
  const room = Math.max(0, maxLen - ids.length - 1);
  const st = enc(String(state).replaceAll(maskTok, ' ')).slice(0, room);
  ids = ids.concat(st, [SEP]);
  return { ids: ids.slice(0, maxLen), markers: markers.filter((m) => m < maxLen) };
}

export async function loadLaya(modelPath, tokenizerDir) {
  ort.env.wasm.numThreads = 4;
  const t = Date.now();
  const sess = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const tok = await AutoTokenizer.from_pretrained(tokenizerDir, { local_files_only: true });
  return { sess, tok, loadMs: Date.now() - t };
}

export async function ask(sess, seq, markers, qtype) {
  const n = seq.ids.length, k = markers.length;
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(seq.ids, (x) => BigInt(x)), [1, n]),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from({ length: n }, () => 1n), [1, n]),
    marker_pos: new ort.Tensor('int64', BigInt64Array.from(markers, (x) => BigInt(x)), [1, k]),
    marker_mask: new ort.Tensor('bool', new Uint8Array(k).fill(1), [1, k]),
    qtype: new ort.Tensor('int64', BigInt64Array.from([BigInt(qtype)]), [1]),
  };
  const t = Date.now();
  const out = await sess.run(feeds);
  const logits = Array.from(out.logits.data);
  const mx = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - mx));
  const sum = ex.reduce((a, b) => a + b, 0);
  return { probs: ex.map((e) => e / sum), ms: Date.now() - t };
}

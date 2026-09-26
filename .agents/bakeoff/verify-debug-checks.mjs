import { classifyIntent, classifyQuery } from '../../src/shared/lib/laya.ts'
let fails = 0
const t = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } else console.log('PASS', name) }
// F2 checks (debug.ts)
t('F2 literal', classifyQuery('¿en qué página está el artículo 3?').class === 'literal')
t('F2 semantic', classifyQuery('resume este documento').class === 'semantic')
// F4 checks (debug.ts)
let r = classifyIntent('¿en qué página está el artículo 3?')
t('F4a', r.action==='rag' && r.searchMode==='literal' && r.isPageRef===true)
r = classifyIntent('hola, ¿cómo estás?')
t('F4b', r.action==='direct' && r.isPageRef===false)
r = classifyIntent('resume este documento')
t('F4c', r.action==='rag' && r.searchMode==='semantic' && r.isSummary===true)
r = classifyIntent('haz un gráfico de las ventas')
t('F4d', r.action==='chart')
r = classifyIntent('¿qué noticias hay hoy?')
t('F4e', r.action==='web_search' && r.needsWeb===true)
console.log(fails ? `${fails} FAIL` : 'ALL PASS')
process.exit(fails)

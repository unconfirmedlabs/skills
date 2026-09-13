#!/usr/bin/env node
// Regenerate the public API discovery index from a pinned Effect source checkout.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [checkout, typescriptPath] = process.argv.slice(2)
if (!checkout) throw new Error('Usage: node build-coverage.mjs <effect-checkout> [typescript-package-path]')
const root = fs.realpathSync(checkout)
const require = createRequire(path.join(process.cwd(), 'package.json'))
const ts = require(typescriptPath ? path.resolve(typescriptPath) : 'typescript')
if (!ts.createProgram) throw new Error('Generation needs the TypeScript compiler API (tested with typescript@5.9.3).')
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(skill, 'references/generated')
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.name === 'node_modules' || e.name === '.git' ? [] :
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
const packages = walk(path.join(root, 'packages')).filter(p => p.endsWith('/package.json'))
  .map(file => ({ file, dir: path.dirname(file), json: JSON.parse(fs.readFileSync(file, 'utf8')) }))
  .filter(p => !p.json.private && p.json.exports && fs.existsSync(path.join(p.dir, 'src')))
const baseline = packages.find(p => p.json.name === 'effect').json.version
if (!baseline.startsWith('4.')) throw new Error(`Expected Effect v4, found ${baseline}`)
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim()) {
  throw new Error('Source checkout has changes or untracked files; use a clean pinned checkout for reproducible provenance.')
}
const url = `https://github.com/Effect-TS/effect/blob/${commit}/`
const resolveTarget = value => typeof value === 'string' || value === null ? value :
  resolveTarget(value?.types ?? value?.import ?? value?.default ?? Object.values(value ?? {})[0] ?? null)
const match = (pattern, key) => {
  if (!pattern.includes('*')) return pattern === key ? '' : undefined
  const [a,b] = pattern.split('*')
  return key.startsWith(a) && key.endsWith(b) && key.length >= a.length+b.length ? key.slice(a.length, b.length ? -b.length : undefined) : undefined
}
const resolveExport = (exports, key) => {
  const entries = Object.entries(exports).filter(([k]) => match(k,key) !== undefined)
    .sort(([a],[b]) => Number(b === key)-Number(a === key) || b.split('*')[0].length-a.split('*')[0].length || b.length-a.length)
  if (!entries.length) return null
  const [pattern, raw] = entries[0], target = resolveTarget(raw)
  return target === null ? null : target.replace('*',match(pattern,key))
}
const modules=[]
for (const pkg of packages) {
  const candidates = new Set(Object.keys(pkg.json.exports).filter(k => !k.includes('*')))
  for (const file of walk(path.join(pkg.dir,'src')).filter(p=>p.endsWith('.ts')&&!p.endsWith('.d.ts'))) {
    const relative='./'+path.relative(pkg.dir,file).split(path.sep).join('/')
    for (const [key, value] of Object.entries(pkg.json.exports)) {
      const target=resolveTarget(value)
      if (!target?.includes('*')) continue
      const captured=match(target,relative)
      if (captured!==undefined) candidates.add(key.replace('*',captured))
    }
  }
  for (const key of [...candidates].sort()) {
    const target=resolveExport(pkg.json.exports,key)
    if (!target?.endsWith('.ts') || /(^|\/)internal(\/|$)/.test(key)) continue
    const file=path.resolve(pkg.dir,target)
    if (!fs.existsSync(file)) throw new Error(`Export target missing: ${pkg.json.name}${key}: ${file}`)
    modules.push({module:pkg.json.name+(key==='.'?'':key.slice(1)),package:pkg.json.name,version:pkg.json.version,file})
  }
}
modules.sort((a,b)=>a.module.localeCompare(b.module,'en'))
const program=ts.createProgram([...new Set(modules.map(m=>m.file))],{
  target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions:true,noEmit:true,skipLibCheck:true,noLib:true,
  baseUrl:root,paths:Object.fromEntries(modules.map(m=>[m.module,[m.file]]))
})
const checker=program.getTypeChecker()
const clean = s => s.replace(/\{@link\s+([^}|]+)(?:\|([^}]+))?\}/g,(_,a,b)=>b||a).replace(/\s+/g,' ').trim()
function docs(symbol) {
  const text=ts.displayPartsToString(symbol.getDocumentationComment(checker))
  const when=text.match(/\*\*When to use\*\*\s*([\s\S]*?)(?=\n\s*\*\*|\n\s*```|$)/i)?.[1]
  return {summary:clean(text.split(/\n\s*\n|\*\*Example|```/)[0]||''),...(when?{when:clean(when)}:{})}
}
function guide(m) {
  const n=m.module
  if(n.includes('/testing')||n==='@effect/vitest'||/opentelemetry|observability|devtools|doctest|docgen|effect-utils|ai-codegen|ai-docgen|\/unstable\/arbitrary/.test(n)) return 'testing-and-observability.md'
  if(/\/unstable\/(reactivity|socket|net|workers)|@effect\/atom-/.test(n))return 'reactivity-and-integrations.md'
  if(/\/unstable\/ai(?:\/|$)|@effect\/ai-/.test(n))return 'ai.md'
  if(/\/unstable\/(workflow|cluster|eventlog)/.test(n))return 'workflow-and-cluster.md'
  if(/\/unstable\/(sql|schema|persistence)|@effect\/sql-/.test(n))return 'sql-and-persistence.md'
  if(/\/unstable\/(http|httpapi|rpc)|openapi-generator/.test(n))return 'http.md'
  if(/\/unstable\/(cli|process)/.test(n))return 'cli.md'
  if(/\/unstable\/encoding/.test(n))return 'streams.md'
  if(/@effect\/platform-/.test(n))return 'project-setup.md'
  const base=n.split('/').at(-1)
  if(/^Schema|^(JsonSchema|StandardSchema)$/.test(base))return 'schema.md'
  if(/^(Effect|Cause|Exit|Result|Option|Runtime|Effectable)$/.test(base))return 'core.md'
  if(/^(Context|Layer|LayerMap|LayerRef|Resource|ManagedRuntime|Config|ConfigProvider|Scope|Pool|RcMap|RcRef|ScopedRef|References|ServiceMap)$/.test(base))return 'services.md'
  if(/^(Cache|ScopedCache|Schedule|ExecutionPlan|Request|RequestResolver)$/.test(base))return 'resilience.md'
  if(/^(Fiber.*|Tx.*|Ref|SynchronizedRef|SubscriptionRef|Deferred|Latch|Semaphore|PartitionedSemaphore|Queue|PubSub|Scheduler)$/.test(base))return 'state-and-concurrency.md'
  if(/^(Stream|Sink|Channel|ChannelSchema|Pull|Take)$/.test(base))return 'streams.md'
  if(/^(Logger|LogLevel|Metric|Tracer|Console|ErrorReporter)$/.test(base))return 'testing-and-observability.md'
  if(/^(FileSystem|Path|Terminal|Stdio|PlatformError)$/.test(base))return 'cli.md'
  return 'standard-library.md'
}
const records=[]
for(const m of modules) {
  const sf=program.getSourceFile(m.file), moduleSymbol=checker.getSymbolAtLocation(sf)
  const source=path.relative(root,m.file).split(path.sep).join('/')
  const first=sf.text.match(/^\s*\/\*\*([\s\S]*?)\*\//)?.[1]?.replace(/^\s*\* ?/gm,'').split(/\n\s*\n|@since/)[0]||''
  const symbols=moduleSymbol?checker.getExportsOfModule(moduleSymbol).map(s=>{
    const original=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s
    const decl=original.declarations?.[0]??s.declarations?.[0]
    const origin=decl?.getSourceFile(), line=decl?origin.getLineAndCharacterOfPosition(decl.getStart()).line+1:undefined
    const tags=original.getJsDocTags(checker)
    const documentation=docs(original)
    return {name:s.name,kind:decl?ts.SyntaxKind[decl.kind]:'alias',...documentation,
      category:tags.find(t=>t.name==='category')?.text?.map(p=>p.text).join('')??'uncategorized',
      ...(tags.some(t=>t.name==='deprecated')?{deprecated:true}:{}),
      ...(origin?{source:path.relative(root,origin.fileName).split(path.sep).join('/'),line}:{})}
  }).sort((a,b)=>a.name.localeCompare(b.name,'en')):[]
  if (!symbols.length) throw new Error(`No exports resolved for ${m.module}; check workspace resolution.`)
  if (symbols.some(s=>!s.source)) throw new Error(`Unresolved export in ${m.module}; inspect imports.`)
  records.push({module:m.module,package:m.package,version:m.version,guide:guide(m),source,
    stability:m.module.includes('/unstable/')?'unstable':'release-versioned',
    summary:clean(first),symbols})
}
fs.mkdirSync(out,{recursive:true})
const data=records.map(r=>JSON.stringify(r)).join('\n')+'\n'
fs.writeFileSync(path.join(out,'api-index.jsonl'),data)
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify({repository:'https://github.com/Effect-TS/effect',commit,effectVersion:baseline,
  packages:packages.map(p=>({name:p.json.name,version:p.json.version})).sort((a,b)=>a.name.localeCompare(b.name,'en')),
  modules:records.length,leafModules:records.filter(r=>!r.source.endsWith('/index.ts')).length,
  exports:records.reduce((n,r)=>n+r.symbols.length,0),generator:'scripts/build-coverage.mjs',typescript:ts.version},null,2)+'\n')
const esc=s=>s.replace(/\|/g,'\\|').replace(/\n/g,' ')
const lines=['# Generated Effect v4 module map','',`Baseline: **${baseline}**, source [${commit.slice(0,12)}](${url.replace('/blob/','/tree/').slice(0,-1)}).`,
  '',`${records.length} public module entrypoints (including barrels), ${records.filter(r=>!r.source.endsWith('/index.ts')).length} leaf modules; ${packages.length} non-private source packages.`,
  '', 'Generated from package export maps and TypeScript module symbols. See [source and coverage](../source-and-coverage.md) for scope and regeneration.',
  'Every exported symbol, category, available upstream use cue and source location is searchable in `api-index.jsonl`; do not load it wholesale.',
  '', '| Public module | Guide | Exports | Purpose / source |','|---|---|---:|---|']
for(const r of records)lines.push(`| \`${r.module}\` | [guide](../${r.guide}) | ${r.symbols.length} | [${esc(r.summary||r.module)}](${url}${r.source}) |`)
fs.writeFileSync(path.join(out,'modules.md'),lines.join('\n')+'\n')
fs.copyFileSync(path.join(root,'LICENSE'),path.join(out,'EFFECT-LICENSE.txt'))
console.log(JSON.stringify({version:baseline,modules:records.length,exports:records.reduce((n,r)=>n+r.symbols.length,0),bytes:Buffer.byteLength(data)}))

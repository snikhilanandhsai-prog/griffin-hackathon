const TYPE_META = {
  motor:     { icon:'⚙', defaults:['vibration_mms','temperature_c','rpm'] },
  pump:      { icon:'◉', defaults:['pressure_psi','flow_lpm','temperature_c'] },
  conveyor:  { icon:'▬', defaults:['belt_speed_ms','motor_load_pct','temperature_c'] },
  generator: { icon:'⚡', defaults:['voltage_v','frequency_hz','fuel_pct'] },
  custom:    { icon:'◆', defaults:[] },
};

let assets = [];
let readingsCache = {};
let activeAssetId = null;
let pendingParams = [];
let chartInstance = null;
let activeParamTab = null;
let viewMode = 'monitor'; // 'monitor' | 'simulate'
let simState = null;      // { assetId, load, temp, vib, vibBase, status, log, series }
let simChartInstance = null;

function toast(msg, isErr){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(()=> t.className='toast', 2400);
}

// Detect once: are we inside Claude's artifact sandbox (window.storage available),
// or running as a standalone downloaded file (use the browser's own localStorage instead)?
const STORAGE_BACKEND = (typeof window.storage !== 'undefined' && window.storage && typeof window.storage.get === 'function')
  ? 'artifact' : 'local';

async function storeGet(key){
  if(STORAGE_BACKEND === 'artifact'){
    try{ const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
    catch(e){ return null; } // key not created yet — expected on first run
  }
  try{
    const raw = localStorage.getItem('infraai_' + key);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
async function storeSet(key, value){
  if(STORAGE_BACKEND === 'artifact'){
    try{ await window.storage.set(key, JSON.stringify(value)); }
    catch(e){ toast('Save failed — storage error', true); }
    return;
  }
  try{ localStorage.setItem('infraai_' + key, JSON.stringify(value)); }
  catch(e){ toast('Save failed — storage error', true); }
}
async function storeDelete(key){
  if(STORAGE_BACKEND === 'artifact'){
    try{ await window.storage.delete(key); }catch(e){}
    return;
  }
  try{ localStorage.removeItem('infraai_' + key); }catch(e){}
}

async function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-btn-night').classList.toggle('active', t==='night');
  document.getElementById('theme-btn-day').classList.toggle('active', t==='day');
  await storeSet('theme', t);
  if(activeAssetId){ renderMain(); }
}

async function init(){
  const savedTheme = await storeGet('theme');
  await setTheme(savedTheme || 'night');
  const a = await storeGet('assets');
  assets = a || [];
  for(const asset of assets){
    const r = await storeGet('readings:'+asset.id);
    readingsCache[asset.id] = r || [];
  }
  renderSidebar();
  if(assets.length && !activeAssetId){ selectAsset(assets[0].id); }
}

/* ---------- Asset modal ---------- */
function openAssetModal(){
  document.getElementById('na-name').value='';
  document.getElementById('na-type').value='motor';
  pendingParams = [...TYPE_META.motor.defaults];
  renderParamChips();
  document.getElementById('asset-modal').classList.add('show');
}
function closeAssetModal(){ document.getElementById('asset-modal').classList.remove('show'); }
function onTypeChange(){
  const t = document.getElementById('na-type').value;
  pendingParams = [...TYPE_META[t].defaults];
  renderParamChips();
}
function renderParamChips(){
  const wrap = document.getElementById('na-params');
  wrap.innerHTML = pendingParams.map((p,i)=>
    `<span class="param-chip">${p} <button onclick="removeParamChip(${i})">×</button></span>`
  ).join('') || '<span class="hint">No parameters yet — add one below.</span>';
}
function addParamChip(){
  const inp = document.getElementById('na-param-input');
  const v = inp.value.trim().replace(/\s+/g,'_');
  if(v && !pendingParams.includes(v)){ pendingParams.push(v); renderParamChips(); }
  inp.value='';
}
function removeParamChip(i){ pendingParams.splice(i,1); renderParamChips(); }

async function createAsset(){
  const name = document.getElementById('na-name').value.trim();
  const type = document.getElementById('na-type').value;
  if(!name){ toast('Give the asset a name', true); return; }
  if(!pendingParams.length){ toast('Add at least one parameter to track', true); return; }
  const asset = { id:'a_'+Date.now(), name, type, params:pendingParams.slice(), createdAt:Date.now() };
  assets.push(asset);
  readingsCache[asset.id] = [];
  await storeSet('assets', assets);
  closeAssetModal();
  renderSidebar();
  selectAsset(asset.id);
  toast('Asset added');
}

async function deleteAsset(id){
  if(!confirm('Delete this asset and all its data?')) return;
  assets = assets.filter(a=>a.id!==id);
  delete readingsCache[id];
  await storeSet('assets', assets);
  try{ await storeDelete('readings:'+id); }catch(e){}
  if(activeAssetId===id){ activeAssetId=null; }
  renderSidebar();
  if(assets.length){ selectAsset(assets[0].id); } else { renderEmptyMain(); }
}

/* ---------- Stats / anomaly logic ---------- */
function computeStats(values){
  const n = values.length;
  const mean = values.reduce((s,v)=>s+v,0)/n;
  const variance = values.reduce((s,v)=>s+(v-mean)**2,0)/n;
  const std = Math.sqrt(variance);
  return { mean, std };
}
// returns {status: 'ok'|'warn'|'crit'|'none', z, latest, mean, std, trend}
function paramStatus(readings, param){
  const series = readings.map(r=>r.values[param]).filter(v=>typeof v==='number' && !isNaN(v));
  if(series.length < 3) return { status:'none', z:0, latest: series[series.length-1], n: series.length };
  const latest = series[series.length-1];
  const history = series.slice(0,-1);
  const { mean, std } = computeStats(history);
  const z = std > 0 ? (latest-mean)/std : 0;
  let status = 'ok';
  if(Math.abs(z) >= 2.5) status='crit';
  else if(Math.abs(z) >= 1.5) status='warn';
  // simple trend: compare avg of last 3 vs prior 3
  let trend = 0;
  if(series.length >= 6){
    const recent = series.slice(-3).reduce((a,b)=>a+b,0)/3;
    const prior = series.slice(-6,-3).reduce((a,b)=>a+b,0)/3;
    trend = prior !== 0 ? ((recent-prior)/Math.abs(prior))*100 : 0;
  }
  return { status, z, latest, mean, std, trend, n: series.length };
}
function assetOverallStatus(asset){
  const readings = readingsCache[asset.id] || [];
  if(!readings.length) return 'none';
  let worst = 'ok';
  for(const p of asset.params){
    const s = paramStatus(readings, p).status;
    if(s==='crit') return 'crit';
    if(s==='warn') worst='warn';
  }
  return readings.length < 3 ? 'none' : worst;
}

function unitForParam(param){
  const p = param.toLowerCase();
  if(p.includes('mms') || p.includes('vibrat')) return 'mm/s';
  if(p.includes('_c') || p.includes('temp')) return '°C';
  if(p.includes('pct') || p.includes('load') || p.includes('fuel')) return '%';
  if(p.includes('psi') || p.includes('pressure')) return 'psi';
  if(p.includes('lpm') || p.includes('flow')) return 'L/min';
  if(p.includes('_ms') || p.includes('speed')) return 'm/s';
  if(p.includes('rpm')) return 'RPM';
  if(p.includes('_v') || p.includes('volt')) return 'V';
  if(p.includes('hz') || p.includes('freq')) return 'Hz';
  return '';
}

function timeAgo(ts){
  if(!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.round(diff/60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins/60);
  if(hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs/24);
  return `${days}d ago`;
}

function computeFailureRisk(asset, readings){
  if(readings.length < 3) return { pct:null, rul:null };
  let maxAbsZ = 0;
  for(const p of asset.params){
    const s = paramStatus(readings, p);
    if(s.status !== 'none') maxAbsZ = Math.max(maxAbsZ, Math.abs(s.z));
  }
  const pct = Math.min(97, Math.max(1, Math.round((maxAbsZ/4)*100)));
  const rul = Math.max(3, Math.round(400 - pct*4));
  return { pct, rul };
}

function computeConfidence(readings){
  if(!readings.length) return null;
  return Math.min(99, 50 + readings.length*3);
}

/* ---------- Sidebar ---------- */
function renderSidebar(){
  const list = document.getElementById('asset-list');
  if(!assets.length){
    list.innerHTML = '<div class="empty-mini">No assets yet</div>';
    return;
  }
  list.innerHTML = assets.map(a=>{
    const st = assetOverallStatus(a);
    const meta = TYPE_META[a.type] || TYPE_META.custom;
    return `<div class="asset-item ${a.id===activeAssetId?'active':''}" onclick="selectAsset('${a.id}')">
      <div class="asset-icon">${meta.icon}</div>
      <div class="asset-info">
        <div class="asset-name">${escapeHtml(a.name)}</div>
        <div class="asset-type">${a.type}</div>
      </div>
      <div class="status-dot ${st}"></div>
    </div>`;
  }).join('');
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- Main panel ---------- */
function renderEmptyMain(){
  document.getElementById('main').innerHTML = `<div id="empty-state"><div class="big">◎</div><div>Add an asset to start monitoring</div></div>`;
}

function selectAsset(id){
  activeAssetId = id;
  activeParamTab = null;
  renderSidebar();
  renderMain();
}

function setViewMode(m){
  viewMode = m;
  renderMain();
}

function twinPanelHtml(asset, readings, overall){
  const riskInfo = computeFailureRisk(asset, readings);
  const confidence = computeConfidence(readings);
  const lastCalibrated = timeAgo(readings.length ? readings[readings.length-1].timestamp : asset.createdAt);
  return `<div class="twin-wrap" id="twin-canvas-wrap">
    <div class="twin-overlay-card twin-metrics-tl">
      ${asset.params.slice(0,3).map(p=>{
        const v = readings.length ? readings[readings.length-1].values[p] : undefined;
        return `<div class="twin-mini-stat">
          <div class="tm-label">${p.replace(/_/g,' ')}</div>
          <div class="tm-value">${v!==undefined && v!==null ? v : '—'}<span class="tm-unit">${unitForParam(p)}</span></div>
        </div>`;
      }).join('')}
    </div>
    <div class="twin-overlay-card twin-risk-tr">
      <div class="tm-label">Failure Risk</div>
      <div class="risk-value ${overall}">${riskInfo.pct!==null ? riskInfo.pct+'%' : '—'}</div>
      <div class="risk-bar"><div class="risk-bar-fill ${overall}" style="width:${riskInfo.pct||3}%"></div></div>
      <div class="risk-rul">${riskInfo.rul!==null ? 'RUL: '+riskInfo.rul+' days' : 'Awaiting data'}</div>
    </div>
    <div class="twin-footer">
      <div>Sensor Mesh sync <b>${readings.length ? 'OK' : 'NO DATA'}</b>&nbsp;&nbsp;&nbsp; Model confidence <b>${confidence!==null ? confidence+'%' : '—'}</b>&nbsp;&nbsp;&nbsp; Last calibrated <b>${lastCalibrated}</b></div>
      <div>Drag to orbit · scroll to zoom</div>
    </div>
  </div>`;
}

function renderMain(){
  const asset = assets.find(a=>a.id===activeAssetId);
  if(!asset){ renderEmptyMain(); return; }
  const readings = readingsCache[asset.id] || [];
  const overall = assetOverallStatus(asset);
  if(!activeParamTab || !asset.params.includes(activeParamTab)) activeParamTab = asset.params[0];

  const topbar = `
    <div class="topbar">
      <h1>${escapeHtml(asset.name)} <span class="type-tag">${asset.type}</span></h1>
      <div class="topbar-actions" style="align-items:center; gap:14px;">
        <div class="view-tabs">
          <button class="vtab ${viewMode==='monitor'?'active':''}" onclick="setViewMode('monitor')">Monitor</button>
          <button class="vtab ${viewMode==='simulate'?'active':''}" onclick="setViewMode('simulate')">Simulate</button>
        </div>
        <button class="btn danger" onclick="deleteAsset('${asset.id}')">Delete asset</button>
      </div>
    </div>`;

  if(viewMode === 'simulate'){
    renderSimulateView(asset, readings, overall, topbar);
    return;
  }

  const bannerCopy = {
    ok:   { icon:'✓', label:'Operating normally', detail:'All tracked parameters within expected range.' },
    warn: { icon:'!', label:'Elevated risk detected', detail:'One or more parameters are drifting outside normal range.' },
    crit: { icon:'⛔', label:'Critical anomaly detected', detail:'A parameter is significantly outside its normal range — inspect soon.' },
    none: { icon:'…', label:'Not enough data yet', detail:'Add at least 3 readings to enable anomaly detection.' },
  }[overall];

  const metricCards = asset.params.map(p=>{
    const s = paramStatus(readings, p);
    const flagText = s.status==='none' ? `${s.n||0}/3 readings` :
      s.status==='ok' ? `z=${s.z.toFixed(2)} · normal` :
      s.status==='warn' ? `z=${s.z.toFixed(2)} · watch` : `z=${s.z.toFixed(2)} · critical`;
    const trendArrow = s.trend > 5 ? ' ↑' : s.trend < -5 ? ' ↓' : '';
    return `<div class="metric-card">
      <div class="m-label">${p.replace(/_/g,' ')}</div>
      <div class="m-value">${s.latest!==undefined ? s.latest : '—'}${trendArrow}</div>
      <div class="m-flag ${s.status==='none'?'':s.status}">${flagText}</div>
    </div>`;
  }).join('');

  const tabs = asset.params.map(p=>
    `<div class="tab ${p===activeParamTab?'active':''}" onclick="setParamTab('${p}')">${p.replace(/_/g,' ')}</div>`
  ).join('');

  const tableRows = readings.slice().reverse().slice(0,25).map(r=>{
    const t = new Date(r.timestamp);
    return `<tr><td>${t.toLocaleString()}</td>${asset.params.map(p=>{
      const v = r.values[p];
      return `<td>${v!==undefined && v!==null ? v : '—'}</td>`;
    }).join('')}</tr>`;
  }).join('') || `<tr><td colspan="${asset.params.length+1}" style="text-align:center; color:var(--muted); font-family:var(--sans);">No readings yet</td></tr>`;

  document.getElementById('main').innerHTML = `
    ${topbar}
    <div class="content">
      <div class="status-banner ${overall}">
        <div class="icon">${bannerCopy.icon}</div>
        <div>
          <div class="label">${bannerCopy.label}</div>
          <div class="detail">${bannerCopy.detail}</div>
        </div>
      </div>

      <div class="panel">
        <h2>Digital twin <span class="n">— live 3D model, drag to rotate</span></h2>
        ${twinPanelHtml(asset, readings, overall)}
      </div>

      <div class="grid">${metricCards}</div>

      <div class="panel">
        <h2>Add data <span class="n">— ${asset.params.join(', ')}</span></h2>
        <div class="tabs" style="margin-bottom:12px;">
          <div class="tab active" style="cursor:default;">Manual entry</div>
        </div>
        <div class="form-row" id="manual-fields">
          ${asset.params.map(p=>`<div class="field"><label>${p.replace(/_/g,' ')}</label><input type="number" step="any" id="mf_${p}" placeholder="value"></div>`).join('')}
          <div class="field" style="max-width:200px;">
            <label>Timestamp (optional)</label>
            <input type="datetime-local" id="mf_timestamp">
          </div>
        </div>
        <button class="btn primary" onclick="submitManualReading()">Add reading</button>

        <div style="margin-top:20px; border-top:1px solid var(--line); padding-top:16px;">
          <div class="field">
            <label>Or paste / upload CSV (columns: timestamp, ${asset.params.join(', ')})</label>
            <textarea id="csv-input" placeholder="timestamp,${asset.params.join(',')}&#10;2026-07-01T08:00,3.2,71,1490"></textarea>
          </div>
          <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
            <input type="file" id="csv-file" accept=".csv" style="flex:1;">
            <button class="btn" onclick="importCsvText()">Import pasted CSV</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Trend <span class="n">— ${asset.params.length} parameters, click to switch</span></h2>
        <div class="tabs">${tabs}</div>
        <div class="chart-wrap"><canvas id="trend-chart"></canvas></div>
      </div>

      <div class="panel">
        <h2>Recent readings <span class="n">${readings.length} total</span></h2>
        <table>
          <thead><tr><th>Timestamp</th>${asset.params.map(p=>`<th>${p.replace(/_/g,' ')}</th>`).join('')}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('csv-file').addEventListener('change', handleCsvFile);
  renderChart(asset, readings);
  buildTwin(asset, readings, overall);
}

function setParamTab(p){ activeParamTab = p; renderMain(); }

/* ===================== SIMULATE VIEW ===================== */

function ensureSimState(asset){
  if(!simState || simState.assetId !== asset.id){
    simState = { assetId: asset.id, load:60, temp:25, vib:1.0, status:'idle', series:[], watchDay:null, critDay:null, log:[] };
  }
  return simState;
}

function fmtSimVal(field, v){
  if(field==='load') return Math.round(v)+'%';
  if(field==='temp') return Math.round(v)+'°C';
  return v.toFixed(1)+'x';
}

function updateSimSlider(field, val){
  if(!simState) return;
  simState[field] = parseFloat(val);
  const label = document.getElementById('sr-val-'+field);
  if(label) label.textContent = fmtSimVal(field, simState[field]);
}

function runStressTest(){
  const asset = assets.find(a=>a.id===activeAssetId);
  if(!asset || !simState) return;
  const readings = readingsCache[asset.id] || [];
  const baseRisk = computeFailureRisk(asset, readings).pct || 4;

  const NOMINAL = { load:60, temp:25, vib:1.0 };
  const stressM = Math.max(0.15,
    (simState.load/NOMINAL.load) * (simState.temp/NOMINAL.temp) * (simState.vib/NOMINAL.vib)
  );

  const series = [];
  let watchDay = null, critDay = null;
  for(let d=0; d<=30; d++){
    const risk = Math.min(99, Math.max(0, baseRisk + (d/30)*40*stressM));
    series.push(Math.round(risk*10)/10);
    if(watchDay===null && risk>=40) watchDay=d;
    if(critDay===null && risk>=70) critDay=d;
  }

  let driver=null, driverZ=0;
  for(const p of asset.params){
    const s = paramStatus(readings, p);
    if(s.status!=='none' && Math.abs(s.z) > Math.abs(driverZ)){ driverZ = s.z; driver = p; }
  }

  const log = [];
  if(watchDay!==null){
    log.push({ day:watchDay, sev:'warn', text:`Crosses the watch threshold (40%)${driver?` — primary driver: ${driver.replace(/_/g,' ')}`:''}.` });
  }
  if(critDay!==null){
    log.push({ day:critDay, sev:'crit', text:`Reaches critical failure risk (70%) — recommend inspection before day ${critDay}.` });
  }
  if(watchDay===null && critDay===null){
    log.push({ day:null, sev:'ok', text:'No threshold crossings projected within the 30-day horizon at these settings.' });
  }

  simState.status = 'done';
  simState.series = series;
  simState.watchDay = watchDay;
  simState.critDay = critDay;
  simState.log = log;
  renderMain();
}

function resetSimBaseline(){
  if(!simState) return;
  simState.load = 60; simState.temp = 25; simState.vib = 1.0;
  simState.status = 'idle'; simState.series = []; simState.watchDay = null; simState.critDay = null; simState.log = [];
  renderMain();
}

function renderSimulateView(asset, readings, overall, topbar){
  const sim = ensureSimState(asset);

  const logHtml = sim.log.length ? sim.log.map(l=>`
    <div class="sim-log-row ${l.sev}">
      <div class="sim-log-day">${l.day!==null ? 'Day '+l.day : '—'}</div>
      <div class="sim-log-text">${l.text}</div>
    </div>`).join('') : `<div class="empty-mini">No events yet — run a stress test or adjust the sliders to generate predictions.</div>`;

  document.getElementById('main').innerHTML = `
    ${topbar}
    <div class="content">
      <div class="sim-hero">
        <div class="eyebrow">SCENARIO &amp; FAILURE PREDICTION ENGINE</div>
        <h1>Stress-test the <span class="accent">virtual replica</span> before the real asset ever feels it.</h1>
        <p class="sim-sub">Every reading logged for ${escapeHtml(asset.name)} feeds this model. Push load, heat, and vibration past real-world limits here first — the twin will show you where and when it's projected to break.</p>
      </div>

      <div class="sim-row">
        <div class="panel sim-twin-col">
          <h2>Digital twin <span class="n">— drag to rotate</span></h2>
          ${twinPanelHtml(asset, readings, overall)}
        </div>
        <div class="panel sim-controls-col">
          <h2>Scenario controls</h2>
          <div class="slider-row">
            <div class="sr-top"><span class="sr-label">Load</span><span class="sr-value" id="sr-val-load">${fmtSimVal('load', sim.load)}</span></div>
            <input type="range" min="0" max="150" value="${sim.load}" oninput="updateSimSlider('load', this.value)">
          </div>
          <div class="slider-row">
            <div class="sr-top"><span class="sr-label">Ambient Temp</span><span class="sr-value" id="sr-val-temp">${fmtSimVal('temp', sim.temp)}</span></div>
            <input type="range" min="0" max="60" value="${sim.temp}" oninput="updateSimSlider('temp', this.value)">
          </div>
          <div class="slider-row">
            <div class="sr-top"><span class="sr-label">Vibration Multiplier</span><span class="sr-value" id="sr-val-vib">${fmtSimVal('vib', sim.vib)}</span></div>
            <input type="range" min="0.5" max="3" step="0.1" value="${sim.vib}" oninput="updateSimSlider('vib', this.value)">
          </div>
          <button class="btn primary block" onclick="runStressTest()">▶ Run 30-day stress test</button>
          <button class="btn block" style="margin-top:8px;" onclick="resetSimBaseline()">Reset to live baseline</button>

          <div class="model-basis">
            <b>Model basis</b><br>
            Inputs: ${asset.params.join(', ')} from the sensor readings you've logged.<br><br>
            Output: a projected 30-day failure-risk curve versus the watch (40%) and critical (70%) thresholds, plus a predictive maintenance log.
          </div>
        </div>
      </div>

      <div class="sim-row">
        <div class="panel sim-chart-col">
          <h2>Predicted failure risk — simulation horizon <span class="n">${sim.status==='done' ? 'DONE' : 'IDLE'}</span></h2>
          <div class="chart-wrap" style="height:280px;"><canvas id="sim-chart"></canvas></div>
          <div class="sim-legend">
            <span><i class="sw" style="background:#00F0FF;"></i> Projected risk</span>
            <span><i class="sw dash" style="background:#FF3860;"></i> Critical threshold (70%)</span>
            <span><i class="sw dash" style="background:#FFC93C;"></i> Watch threshold (40%)</span>
          </div>
        </div>
        <div class="panel sim-log-col">
          <h2>Predictive maintenance log</h2>
          <div id="sim-log-list">${logHtml}</div>
        </div>
      </div>
    </div>
  `;

  renderSimChart(sim);
  buildTwin(asset, readings, overall);
}

function renderSimChart(sim){
  const ctx = document.getElementById('sim-chart');
  if(!ctx) return;
  const labels = Array.from({length:31}, (_,i)=>'Day '+i);
  const projected = sim.series.length ? sim.series : Array(31).fill(null);

  if(simChartInstance) simChartInstance.destroy();
  simChartInstance = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[
      { label:'Projected risk', data:projected, borderColor:'#00F0FF', backgroundColor:'rgba(0,240,255,0.10)', pointRadius:0, borderWidth:2, tension:0.2, fill:true, spanGaps:true },
      { label:'Critical threshold (70%)', data:Array(31).fill(70), borderColor:'#FF3860', borderDash:[6,5], pointRadius:0, borderWidth:1.5 },
      { label:'Watch threshold (40%)', data:Array(31).fill(40), borderColor:'#FFC93C', borderDash:[6,5], pointRadius:0, borderWidth:1.5 },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#7C87A8', font:{size:9}, maxTicksLimit:8 }, grid:{ color:'#1B2338' } },
        y:{ min:0, max:100, ticks:{ color:'#7C87A8', font:{size:10} }, grid:{ color:'#1B2338' } },
      }
    }
  });
}

function renderChart(asset, readings){
  const ctx = document.getElementById('trend-chart');
  if(!ctx) return;
  const sorted = readings.slice().sort((a,b)=>a.timestamp-b.timestamp);
  const labels = sorted.map(r=> new Date(r.timestamp).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));
  const data = sorted.map(r=> r.values[activeParamTab] !== undefined ? r.values[activeParamTab] : null);

  if(chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{
      label: activeParamTab, data,
      borderColor:'#00F0FF', backgroundColor:'rgba(0,240,255,0.10)',
      pointRadius:3, pointBackgroundColor:'#00F0FF', tension:0.25, fill:true, spanGaps:true,
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#7C87A8', font:{size:10} }, grid:{ color:'#1B2338' } },
        y:{ ticks:{ color:'#7C87A8', font:{size:10} }, grid:{ color:'#1B2338' } },
      }
    }
  });
}

/* ---------- Data entry ---------- */
async function submitManualReading(){
  const asset = assets.find(a=>a.id===activeAssetId);
  if(!asset) return;
  const values = {};
  let any = false;
  for(const p of asset.params){
    const el = document.getElementById('mf_'+p);
    const v = parseFloat(el.value);
    if(!isNaN(v)){ values[p]=v; any=true; }
  }
  if(!any){ toast('Enter at least one value', true); return; }
  const tsEl = document.getElementById('mf_timestamp');
  const timestamp = tsEl.value ? new Date(tsEl.value).getTime() : Date.now();
  readingsCache[asset.id].push({ timestamp, values });
  await storeSet('readings:'+asset.id, readingsCache[asset.id]);
  renderSidebar();
  renderMain();
  toast('Reading added');
}

function handleCsvFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{ document.getElementById('csv-input').value = ev.target.result; importCsvText(); };
  reader.readAsText(file);
}

async function importCsvText(){
  const asset = assets.find(a=>a.id===activeAssetId);
  if(!asset) return;
  const text = document.getElementById('csv-input').value.trim();
  if(!text){ toast('Paste or choose a CSV first', true); return; }
  let parsed;
  try{
    parsed = Papa.parse(text, { header:true, skipEmptyLines:true, dynamicTyping:true });
  }catch(e){ toast('Could not parse CSV', true); return; }
  if(parsed.errors && parsed.errors.length){ toast('CSV parse issue — check formatting', true); return; }

  let added = 0;
  for(const row of parsed.data){
    const values = {};
    let any = false;
    for(const p of asset.params){
      const key = Object.keys(row).find(k => k.trim().toLowerCase() === p.toLowerCase());
      if(key !== undefined && row[key] !== null && row[key] !== '' && !isNaN(row[key])){
        values[p] = parseFloat(row[key]); any = true;
      }
    }
    if(!any) continue;
    const tsKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'timestamp');
    let timestamp = Date.now() + added; // fallback stagger to keep order
    if(tsKey && row[tsKey]){
      const parsedDate = new Date(row[tsKey]);
      if(!isNaN(parsedDate.getTime())) timestamp = parsedDate.getTime();
    }
    readingsCache[asset.id].push({ timestamp, values });
    added++;
  }
  if(!added){ toast('No matching columns found in CSV', true); return; }
  await storeSet('readings:'+asset.id, readingsCache[asset.id]);
  document.getElementById('csv-input').value = '';
  renderSidebar();
  renderMain();
  toast(`Imported ${added} readings`);
}

/* ===================== DIGITAL TWIN (3D) ===================== */

const STATUS_COLOR = { ok:0x00F0FF, warn:0xFFC93C, crit:0xFF3860, none:0x3A4560 };
const SPIN_PARAM = { motor:'rpm', pump:'flow_lpm', conveyor:'belt_speed_ms', generator:'frequency_hz' };
const SPIN_SCALE  = { motor:3000, pump:200, conveyor:2, generator:60 };

function makeScanGroup(geometry, colorHex){
  const fillMat = new THREE.MeshStandardMaterial({
    color:colorHex, transparent:true, opacity:0.32, emissive:colorHex, emissiveIntensity:0.55,
    roughness:0.4, metalness:0.1, side:THREE.DoubleSide
  });
  const fill = new THREE.Mesh(geometry, fillMat);
  const edges = new THREE.EdgesGeometry(geometry, 20);
  const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color:colorHex, transparent:true, opacity:0.85 }));
  const grp = new THREE.Group();
  grp.add(fill); grp.add(wire);
  return grp;
}

let twin = null; // holds renderer/scene/camera/animId/spinObjs/packages/drag state
let twinResizeBound = false;

function destroyTwin(){
  if(!twin) return;
  if(twin.animId) cancelAnimationFrame(twin.animId);
  if(twin.renderer){
    twin.renderer.dispose();
    if(twin.renderer.domElement && twin.renderer.domElement.parentNode){
      twin.renderer.domElement.parentNode.removeChild(twin.renderer.domElement);
    }
  }
  twin = null;
}

function primaryTwinValue(asset, readings){
  const wantParam = SPIN_PARAM[asset.type];
  const param = (wantParam && asset.params.includes(wantParam)) ? wantParam : asset.params[0];
  const scale = SPIN_SCALE[asset.type] || 100;
  if(!readings.length) return { norm: 0.18, param }; // idle spin, no data yet
  const latest = readings[readings.length-1].values[param];
  if(typeof latest !== 'number' || isNaN(latest)) return { norm: 0.18, param };
  const norm = Math.min(2.2, Math.max(0.15, Math.abs(latest) / scale));
  return { norm, param };
}

function buildTwin(asset, readings, overallStatus){
  if(typeof THREE === 'undefined') return; // CDN blocked/offline — fail quietly
  destroyTwin();
  const wrap = document.getElementById('twin-canvas-wrap');
  if(!wrap) return;

  const w = wrap.clientWidth || 400, h = 380;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w/h, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  wrap.insertBefore(renderer.domElement, wrap.firstChild);

  scene.add(new THREE.AmbientLight(0x8899aa, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(4,6,4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x00F0FF, 0.3); rim.position.set(-4,-2,-3); scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 48),
    new THREE.MeshStandardMaterial({ color:0x10161F, metalness:0.2, roughness:0.9 })
  );
  floor.rotation.x = -Math.PI/2; floor.position.y = -1.05; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.55,2.62,48), new THREE.MeshBasicMaterial({ color:STATUS_COLOR[overallStatus]||0x3A4560, transparent:true, opacity:0.6, side:THREE.DoubleSide }));
  ring.rotation.x = -Math.PI/2; ring.position.y = -1.04; scene.add(ring);

  const group = new THREE.Group();
  const spinObjs = [];
  let packages = null, beltHalf = 0;

  const metal      = new THREE.MeshStandardMaterial({ color:0x4B5563, metalness:0.55, roughness:0.4 });
  const metalLight = new THREE.MeshStandardMaterial({ color:0x9CA3AF, metalness:0.6,  roughness:0.3 });
  const dark       = new THREE.MeshStandardMaterial({ color:0x1C242E, metalness:0.3,  roughness:0.6 });
  const accent     = new THREE.MeshStandardMaterial({ color:0xFFC93C, metalness:0.2,  roughness:0.5 });

  const scanColor = STATUS_COLOR[overallStatus] || STATUS_COLOR.none;

  if(asset.type === 'motor'){
    const bodyGeo = new THREE.CylinderGeometry(0.85,0.85,1.9,28); bodyGeo.rotateZ(Math.PI/2);
    group.add(makeScanGroup(bodyGeo, scanColor));
    for(let i=-2;i<=2;i++){
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.88,0.045,8,26), metalLight);
      rib.rotation.y = Math.PI/2; rib.position.x = i*0.33; group.add(rib);
    }
    const shaftGeo = new THREE.CylinderGeometry(0.16,0.16,1.3,16); shaftGeo.rotateZ(Math.PI/2);
    const shaft = new THREE.Mesh(shaftGeo, metalLight); shaft.position.x = 1.4; group.add(shaft);
    spinObjs.push({ mesh:shaft, axis:'x' });
    const capGeo = new THREE.CylinderGeometry(0.32,0.32,0.28,16); capGeo.rotateZ(Math.PI/2);
    const cap = new THREE.Mesh(capGeo, dark); cap.position.x = 2.05; group.add(cap);
    spinObjs.push({ mesh:cap, axis:'x' });

  } else if(asset.type === 'pump'){
    const housing = makeScanGroup(new THREE.SphereGeometry(1.05,24,20), scanColor);
    housing.scale.set(1,0.78,1); group.add(housing);
    const inletGeo = new THREE.CylinderGeometry(0.32,0.32,1.1,16); inletGeo.rotateZ(Math.PI/2);
    const inlet = new THREE.Mesh(inletGeo, metalLight); inlet.position.x = -1.2; group.add(inlet);
    const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,1.1,16), metalLight);
    outlet.position.y = 1.05; group.add(outlet);
    const impeller = new THREE.Group();
    for(let i=0;i<6;i++){
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.85,0.07,0.24), metalLight);
      blade.position.set(Math.cos(i*Math.PI/3)*0.38, 0, Math.sin(i*Math.PI/3)*0.38);
      blade.rotation.y = i*Math.PI/3;
      impeller.add(blade);
    }
    group.add(impeller); spinObjs.push({ mesh:impeller, axis:'y' });

  } else if(asset.type === 'conveyor'){
    const beltLen = 3.0; beltHalf = beltLen/2 - 0.3;
    const bed = makeScanGroup(new THREE.BoxGeometry(beltLen,0.14,1.05), scanColor); bed.position.y = 0.5; group.add(bed);
    const legGeo = new THREE.BoxGeometry(0.14,0.9,0.14);
    [[-1.3,0.85],[1.3,0.85],[-1.3,-0.85],[1.3,-0.85]].forEach(([x,z])=>{
      const leg = new THREE.Mesh(legGeo, metal); leg.position.set(x,0,z); group.add(leg);
    });
    [-1.4,1.4].forEach(x=>{
      const rollerGeo = new THREE.CylinderGeometry(0.2,0.2,1.15,16); rollerGeo.rotateZ(Math.PI/2);
      const roller = new THREE.Mesh(rollerGeo, metalLight); roller.position.set(x,0.5,0); group.add(roller);
      spinObjs.push({ mesh:roller, axis:'x' });
    });
    packages = [];
    for(let i=0;i<3;i++){
      const pkg = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.38,0.38), accent);
      pkg.position.set(-beltHalf + i*(beltLen/3), 0.76, 0);
      group.add(pkg); packages.push(pkg);
    }

  } else { // generator (and custom fallback)
    const body = makeScanGroup(new THREE.BoxGeometry(2.1,1.25,1.25), scanColor); group.add(body);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.75,16), metalLight);
    exhaust.position.set(0.75,0.85,0); group.add(exhaust);
    const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.12,24), dark);
    grille.rotation.z = Math.PI/2; grille.position.x = -1.1; group.add(grille);
    const fan = new THREE.Group();
    for(let i=0;i<4;i++){
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.65,0.18), metalLight);
      blade.rotation.x = i*Math.PI/2; fan.add(blade);
    }
    fan.position.x = -1.1; group.add(fan); spinObjs.push({ mesh:fan, axis:'x' });
  }

  scene.add(group);

  const { norm: speedNorm } = primaryTwinValue(asset, readings);
  const baseIncrement = 0.03;

  twin = {
    renderer, scene, camera, wrap, spinObjs, packages, beltHalf,
    speed: speedNorm * baseIncrement,
    azimuth: 0.6, elevation: 0.35, distance: 5.6,
    drag: { active:false, lastX:0, lastY:0 },
  };

  updateCamera();

  wrap.onmousedown = (e)=>{ twin.drag.active=true; twin.drag.lastX=e.clientX; twin.drag.lastY=e.clientY; };
  window.addEventListener('mousemove', onTwinDrag);
  window.addEventListener('mouseup', ()=>{ if(twin) twin.drag.active=false; });
  wrap.onwheel = (e)=>{
    e.preventDefault();
    if(!twin) return;
    twin.distance = Math.min(9, Math.max(3, twin.distance + e.deltaY*0.003));
    updateCamera();
  };

  if(!twinResizeBound){
    window.addEventListener('resize', ()=>{
      if(!twin) return;
      const nw = twin.wrap.clientWidth || 400;
      twin.renderer.setSize(nw, 380);
      twin.camera.aspect = nw/380; twin.camera.updateProjectionMatrix();
    });
    twinResizeBound = true;
  }

  animateTwin();
}

function onTwinDrag(e){
  if(!twin || !twin.drag.active) return;
  const dx = e.clientX - twin.drag.lastX, dy = e.clientY - twin.drag.lastY;
  twin.drag.lastX = e.clientX; twin.drag.lastY = e.clientY;
  twin.azimuth -= dx*0.006;
  twin.elevation = Math.min(1.2, Math.max(-0.2, twin.elevation - dy*0.006));
  updateCamera();
}

function updateCamera(){
  if(!twin) return;
  const { azimuth, elevation, distance } = twin;
  twin.camera.position.set(
    distance*Math.cos(elevation)*Math.sin(azimuth),
    distance*Math.sin(elevation) + 0.4,
    distance*Math.cos(elevation)*Math.cos(azimuth)
  );
  twin.camera.lookAt(0,0.1,0);
}

function animateTwin(){
  if(!twin) return;
  twin.animId = requestAnimationFrame(animateTwin);
  twin.spinObjs.forEach(o=>{ o.mesh.rotation[o.axis] += twin.speed; });
  if(twin.packages){
    twin.packages.forEach(p=>{
      p.position.x += twin.speed*0.5;
      if(p.position.x > twin.beltHalf) p.position.x = -twin.beltHalf;
    });
  }
  twin.renderer.render(twin.scene, twin.camera);
}

init();

// @ts-nocheck

"use client";

import { useEffect } from "react";
import * as THREE from "three";

export default function Home() {
  useEffect(() => {
    let unmounted = false;
    let animFrameId;
    let watchInterval;
    let clockInterval;
    let animInterval;

    // --- script.js content ---
    /* =========================================================
   FLEET DATA
   ========================================================= */
const ASSETS = [
  { id:'pump04', name:'Pump Skid 04', meta:'Centrifugal · Line C', baseLoad:62, baseTemp:28, baseVibm:10, health:'ok' },
  { id:'compB',  name:'Compressor B', meta:'Rotary screw · Line A', baseLoad:78, baseTemp:34, baseVibm:16, health:'warn' },
  { id:'convL2', name:'Conveyor Line 2', meta:'Belt drive · Bay 3', baseLoad:40, baseTemp:24, baseVibm:8,  health:'ok' },
];
let currentAsset = ASSETS[0];

/* =========================================================
   ASSET LIST UI
   ========================================================= */
const assetListEl = document.getElementById('asset-list');
function statusClass(h){ return h==='crit' ? 'st-crit' : h==='warn' ? 'st-warn' : 'st-ok'; }
function statusLabel(h){ return h==='crit' ? 'Critical' : h==='warn' ? 'Elevated' : 'Nominal'; }

function renderAssetList(){
  assetListEl.innerHTML = '';
  ASSETS.forEach(a=>{
    const div = document.createElement('div');
    div.className = 'asset-item' + (a.id===currentAsset.id ? ' active':'');
    div.innerHTML = `
      <div class="a-name">${a.name}</div>
      <div class="a-meta">${a.meta}</div>
      <div class="a-status ${statusClass(a.health)}"><span class="sw"></span>${statusLabel(a.health)}</div>
    `;
    div.addEventListener('click', ()=>{
      currentAsset = a;
      sldLoad.value = a.baseLoad; sldTemp.value = a.baseTemp; sldVibm.value = a.baseVibm;
      document.getElementById('vp-asset-name').textContent = a.name;
      document.querySelector('.viewport-head .tag').textContent = a.meta;
      renderAssetList();
      updateLabels();
      clearChart();
    });
    assetListEl.appendChild(div);
  });
}
renderAssetList();

/* =========================================================
   THREE.JS TWIN SCENE
   ========================================================= */
const wrap = document.getElementById('twin-canvas-wrap');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, wrap.clientWidth/wrap.clientHeight, 0.1, 100);
camera.position.set(4.4, 2.8, 5.2);
camera.lookAt(0,0.4,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(wrap.clientWidth, wrap.clientHeight);
wrap.appendChild(renderer.domElement);

// lights
scene.add(new THREE.AmbientLight(0x30414f, 1.1));
const key = new THREE.PointLight(0x9fe8f0, 1.2, 20);
key.position.set(4,5,4); scene.add(key);
const rim = new THREE.PointLight(0x4dd8e6, 0.6, 20);
rim.position.set(-4,2,-3); scene.add(rim);

// base plate
const baseMat = new THREE.MeshStandardMaterial({ color:0x141c26, roughness:0.85, metalness:0.2 });
const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 2.2), baseMat);
base.position.y = -0.9;
scene.add(base);

// grid ring under base
const ringGeo = new THREE.RingGeometry(2.0, 2.02, 64);
const ringMat = new THREE.MeshBasicMaterial({ color:0x2a5960, side:THREE.DoubleSide, transparent:true, opacity:0.5 });
const ring = new THREE.Mesh(ringGeo, ringMat);
ring.rotation.x = -Math.PI/2; ring.position.y = -1.0;
scene.add(ring);

// pump body (housing)
const twinMat = new THREE.MeshStandardMaterial({ color:0x3ddc84, roughness:0.4, metalness:0.55, emissive:0x0d3a24, emissiveIntensity:0.6 });
const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.85,1.3,32), twinMat);
housing.rotation.z = Math.PI/2;
housing.position.set(-0.5, -0.1, 0);
scene.add(housing);

// motor housing
const motorMat = new THREE.MeshStandardMaterial({ color:0x1c2531, roughness:0.5, metalness:0.6 });
const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,1.5,24), motorMat);
motor.rotation.z = Math.PI/2;
motor.position.set(1.2, -0.1, 0);
scene.add(motor);

// shaft (rotates)
const shaftMat = new THREE.MeshStandardMaterial({ color:0x8a97a3, roughness:0.3, metalness:0.8 });
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,1.1,16), shaftMat);
shaft.rotation.z = Math.PI/2;
shaft.position.set(0.35,-0.1,0);
scene.add(shaft);

// bearing housings (stress hotspots — these pulse with risk color)
const bearingMat1 = twinMat.clone();
const bearing1 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 16, 32), bearingMat1);
bearing1.rotation.y = Math.PI/2;
bearing1.position.set(-0.02,-0.1,0);
scene.add(bearing1);

const bearingMat2 = twinMat.clone();
const bearing2 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 16, 32), bearingMat2);
bearing2.rotation.y = Math.PI/2;
bearing2.position.set(0.75,-0.1,0);
scene.add(bearing2);

// impeller hint (small cone at front of housing)
const impMat = new THREE.MeshStandardMaterial({ color:0x2a5960, metalness:0.6, roughness:0.4 });
const imp = new THREE.Mesh(new THREE.ConeGeometry(0.5,0.25,4), impMat);
imp.rotation.z = -Math.PI/2;
imp.position.set(-1.3,-0.1,0);
scene.add(imp);

// bolts / feet
[[-1.6,-1.0,0.85],[-1.6,-1.0,-0.85],[1.9,-1.0,0.85],[1.9,-1.0,-0.85]].forEach(p=>{
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.18,10), new THREE.MeshStandardMaterial({color:0x0f151c,metalness:0.7,roughness:0.4}));
  bolt.position.set(p[0],p[1],p[2]);
  scene.add(bolt);
});

// wireframe "holographic" overlay on housing to sell the "twin/virtual model" idea
const wireGeo = new THREE.CylinderGeometry(0.95,0.95,1.42,32);
const wireMat = new THREE.MeshBasicMaterial({ color:0x4dd8e6, wireframe:true, transparent:true, opacity:0.18 });
const wireOverlay = new THREE.Mesh(wireGeo, wireMat);
wireOverlay.rotation.z = Math.PI/2;
wireOverlay.position.set(-0.5,-0.1,0);
scene.add(wireOverlay);

let group = new THREE.Group();
[base,ring,housing,motor,shaft,bearing1,bearing2,imp,wireOverlay].forEach(o=>group.add(o));
scene.add(group);
group.position.y = 0.3;

// orbit controls (lightweight manual implementation — no OrbitControls in r128 build used here)
let isDragging=false, prevX=0, prevY=0, azim=0.5, elev=0.32, dist=7.4;
function updateCam(){
  camera.position.x = dist*Math.sin(azim)*Math.cos(elev);
  camera.position.y = dist*Math.sin(elev)+0.6;
  camera.position.z = dist*Math.cos(azim)*Math.cos(elev);
  camera.lookAt(0,0.4,0);
}
updateCam();
renderer.domElement.style.cursor='grab';
renderer.domElement.addEventListener('pointerdown', e=>{ isDragging=true; prevX=e.clientX; prevY=e.clientY; renderer.domElement.style.cursor='grabbing'; });
window.addEventListener('pointerup', ()=>{ isDragging=false; renderer.domElement.style.cursor='grab'; });
window.addEventListener('pointermove', e=>{
  if(!isDragging) return;
  const dx = e.clientX-prevX, dy = e.clientY-prevY;
  azim -= dx*0.006; elev = Math.max(0.08, Math.min(0.9, elev + dy*0.005));
  prevX=e.clientX; prevY=e.clientY;
  updateCam();
});
renderer.domElement.addEventListener('wheel', e=>{
  e.preventDefault();
  dist = Math.max(4.5, Math.min(11, dist + e.deltaY*0.003));
  updateCam();
}, { passive:false });

window.addEventListener('resize', ()=>{
  camera.aspect = wrap.clientWidth/wrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
});

/* =========================================================
   SIMULATION MODEL
   ========================================================= */
const sldLoad = document.getElementById('sld-load');
const sldTemp = document.getElementById('sld-temp');
const sldVibm = document.getElementById('sld-vibm');
const lblLoad = document.getElementById('lbl-load');
const lblTemp = document.getElementById('lbl-temp');
const lblVibm = document.getElementById('lbl-vibm');

function computeRisk(load, temp, vibm){
  // simple composite index: overload beyond 100%, heat beyond 45C, and vibration multiplier all raise risk non-linearly
  const loadFactor = Math.max(0, (load-70)) * 0.9;
  const tempFactor  = Math.max(0, (temp-40)) * 1.15;
  const vibFactor   = Math.max(0, (vibm-10)) * 2.1;
  let risk = 4 + loadFactor*0.55 + tempFactor*0.5 + vibFactor*0.55;
  risk = Math.min(99, Math.max(1, risk));
  return risk;
}

function riskColor(risk){
  if(risk >= 70) return getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
  if(risk >= 40) return getComputedStyle(document.documentElement).getPropertyValue('--amber').trim();
  return getComputedStyle(document.documentElement).getPropertyValue('--green').trim();
}
function riskHex(risk){
  if(risk >= 70) return 0xff5c5c;
  if(risk >= 40) return 0xf5a623;
  return 0x3ddc84;
}

let liveVib = 2.1, liveTemp = 41, t0 = Date.now();
let modelMinutes = 0;

function updateLabels(){
  lblLoad.textContent = sldLoad.value + '%';
  lblTemp.textContent = sldTemp.value + '°C';
  lblVibm.textContent = (sldVibm.value/10).toFixed(1) + '×';
}
[sldLoad, sldTemp, sldVibm].forEach(s=> s.addEventListener('input', updateLabels));
updateLabels();

function tick(){
  const load = parseFloat(sldLoad.value);
  const temp = parseFloat(sldTemp.value);
  const vibm = parseFloat(sldVibm.value)/10;

  const risk = computeRisk(load, temp, vibm*10);
  const color = riskHex(risk);

  // shaft rotation speed scales with load
  shaft.rotation.x += 0.02 + load*0.0009;
  imp.rotation.x = shaft.rotation.x;

  // jitter scales with vibration
  const jitter = (vibm*0.9) * 0.012;
  group.position.x = Math.sin(Date.now()*0.02)*jitter;
  group.position.z = Math.cos(Date.now()*0.017)*jitter*0.6;

  // color pulse on bearings + housing tinted toward risk color
  const c = new THREE.Color(color);
  bearingMat1.emissive.set(c); bearingMat1.emissiveIntensity = 0.7 + Math.sin(Date.now()*0.006)*0.15;
  bearingMat2.emissive.set(c); bearingMat2.emissiveIntensity = bearingMat1.emissiveIntensity;
  twinMat.color.lerp(c, 0.04); twinMat.emissive.set(c); twinMat.emissiveIntensity = 0.35 + risk*0.004;

  // simulated live readouts (small noise)
  liveVib = 1.6 + vibm*1.3 + Math.sin(Date.now()*0.004)*0.15;
  liveTemp = temp + 6 + Math.sin(Date.now()*0.002)*1.2;
  document.getElementById('hud-vib').textContent = liveVib.toFixed(2) + ' mm/s';
  document.getElementById('hud-temp').textContent = Math.round(liveTemp) + '°C';
  document.getElementById('hud-load').textContent = Math.round(load) + '%';

  document.getElementById('risk-num').textContent = Math.round(risk) + '%';
  document.getElementById('risk-num').style.color = color;
  document.getElementById('risk-bar-fill').style.width = risk + '%';
  document.getElementById('risk-bar-fill').style.background = color;

  const rul = Math.max(1, Math.round(240 - risk*2.3));
  document.getElementById('risk-eta').textContent = 'RUL: ' + rul + ' days';

  modelMinutes += 1;
  const hh = String(Math.floor(modelMinutes/60)).padStart(2,'0');
  const mm = String(modelMinutes%60).padStart(2,'0');
  document.getElementById('vp-clock').textContent = 'Model time · T+' + hh + ':' + mm;

  renderer.render(scene, camera);
  animFrameId = requestAnimationFrame(tick);
}
tick();

/* =========================================================
   RISK CHART (canvas)
   ========================================================= */
const chartCanvas = document.getElementById('risk-chart');
const ctx = chartCanvas.getContext('2d');
function fitCanvas(){
  const rect = chartCanvas.getBoundingClientRect();
  chartCanvas.width = rect.width * devicePixelRatio;
  chartCanvas.height = rect.height * devicePixelRatio;
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

function drawChart(points, failDay){
  fitCanvas();
  const rect = chartCanvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  const padL=34, padR=14, padT=14, padB=24;
  ctx.clearRect(0,0,W,H);

  const plotW = W-padL-padR, plotH = H-padT-padB;

  // gridlines + y labels
  ctx.strokeStyle = '#1e2733'; ctx.fillStyle = '#4b5866';
  ctx.font = '10.5px IBM Plex Mono, monospace';
  [0,25,50,75,100].forEach(v=>{
    const y = padT + plotH - (v/100)*plotH;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
    ctx.fillText(v+'', 4, y+3);
  });

  // threshold lines
  function hline(val,color){
    const y = padT + plotH - (val/100)*plotH;
    ctx.strokeStyle = color; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
    ctx.setLineDash([]);
  }
  hline(70, '#ff5c5c');
  hline(40, '#f5a623');

  if(points.length < 2) return;

  // risk curve
  ctx.strokeStyle = '#4dd8e6'; ctx.lineWidth = 2; ctx.beginPath();
  points.forEach((p,i)=>{
    const x = padL + (i/(points.length-1))*plotW;
    const y = padT + plotH - (p/100)*plotH;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // fill under curve
  ctx.lineTo(padL+plotW, padT+plotH);
  ctx.lineTo(padL, padT+plotH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(77,216,230,0.08)';
  ctx.fill();

  // failure marker
  if(failDay !== null){
    const x = padL + (failDay/(points.length-1))*plotW;
    const y = padT + plotH - (points[failDay]/100)*plotH;
    ctx.fillStyle = '#ff5c5c';
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff5c5c'; ctx.font='10.5px IBM Plex Mono, monospace';
    ctx.fillText('predicted failure · day '+failDay, Math.min(x+8, W-160), y-8);
  }

  // x axis label
  ctx.fillStyle = '#4b5866';
  ctx.fillText('day 0', padL, H-6);
  ctx.fillText('day '+(points.length-1), W-padR-40, H-6);
}
function clearChart(){ drawChart([], null); document.getElementById('chart-status').textContent='idle'; }
clearChart();

/* =========================================================
   LOG
   ========================================================= */
const logList = document.getElementById('log-list');
function addLog(text, level){
  if(logList.querySelector('.log-empty')) logList.innerHTML='';
  const el = document.createElement('div');
  el.className = 'log-item';
  const dotColor = level==='crit' ? 'var(--red)' : level==='warn' ? 'var(--amber)' : 'var(--cyan)';
  const now = new Date();
  el.innerHTML = `<span class="dot" style="background:${dotColor}"></span><div class="txt"><span class="t">${now.toLocaleTimeString()}</span>${text}</div>`;
  logList.prepend(el);
}

/* =========================================================
   RUN STRESS TEST
   ========================================================= */
const btnRun = document.getElementById('btn-run');
const btnReset = document.getElementById('btn-reset');

btnRun.addEventListener('click', ()=>{
  btnRun.disabled = true;
  btnRun.textContent = 'Running simulation…';
  document.getElementById('chart-status').textContent = 'running';

  const load0 = parseFloat(sldLoad.value);
  const temp0 = parseFloat(sldTemp.value);
  const vibm0 = parseFloat(sldVibm.value);

  const days = 30;
  const points = [];
  let failDay = null;
  for(let d=0; d<=days; d++){
    // ramp scenario: load and temp creep upward over the horizon, simulating sustained duty
    const load = load0 + d*0.9;
    const temp = temp0 + d*0.45;
    const vibm = vibm0 + d*0.35;
    const risk = computeRisk(load, temp, vibm);
    points.push(risk);
    if(failDay===null && risk>=70) failDay = d;
  }

  let i = 0;
  const anim = watchInterval = setInterval(()=>{
    i++;
    drawChart(points.slice(0, i+1).concat(Array(days+1-i-1).fill(null)).filter(v=>v!==null), i>=points.length-1?failDay:null);
    if(i >= points.length-1){
      clearInterval(anim);
      drawChart(points, failDay);
      btnRun.disabled = false;
      btnRun.textContent = '▶ Run 30-Day Stress Test';
      document.getElementById('chart-status').textContent = 'complete';

      if(failDay !== null){
        addLog(`Simulation projects <b>${currentAsset.name}</b> crosses critical risk (≥70%) around <b>day ${failDay}</b> if load/thermal trend continues. Recommend inspection before then.`, 'crit');
      } else {
        addLog(`Simulation for <b>${currentAsset.name}</b> stayed under critical threshold across the 30-day horizon. No immediate action needed.`, 'ok');
      }
      const peak = Math.round(Math.max(...points));
      addLog(`Peak projected risk: ${peak}% at day ${days}. Model confidence 96%, based on current Sensor Mesh calibration.`, peak>=40?'warn':'ok');
    }
  }, 45);
});

btnReset.addEventListener('click', ()=>{
  sldLoad.value = currentAsset.baseLoad;
  sldTemp.value = currentAsset.baseTemp;
  sldVibm.value = currentAsset.baseVibm;
  updateLabels();
  clearChart();
  addLog(`Scenario reset to live baseline for <b>${currentAsset.name}</b>.`, 'ok');
});

/* live threshold watcher — flags when manual slider drag pushes into new risk band */
let lastBand = 'ok';
setInterval(()=>{
  const risk = computeRisk(parseFloat(sldLoad.value), parseFloat(sldTemp.value), parseFloat(sldVibm.value));
  const band = risk>=70?'crit':risk>=40?'warn':'ok';
  if(band !== lastBand){
    if(band==='warn') addLog(`${currentAsset.name} entered the watch window (risk ${Math.round(risk)}%) under current scenario inputs.`, 'warn');
    if(band==='crit') addLog(`${currentAsset.name} crossed the critical threshold (risk ${Math.round(risk)}%). Twin recommends scheduling maintenance.`, 'crit');
    if(band==='ok' && lastBand!=='ok') addLog(`${currentAsset.name} returned to nominal range (risk ${Math.round(risk)}%).`, 'ok');
    lastBand = band;
  }
}, 1200);

/* footer clock */
function tickClock(){
  document.getElementById('footer-clock').textContent = new Date().toLocaleString();
}
tickClock(); clockInterval = setInterval(tickClock, 1000);

    // --- end script.js ---

    return () => {
      unmounted = true;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (watchInterval) clearInterval(watchInterval);
      if (clockInterval) clearInterval(clockInterval);
      if (animInterval) clearInterval(animInterval);
      
      const wrap = document.getElementById('twin-canvas-wrap');
      if (wrap) {
        wrap.querySelectorAll('canvas').forEach(c => c.remove());
      }
    };
  }, []);

  return (
    <>
      <div className="grid-bg"></div>
      <div className="wrap">
        <header>
          <div className="brand">
            <div className="brand-mark">DT</div>
            <div className="brand-text">
              <div className="name">Meridian Twin</div>
              <div className="sub">Industrial Digital Twin Platform</div>
            </div>
          </div>
          <div className="layer-pill"><span className="dot"></span>Layer 03 &middot; Digital Twin &middot; Simulation Live</div>
        </header>

        <div className="hero">
          <div className="eyebrow">Scenario &amp; Failure Prediction Engine</div>
          <h1>Stress-test the <span>virtual replica</span> before the real asset ever feels it.</h1>
          <p>Every sensor reading from the mesh below feeds a live physical model of each machine. Push load, heat, and vibration past their real-world limits here first &mdash; the twin will show you exactly where and when it breaks.</p>
        </div>

        <div className="stage">
          {/* LEFT: asset fleet */}
          <div className="panel">
            <div className="panel-title">Fleet <span id="fleet-count">3 assets</span></div>
            <div className="asset-list" id="asset-list"></div>
            <div className="divider"></div>
            <div className="panel-title">Twin Legend</div>
            <div className="legend">
              <div><span className="sw" style={{ background: 'var(--green)' }}></span> Nominal &mdash; within tolerance</div>
              <div><span className="sw" style={{ background: 'var(--amber)' }}></span> Elevated &mdash; watch window</div>
              <div><span className="sw" style={{ background: 'var(--red)' }}></span> Critical &mdash; action required</div>
            </div>
          </div>

          {/* CENTER: 3D viewport */}
          <div className="panel viewport-panel">
            <div className="viewport-head">
              <div>
                <div className="name" id="vp-asset-name">Pump Skid 04</div>
                <div className="tag">Centrifugal pump &middot; Bldg 2, Line C</div>
              </div>
              <div className="tag" id="vp-clock">Model time &middot; T+00:00</div>
            </div>
            <div id="twin-canvas-wrap">
              <div className="hud">
                <div className="hud-chip"><div className="lbl">Vibration</div><div className="val" id="hud-vib">0.00 mm/s</div></div>
                <div className="hud-chip"><div className="lbl">Bearing Temp</div><div className="val" id="hud-temp">0&deg;C</div></div>
                <div className="hud-chip"><div className="lbl">Load</div><div className="val" id="hud-load">0%</div></div>
              </div>
              <div className="risk-gauge">
                <div className="lbl">Failure Risk</div>
                <div className="num" id="risk-num" style={{ color: 'var(--green)' }}>4%</div>
                <div className="risk-bar"><div className="risk-bar-fill" id="risk-bar-fill"></div></div>
                <div className="risk-note" id="risk-eta">RUL: 210 days</div>
              </div>
            </div>
            <div className="viewport-foot">
              <div className="telemetry-mini">
                <div className="tm-item">Sensor Mesh sync <b id="sync-status">OK</b></div>
                <div className="tm-item">Model confidence <b id="model-conf">96%</b></div>
                <div className="tm-item">Last calibrated <b>6h ago</b></div>
              </div>
              <div className="tm-item">Drag to orbit &middot; scroll to zoom</div>
            </div>
          </div>

          {/* RIGHT: scenario controls */}
          <div className="panel">
            <div className="panel-title">Scenario Controls</div>

            <div className="slider-row">
              <label>Load <b id="lbl-load">62%</b></label>
              <input type="range" id="sld-load" min="0" max="130" defaultValue="62" />
            </div>
            <div className="slider-row">
              <label>Ambient Temp <b id="lbl-temp">28&deg;C</b></label>
              <input type="range" id="sld-temp" min="10" max="65" defaultValue="28" />
            </div>
            <div className="slider-row">
              <label>Vibration Multiplier <b id="lbl-vibm">1.0&times;</b></label>
              <input type="range" id="sld-vibm" min="5" max="40" defaultValue="10" />
            </div>

            <button className="btn" id="btn-run">&#9654; Run 30-Day Stress Test</button>
            <button className="btn secondary" id="btn-reset">Reset to Live Baseline</button>

            <div className="divider"></div>
            <div className="panel-title">Model Basis</div>
            <div className="legend">
              <div>Inputs: vibration, thermal &amp; load streams from Sensor Mesh (Layer 01)</div>
              <div>Output: feeds predictive alerts to Core Edge (Layer 02) and fleet reports to Cloud Uplink (Layer 04)</div>
            </div>
          </div>
        </div>

        {/* LOWER: chart + log */}
        <div className="lower">
          <div className="panel">
            <div className="panel-title">Predicted Failure Risk &mdash; Simulation Horizon <span id="chart-status">idle</span></div>
            <canvas id="risk-chart"></canvas>
            <div className="chart-legend">
              <div><span className="ln" style={{ background: 'var(--cyan)' }}></span> Projected risk</div>
              <div><span className="ln" style={{ background: 'var(--red)' }}></span> Critical threshold (70%)</div>
              <div><span className="ln" style={{ background: 'var(--amber)' }}></span> Watch threshold (40%)</div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">Predictive Maintenance Log</div>
            <div className="log-list" id="log-list">
              <div className="log-empty">No events yet &mdash; run a stress test or adjust load to generate predictions.</div>
            </div>
          </div>
        </div>

        <footer>
          <div>Meridian Twin &middot; Digital Twin Layer &middot; read-only simulation, no live actuation</div>
          <div id="footer-clock"></div>
        </footer>
      </div>
    </>
  );
}


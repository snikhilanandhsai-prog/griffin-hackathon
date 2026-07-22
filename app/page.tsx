// @ts-nocheck
"use client";

import Script from "next/script";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function DashboardPage() {

  // Called once script.js has fully loaded and executed (init() already ran at bottom of script.js)
  function onScriptReady() {
    // ── Supabase auth guard & session badge ──────────────────────
    function waitForSupabase(cb) {
      if (typeof window !== "undefined" && window.supabase) {
        cb(window.supabase);
      } else {
        setTimeout(() => waitForSupabase(cb), 50);
      }
    }

    waitForSupabase((_sbLib) => {
      const _sb = _sbLib.createClient(SUPABASE_URL, SUPABASE_KEY);

      // Auth guard
      (async function () {
        const auth = sessionStorage.getItem("infraai-auth");
        const { data } = await _sb.auth.getSession();
        if (!data || !data.session) {
          sessionStorage.removeItem("infraai-auth");
          window.location.replace("/login");
        } else {
          sessionStorage.setItem("infraai-auth", "user");
          sessionStorage.setItem("infraai-user", data.session.user.email);
        }
      })();

      // Session badge
      (function () {
        const auth = sessionStorage.getItem("infraai-auth");
        const user = sessionStorage.getItem("infraai-user");
        const label = document.getElementById("session-label");
        if (!label) return;
        if (user) label.textContent = "✦ " + user;
        else label.textContent = "✦ USER";
      })();

      // Logout
      window.doLogout = async function () {
        await _sb.auth.signOut();
        sessionStorage.removeItem("infraai-auth");
        sessionStorage.removeItem("infraai-user");
        window.location.href = "/login";
      };
    });
  }

  return (
    <>
      <Script id="supabase-env" strategy="beforeInteractive">
        {`window.SUPABASE_ENV = { url: "${SUPABASE_URL}", key: "${SUPABASE_KEY}" };`}
      </Script>
      {/* App script — script.js calls init() at the bottom automatically */}
      <Script
        src="/script.js"
        strategy="afterInteractive"
        onLoad={onScriptReady}
      />

      {/* Override body display for sidebar+main layout */}
      <style>{`
        body { display: flex !important; height: 100vh !important; overflow: hidden !important; }
      `}</style>

      {/* ── SIDEBAR ── */}
      <div id="sidebar">
        <div id="sidebar-head">
          <div className="brand">
            Infra<span>AI</span>
          </div>
          <div className="sub">FLEET MONITOR</div>

          {/* Session badge */}
          <div id="session-badge">
            <span id="session-label"></span>
            <button
              className="logout-btn"
              onClick={() => window.doLogout?.()}
            >
              LOGOUT
            </button>
          </div>

          {/* Theme toggle — calls script.js setTheme() */}
          <div className="theme-toggle">
            <button
              className="theme-btn"
              id="theme-btn-night"
              onClick={() => window.setTheme?.("night")}
            >
              🌙 NIGHT
            </button>
            <button
              className="theme-btn"
              id="theme-btn-day"
              onClick={() => window.setTheme?.("day")}
            >
              ☀ DAY
            </button>
          </div>
        </div>

        <div id="asset-list"></div>
        <button
          id="add-asset-btn"
          onClick={() => window.openAssetModal?.()}
        >
          + Add asset
        </button>

      </div>

      {/* ── MAIN PANEL ── */}
      <div id="main">
        <div id="empty-state">
          <div className="big">◎</div>
          <div>Add an asset to start monitoring</div>
        </div>
      </div>

      {/* ── ADD ASSET MODAL ── */}
      <div className="modal-overlay" id="asset-modal">
        <div className="modal">
          <h3>Add asset</h3>
          <div className="form-row">
            <div className="field">
              <label>Name</label>
              <input id="na-name" placeholder="e.g. Pump Station 3" />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Type</label>
              <select
                id="na-type"
                onChange={() => window.onTypeChange?.()}
              >
                <option value="motor">Motor</option>
                <option value="pump">Pump</option>
                <option value="conveyor">Conveyor</option>
                <option value="generator">Generator</option>
                <option value="custom">Custom / Other</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Parameters tracked</label>
            <div className="param-chip-row" id="na-params"></div>
            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <input
                id="na-param-input"
                placeholder="add parameter (e.g. pressure_psi)"
                style={{ flex: 1 }}
              />
              <button className="btn" onClick={() => window.addParamChip?.()}>
                Add
              </button>
            </div>
            <div className="hint">
              Defaults are filled in for the selected type — add or remove as needed.
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => window.closeAssetModal?.()}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={() => window.createAsset?.()}
            >
              Create asset
            </button>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      <div className="toast" id="toast"></div>


    </>
  );
}

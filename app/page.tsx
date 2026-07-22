// @ts-nocheck
"use client";

import Script from "next/script";
import { useState, useRef, useEffect } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function DashboardPage() {
  const [showSupport, setShowSupport] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "bot"; text: string }[]>([
    { role: "bot", text: "Hello! I am here to help you find mistakes, machine errors, or loopholes. How can I assist you?" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, showSupport]);

  const handleSupportSend = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");

    setTimeout(() => {
      const lower = userMsg.toLowerCase();
      let reply = "I'm sorry, I couldn't fully understand that. If you're stuck, remember you can always reach out to our human support team.";
      if (lower.includes("mistake") || lower.includes("error") || lower.includes("failed")) {
        reply = "It looks like you're encountering an error. Please double-check your input parameters. If the machine continues to fail, it might be a deeper loophole in the configuration.";
      } else if (lower.includes("loophole") || lower.includes("bug")) {
        reply = "Our system is designed to be robust, but loopholes can occur. Can you provide more details about the unexpected behavior?";
      } else if (lower.includes("help")) {
        reply = "I am the Support Bot. I can help you identify mistakes, machine errors, or configuration loopholes. What issue are you facing today?";
      }
      setChatMessages((prev) => [...prev, { role: "bot", text: reply }]);
    }, 600);
  };

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
        <button
          className="btn"
          style={{ margin: '0 10px 10px', background: 'transparent', border: '1px dashed var(--line)', color: 'var(--muted)', textAlign: 'center' }}
          onClick={() => setShowSupport(true)}
        >
          ? Support Chat
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

      {/* ── SUPPORT MODAL ── */}
      {showSupport && (
        <div className="modal-overlay show" style={{ zIndex: 1000 }}>
          <div className="modal" style={{ width: '500px', display: 'flex', flexDirection: 'column', height: '600px', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Support Chatbot</h3>
              <button onClick={() => setShowSupport(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>&times;</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {chatMessages.map((m, i) => (
                <div key={i} style={{ 
                  maxWidth: '85%', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.5,
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  background: m.role === 'user' ? 'var(--cyan)' : 'var(--panel-2)',
                  color: m.role === 'user' ? '#001014' : 'var(--text)',
                  border: m.role === 'bot' ? '1px solid var(--line)' : 'none',
                  borderBottomRightRadius: m.role === 'user' ? '2px' : '8px',
                  borderBottomLeftRadius: m.role === 'bot' ? '2px' : '8px',
                  boxShadow: m.role === 'user' ? '0 2px 8px var(--glow-cyan)' : 'none'
                }}>
                  {m.text}
                </div>
              ))}
              <div ref={endOfMessagesRef} />
            </div>

            <div style={{ padding: '14px 20px', background: 'rgba(255,56,96,0.05)', borderTop: '1px solid rgba(255,56,96,0.2)', borderBottom: '1px solid var(--line)', fontSize: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><strong style={{ color: 'var(--red)' }}>Machine Failed?</strong> Call support:</div>
              <div style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)', fontWeight: 'bold', fontSize: '14px' }}>+91 7997012195</div>
            </div>

            <div style={{ padding: '20px', display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Describe your mistake or loophole..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSupportSend()}
                style={{ flex: 1 }}
              />
              <button className="btn primary" onClick={handleSupportSend}>Send</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

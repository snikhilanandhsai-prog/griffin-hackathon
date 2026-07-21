// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function RegisterPage() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Wait for Supabase UMD to be available
    function waitForSupabase(cb) {
      if (typeof window !== "undefined" && window.supabase) {
        cb(window.supabase);
      } else {
        setTimeout(() => waitForSupabase(cb), 50);
      }
    }

    waitForSupabase((sb) => {
      const _sb = sb.createClient(SUPABASE_URL, SUPABASE_KEY);

      // ── THEME ──────────────────────────────────────────────────
      function setTheme(t) {
        const root = document.getElementById("html-root");
        root.setAttribute("data-theme", t === "day" ? "day" : "");
        document.getElementById("btn-night").classList.toggle("active", t === "night");
        document.getElementById("btn-day").classList.toggle("active", t === "day");
        localStorage.setItem("infraai-theme", t);
      }

      window.setTheme = setTheme;
      const saved = localStorage.getItem("infraai-theme") || "night";
      setTheme(saved);

      // ── PASSWORD TOGGLE ────────────────────────────────────────
      window.togglePassword = function () {
        const pw = document.getElementById("password");
        const btn = document.getElementById("pw-toggle");
        if (pw.type === "password") {
          pw.type = "text";
          btn.textContent = "🙈";
        } else {
          pw.type = "password";
          btn.textContent = "👁";
        }
      };

      // ── ERROR / INFO ───────────────────────────────────────────
      window.showError = function (msg, isSuccess = false) {
        const el = document.getElementById("error-msg");
        document.getElementById("error-text").textContent = msg;
        
        if (isSuccess) {
            el.style.color = "var(--cyan)";
            el.style.borderColor = "rgba(0,240,255,0.3)";
            el.style.background = "rgba(0,240,255,0.07)";
        } else {
            el.style.color = "var(--magenta)";
            el.style.borderColor = "rgba(255,43,214,0.3)";
            el.style.background = "rgba(255,43,214,0.07)";
        }
        
        el.classList.add("show");
      };
      
      window.hideError = function () {
        document.getElementById("error-msg").classList.remove("show");
      };
      document.addEventListener("input", window.hideError);

      // ── REGISTER ──────────────────────────────────────────────────
      window.handleRegister = async function (e) {
        e.preventDefault();
        window.hideError();

        const email = document.getElementById("email").value.trim();
        const pass = document.getElementById("password").value;
        const btn = document.getElementById("register-btn");

        if (!email || !pass) {
          window.showError("Please fill in both email and password.");
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> REGISTERING…';

        try {
          const { data, error } = await _sb.auth.signUp({
            email,
            password: pass,
          });

          if (error) {
            btn.disabled = false;
            btn.innerHTML = "SIGN UP";
            window.showError(error.message);
            return;
          }

          // Registration successful
          btn.innerHTML = "SUCCESS";
          window.showError("✓ Registration successful! Please sign in.", true);
          setTimeout(() => {
            window.location.href = "/login";
          }, 2000);
          
        } catch {
          btn.disabled = false;
          btn.innerHTML = "SIGN UP";
          window.showError("Network error. Please check your connection and try again.");
        }
      };
    });
  }, []);

  return (
    <>
      {/* Animated background */}
      <div className="bg-grid"></div>
      <div className="orb orb-cyan"></div>
      <div className="orb orb-mag"></div>

      {/* Theme toggle */}
      <div className="top-bar">
        <div className="theme-toggle">
          <button className="theme-btn active" id="btn-night" onClick={() => window.setTheme?.("night")}>
            🌙 NIGHT
          </button>
          <button className="theme-btn" id="btn-day" onClick={() => window.setTheme?.("day")}>
            ☀ DAY
          </button>
        </div>
      </div>

      {/* Register card */}
      <div className="login-body">
        <div className="card" id="register-card">
          <div className="brand">
            Infra<span>AI</span>
          </div>
          <div className="sub">Fleet Monitor · Secure Access</div>

          <div className="status-row">
            <div className="status-dot-sm"></div>
            ALL SYSTEMS OPERATIONAL
          </div>

          <h1 className="card-title">Create an account</h1>
          <div className="card-sub">
            Sign up to access your monitoring dashboard.
          </div>

          {/* Error banner */}
          <div className="error-msg" id="error-msg" role="alert">
            <span>⚠</span>
            <span id="error-text"></span>
          </div>

          {/* Register form */}
          <form id="register-form" onSubmit={(e) => window.handleRegister?.(e)} noValidate>
            <div className="field-login">
              <label className="lbl" htmlFor="email">
                Email address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="operator@infraai.io"
                autoComplete="email"
                required
              />
            </div>

            <div className="field-login">
              <label className="lbl" htmlFor="password">
                Password
              </label>
              <div className="pw-wrap">
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="pw-toggle"
                  id="pw-toggle"
                  onClick={() => window.togglePassword?.()}
                  aria-label="Toggle password visibility"
                >
                  👁
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary" id="register-btn" style={{ marginTop: '24px' }}>
              SIGN UP
            </button>
          </form>

          <div className="card-footer" style={{ marginTop: '24px' }}>
            Already have an account?{" "}
            <a href="/login">
              Sign in
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

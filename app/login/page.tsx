// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function LoginPage() {
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

      // Expose to inline onclick handlers
      window.setTheme = setTheme;

      const saved = localStorage.getItem("infraai-theme") || "night";
      setTheme(saved);

      // If already signed in, skip login
      _sb.auth.getSession().then(({ data }) => {
        if (data && data.session) goToDashboard();
      });

      // Session check (only Supabase)
      const auth = sessionStorage.getItem("infraai-auth");

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
      window.showError = function (msg) {
        const el = document.getElementById("error-msg");
        document.getElementById("error-text").textContent = msg;
        el.classList.add("show");
      };
      window.hideError = function () {
        document.getElementById("error-msg").classList.remove("show");
      };
      document.addEventListener("input", window.hideError);

      // ── LOGIN ──────────────────────────────────────────────────
      window.handleLogin = async function (e) {
        e.preventDefault();
        window.hideError();

        const email = document.getElementById("email").value.trim();
        const pass = document.getElementById("password").value;
        const btn = document.getElementById("sign-in-btn");

        if (!email || !pass) {
          window.showError("Please fill in both email and password.");
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> AUTHENTICATING…';

        try {
          const { data, error } = await _sb.auth.signInWithPassword({
            email,
            password: pass,
          });

          if (error) {
            btn.disabled = false;
            btn.innerHTML = "SIGN IN";
            if (error.message.toLowerCase().includes("invalid login")) {
              window.showError("Incorrect email or password. Please try again.");
            } else if (error.message.toLowerCase().includes("email not confirmed")) {
              window.showError("Please confirm your email address before signing in.");
            } else {
              window.showError(error.message);
            }
            return;
          }

          sessionStorage.setItem("infraai-auth", "user");
          sessionStorage.setItem("infraai-user", data.user.email);
          goToDashboard();
        } catch {
          btn.disabled = false;
          btn.innerHTML = "SIGN IN";
          window.showError("Network error. Please check your connection and try again.");
        }
      };


      // ── REDIRECT ───────────────────────────────────────────────
      function goToDashboard() {
        const card = document.getElementById("login-card");
        if (!card) { window.location.href = "/"; return; }
        card.style.transition = "opacity .35s, transform .35s";
        card.style.opacity = "0";
        card.style.transform = "scale(.96) translateY(-12px)";
        setTimeout(() => { window.location.href = "/"; }, 380);
      }

      // ── FORGOT PASSWORD ────────────────────────────────────────
      window.showForgot = async function (e) {
        e.preventDefault();
        const email = document.getElementById("email").value.trim();
        if (!email) {
          window.showError("Enter your email address above, then click Forgot password.");
          document.getElementById("email").focus();
          return;
        }
        const btn = document.querySelector(".forgot");
        btn.textContent = "Sending…";
        const { error } = await _sb.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/login",
        });
        btn.textContent = "Forgot password?";
        if (error) {
          window.showError("Could not send reset email: " + error.message);
        } else {
          const errEl = document.getElementById("error-msg");
          errEl.style.color = "var(--cyan)";
          errEl.style.borderColor = "rgba(0,240,255,0.3)";
          errEl.style.background = "rgba(0,240,255,0.07)";
          window.showError("✓ Reset link sent! Check your inbox for " + email);
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

      {/* Login card */}
      <div className="login-body">
        <div className="card" id="login-card">
          <div className="brand">
            Infra<span>AI</span>
          </div>
          <div className="sub">Fleet Monitor · Secure Access</div>

          <div className="status-row">
            <div className="status-dot-sm"></div>
            ALL SYSTEMS OPERATIONAL
          </div>

          <h1 className="card-title">Welcome back</h1>
          <div className="card-sub">
            Sign in to access your monitoring dashboard, or continue without credentials.
          </div>

          {/* Error banner */}
          <div className="error-msg" id="error-msg" role="alert">
            <span>⚠</span>
            <span id="error-text">Invalid credentials. Please try again.</span>
          </div>

          {/* Sign-in form */}
          <form id="login-form" onSubmit={(e) => window.handleLogin?.(e)} noValidate>
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
                  autoComplete="current-password"
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

            <div className="row-meta">
              <label className="checkbox-label" htmlFor="remember-me">
                <input type="checkbox" id="remember-me" /> Remember me
              </label>
              <button className="forgot" onClick={(e) => window.showForgot?.(e)}>
                Forgot password?
              </button>
            </div>

            <button type="submit" className="btn-primary" id="sign-in-btn">
              SIGN IN
            </button>
          </form>


          <div className="card-footer">
            Need an account?{" "}
            <a href="/register">
              Sign up
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

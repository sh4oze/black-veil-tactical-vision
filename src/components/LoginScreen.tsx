import { useEffect, useRef, useState } from 'react';
import { attemptLogin, getLockoutStatus } from '../services/authService';

interface LoginScreenProps {
  onAuthenticated: () => void;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockRemainingMs, setLockRemainingMs] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    const status = getLockoutStatus();
    if (status.locked) setLockRemainingMs(status.remainingMs);
  }, []);

  useEffect(() => {
    if (lockRemainingMs <= 0) return;
    const id = window.setInterval(() => {
      setLockRemainingMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockRemainingMs]);

  const locked = lockRemainingMs > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await attemptLogin(email, password);
      if (result.ok) {
        onAuthenticated();
        return;
      }
      if (result.reason === 'locked') {
        setLockRemainingMs(result.remainingMs);
        setError('ACESSO BLOQUEADO TEMPORARIAMENTE');
      } else {
        setError(
          result.attemptsRemaining > 0
            ? `CREDENCIAIS INVÁLIDAS · ${result.attemptsRemaining} TENTATIVA(S) RESTANTE(S)`
            : 'CREDENCIAIS INVÁLIDAS',
        );
        setPassword('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="startup-screen login-screen">
      <div className="tactical-grid" />
      <div className="tactical-vignette" />
      <div className="tactical-noise" />

      <div className="startup-content login-content">
        <div className="startup-glyph">◈</div>
        <h1 className="startup-title">
          BLACK <span>VEIL</span>
        </h1>
        <p className="startup-subtitle">ACESSO RESTRITO</p>

        <div className="startup-divider" />

        <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
          <label className="login-field">
            <span className="login-label">IDENTIFICAÇÃO</span>
            <input
              ref={emailRef}
              type="email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@dominio.com"
              autoComplete="username"
              disabled={locked || submitting}
              required
            />
          </label>

          <label className="login-field">
            <span className="login-label">CHAVE DE ACESSO</span>
            <div className="login-password-row">
              <input
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                disabled={locked || submitting}
                required
              />
              <button
                type="button"
                className="login-toggle-visibility"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? 'OCULTAR' : 'EXIBIR'}
              </button>
            </div>
          </label>

          {locked && (
            <p className="login-lockout">SISTEMA BLOQUEADO · TENTE NOVAMENTE EM {formatRemaining(lockRemainingMs)}</p>
          )}
          {!locked && error && <p className="startup-error login-error">{error}</p>}

          <button className="btn-tactical btn-tactical-primary" type="submit" disabled={locked || submitting}>
            {submitting ? 'VERIFICANDO...' : 'AUTENTICAR'}
          </button>
        </form>

        <p className="startup-footnote">
          AUTENTICAÇÃO LOCAL · NENHUMA CREDENCIAL É ENVIADA A SERVIDORES EXTERNOS
        </p>
      </div>
    </div>
  );
}

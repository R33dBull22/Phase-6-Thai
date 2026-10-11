import React, { useState } from 'react';
import { X, Lock, Mail, User, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, loginAsGuest, authError, clearAuthError } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setLocalError(null);
    setSuccessMessage(null);
    clearAuthError();
    onClose();
  };

  const handleGoogle = async () => {
    setIsSubmitting(true);
    setLocalError(null);
    setSuccessMessage(null);
    clearAuthError();
    try {
      await loginWithGoogle();
      setSuccessMessage('Erfolgreich mit Google angemeldet!');
      setTimeout(() => {
        handleClose();
      }, 600);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setLocalError(err.message || 'Google-Login fehlgeschlagen.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);
    clearAuthError();

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setLocalError('Bitte E-Mail und Passwort eingeben.');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setLocalError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }

    if (cleanPassword.length < 6) {
      setLocalError('Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegister) {
        await registerWithEmail(cleanEmail, cleanPassword, displayName.trim());
        setSuccessMessage('Konto erfolgreich erstellt! Willkommen!');
      } else {
        await loginWithEmail(cleanEmail, cleanPassword);
        setSuccessMessage('Erfolgreich angemeldet!');
      }

      // Brief delay to display positive confirmation
      setTimeout(() => {
        handleClose();
      }, 700);
    } catch (err: any) {
      const msg = err.message || 'Authentifizierungsfehler';
      // Clean up common technical error messages into clear German
      if (msg.includes('bereits registriert') || msg.includes('email-already-in-use')) {
        setLocalError('Diese E-Mail ist bereits registriert. Bitte wähle den Tab „Anmelden“.');
      } else if (msg.includes('Falsches Passwort') || msg.includes('wrong-password') || msg.includes('INVALID_LOGIN_CREDENTIALS')) {
        setLocalError('Falsches Passwort. Bitte überprüfe deine Eingabe.');
      } else if (msg.includes('Kein Konto') || msg.includes('user-not-found')) {
        setLocalError('Kein Konto mit dieser E-Mail gefunden. Bitte erstelle zuerst ein Konto.');
      } else {
        setLocalError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuest = async () => {
    setIsSubmitting(true);
    setLocalError(null);
    try {
      await loginAsGuest();
      handleClose();
    } catch (err: any) {
      setLocalError(err.message || 'Gast-Modus nicht verfügbar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentError = localError || authError;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#1C1C1E] border border-[#2C2C2E] rounded-t-3xl sm:rounded-3xl p-6 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2C2C2E] mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🇹🇭</span>
            <h2 className="text-base font-bold text-white">
              {isRegister ? 'Konto erstellen' : 'Bei phase6 anmelden'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1-Click Google Sign-in */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={isSubmitting}
          className="w-full py-2.5 px-3 mb-4 rounded-xl bg-white text-gray-900 font-semibold text-xs flex items-center justify-center gap-2.5 hover:bg-gray-100 transition shadow cursor-pointer disabled:opacity-50"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Mit Google fortfahren</span>
        </button>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-[#2C2C2E]" />
          <span className="text-[10px] uppercase font-semibold text-[#8E8E93]">oder mit E-Mail</span>
          <div className="flex-1 h-px bg-[#2C2C2E]" />
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-[#242426] rounded-xl border border-[#323236] mb-4 text-xs font-semibold">
          <button
            onClick={() => {
              setIsRegister(false);
              setLocalError(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-1.5 rounded-lg transition-colors ${
              !isRegister ? 'bg-[#FF7A00] text-black shadow' : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            Anmelden
          </button>
          <button
            onClick={() => {
              setIsRegister(true);
              setLocalError(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-1.5 rounded-lg transition-colors ${
              isRegister ? 'bg-[#FF7A00] text-black shadow' : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            Registrieren
          </button>
        </div>

        {/* Success Message Banner */}
        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Message Banner */}
        {currentError && !successMessage && (
          <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs leading-relaxed">
            {currentError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1 font-medium">Name (Optional)</label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8E8E93] absolute left-3 top-3" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Dein Name"
                  autoComplete="name"
                  className="w-full pl-9 pr-3 py-2 bg-[#242426] border border-[#323236] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF7A00]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-[#8E8E93] mb-1 font-medium">E-Mail</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#8E8E93] absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
                autoComplete="email"
                required
                className="w-full pl-9 pr-3 py-2 bg-[#242426] border border-[#323236] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF7A00]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#8E8E93] mb-1 font-medium">Passwort</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8E8E93] absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                className="w-full pl-9 pr-10 py-2 bg-[#242426] border border-[#323236] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF7A00]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-2.5 text-[#8E8E93] hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-1 flex items-center gap-1.5 text-[11px] text-[#8E8E93]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF7A00] shrink-0" />
            <span>Alle deine Vokabeln & Phasen werden in deinem Profil gesichert.</span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || Boolean(successMessage)}
            className="w-full py-3 rounded-full bg-[#FF7A00] text-black font-semibold text-xs hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] mt-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting
              ? 'Wird verarbeitet...'
              : isRegister
              ? 'Konto jetzt erstellen'
              : 'Anmelden'}
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-[#2C2C2E] text-center">
          <button
            onClick={handleGuest}
            disabled={isSubmitting}
            className="text-xs text-[#8E8E93] hover:text-[#FF7A00] transition-colors"
          >
            Ohne Anmeldung als Gast fortfahren &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};

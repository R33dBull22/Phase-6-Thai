import React, { useState } from 'react';
import { X, Lock, Mail, User, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithEmail, registerWithEmail, loginAsGuest, authError, clearAuthError } = useAuth();
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

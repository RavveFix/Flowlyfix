import React, { useState } from 'react';
import { Loader2, AlertCircle, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/shared/lib/supabase/client';

const isSelfSignupEnabled = ((import.meta as any).env?.VITE_ENABLE_SELF_SIGNUP ?? '').toString().toLowerCase() === 'true';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: adminName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const session = signUpData.session;
    if (!session?.access_token) {
      setInfo('Kontot skapades. Verifiera e-post och logga in, skapa sedan företag från signup-flödet igen.');
      setLoading(false);
      return;
    }

    const { error: signupOrgError } = await supabase.functions.invoke('self-signup-organization', {
      body: {
        organization_name: organizationName,
        admin_full_name: adminName,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (signupOrgError) {
      setError(signupOrgError.message);
      setLoading(false);
      return;
    }

    navigate('/admin/dashboard', { replace: true });
  };

  if (!isSelfSignupEnabled) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Self-signup disabled</h1>
          <p className="text-sm text-slate-500 mb-6">Be din administratör om en inbjudan.</p>
          <Link to="/login" className="inline-flex text-sm font-semibold text-slate-700 hover:text-slate-900">
            Till login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Skapa företag</h1>
        <p className="text-sm text-slate-500 mb-6">Registrera admin-konto och företag.</p>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            {error}
          </div>
        )}

        {!error && info && (
          <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            {info}
          </div>
        )}

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Företagsnamn</label>
            <input
              type="text"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Adminnamn</label>
            <input
              type="text"
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-post</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lösenord</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 transition flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {loading ? 'Skapar...' : 'Skapa konto'}
          </button>

          <Link to="/login" className="inline-flex text-sm font-semibold text-slate-700 hover:text-slate-900">
            Har redan konto? Logga in
          </Link>
        </form>
      </div>
    </div>
  );
};

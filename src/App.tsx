import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { ProtectedRoute } from './components/ProtectedRoute';

import Dashboard from './pages/Dashboard';

function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await signIn(email, password);
    if (r.error) setErr(r.error);
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow w-96 space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">LEXORA — Sign in</h1>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <input className="w-full border rounded-lg px-3 py-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full border rounded-lg px-3 py-2" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="w-full bg-slate-900 text-white py-2 rounded-lg">Sign in</button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import Clients from './pages/Clients';
import Cases from './pages/Cases';
import Tasks from './pages/Tasks';
import Hearings from './pages/Hearings';
import Documents from './pages/Documents';
import Financial from './pages/Financial';
function Register() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await signUp(email, password, name);
    if (r.error) setErr(r.error); else setOk(true);
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow w-96 space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">LEXORA — Create account</h1>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        {ok && <p className="text-green-600 text-sm">Check your email to verify.</p>}
        <input className="w-full border rounded-lg px-3 py-2" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} />
        <input className="w-full border rounded-lg px-3 py-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full border rounded-lg px-3 py-2" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="w-full bg-slate-900 text-white py-2 rounded-lg">Create account</button>
      </form>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/cases" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/hearings" element={<ProtectedRoute><Hearings /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
      <Route path="/financial" element={<ProtectedRoute><Financial /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
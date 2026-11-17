import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { ProtectedRoute } from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import { Recover, VerifyEmail, NewPassword, TwoFactor } from './pages/AuthFlow';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Cases from './pages/Cases';
import Tasks from './pages/Tasks';
import Hearings from './pages/Hearings';
import Documents from './pages/Documents';
import Financial from './pages/Financial';
import Settings from './pages/Settings';

export default function App() {
  const { user } = useAuth();
  const guest = (element: React.ReactNode) => (user ? <Navigate to="/" replace /> : element);

  return (
    <Routes>
      <Route path="/login" element={guest(<Login />)} />
      <Route path="/register" element={guest(<Register />)} />
      <Route path="/recover" element={guest(<Recover />)} />
      <Route path="/newpassword" element={<NewPassword />} />
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="/2fa" element={<TwoFactor />} />

      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/cases" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/hearings" element={<ProtectedRoute><Hearings /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
      <Route path="/financial" element={<ProtectedRoute><Financial /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

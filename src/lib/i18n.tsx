import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

const dict: Record<string, Record<string, string>> = {
  en: { dashboard: 'Dashboard', clients: 'Clients', cases: 'Cases', tasks: 'Tasks', hearings: 'Hearings', documents: 'Documents', financial: 'Financial', settings: 'Settings', signout: 'Sign out' },
  fr: { dashboard: 'Tableau de bord', clients: 'Clients', cases: 'Dossiers', tasks: 'Tâches', hearings: 'Audiences', documents: 'Documents', financial: 'Finances', settings: 'Paramètres', signout: 'Déconnexion' },
  ar: { dashboard: 'لوحة التحكم', clients: 'العملاء', cases: 'الملفات', tasks: 'المهام', hearings: 'الجلسات', documents: 'الوثائق', financial: 'المالية', settings: 'الإعدادات', signout: 'تسجيل الخروج' },
};

interface Ctx { lang: string; setLang: (l: string) => void; t: (k: string) => string; rtl: boolean; }
const C = createContext<Ctx | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState('fr');
  const rtl = lang === 'ar';
  return <C.Provider value={{ lang, setLang, t: (k) => dict[lang]?.[k] ?? k, rtl }}>{children}</C.Provider>;
}
export function useI18n() { const c = useContext(C); if (!c) throw new Error('no i18n'); return c; }
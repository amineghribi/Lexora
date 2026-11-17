import { useI18n } from '../lib/i18n';
export default function Settings() {
  const { lang, setLang, rtl } = useI18n();
  return (
    <div className="min-h-screen bg-slate-50 p-8" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <div className="bg-white rounded-xl border p-4">
          <label className="text-sm">Language</label>
          <select className="border rounded-lg px-3 py-2 ml-2" value={lang} onChange={e=>setLang(e.target.value)}>
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
        <div className="bg-white rounded-xl border p-4 text-sm text-slate-600">
          Subscription plans: Free Trial, Solo, Professional, Business (management UI placeholder — payment provider not integrated).
        </div>
      </div>
    </div>
  );
}
import { useNavigate, useLocation } from 'react-router-dom';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { getOrCreateOrg } from '../lib/org';
import { listCases } from '../services/cases';
import { getFees, setFee, listPayments, addPayment } from '../services/financial';
import { applyShell, esc, hydrateChrome, shellClick, withShell } from '../lib/stitch';

const mainContent = `
<div class="flex flex-col w-full gap-space-lg">
  <div class="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm">
    <h1 class="font-headline-xl text-headline-xl text-on-surface tracking-tight">Honoraires &amp; Règlements</h1>
    <p class="font-body-md text-body-md text-on-surface-variant mt-0.5">Suivi des honoraires et règlements en dinars tunisiens (TND).</p>
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
    <div class="lg:col-span-1 bg-surface-container-lowest rounded-xl shadow-sm p-space-lg">
      <h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface mb-space-sm">Dossiers</h2>
      <div id="lexora-fin-cases" class="flex flex-col gap-space-xs"></div>
    </div>
    <div class="lg:col-span-2 flex flex-col gap-space-lg">
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg">
        <h2 class="font-headline-md text-headline-md text-on-surface" id="lexora-fin-title">Sélectionnez un dossier</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-space-md mt-space-md">
          <div class="p-space-md rounded-lg bg-surface-container-low"><span class="font-label-sm text-label-sm text-on-surface-variant uppercase">Honoraires convenus</span><div class="font-headline-md text-headline-md text-on-surface" id="lexora-fin-fee">—</div></div>
          <div class="p-space-md rounded-lg bg-surface-container-low"><span class="font-label-sm text-label-sm text-on-surface-variant uppercase">Réglé</span><div class="font-headline-md text-headline-md text-on-surface" id="lexora-fin-paid">—</div></div>
          <div class="p-space-md rounded-lg bg-surface-container-low"><span class="font-label-sm text-label-sm text-on-surface-variant uppercase">Solde</span><div class="font-headline-md text-headline-md text-on-surface" id="lexora-fin-balance">—</div></div>
        </div>
        <form id="lexora-fee-form" class="flex gap-space-sm mt-space-md">
          <input name="amount" type="number" min="0" step="0.001" required placeholder="Honoraires (TND)" class="h-10 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none flex-1" />
          <button type="submit" class="h-10 px-space-md rounded-lg bg-primary text-on-primary font-label-md font-semibold">Enregistrer</button>
        </form>
      </div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg">
        <h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface mb-space-sm">Règlements</h2>
        <form id="lexora-payment-form" class="flex gap-space-sm mb-space-md">
          <input name="amount" type="number" min="0" step="0.001" required placeholder="Montant (TND)" class="h-10 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none flex-1" />
          <input name="method" placeholder="Mode" class="h-10 px-space-md rounded-lg bg-surface-container-low text-on-surface outline-none w-32" />
          <button type="submit" class="h-10 px-space-md rounded-lg bg-primary text-on-primary font-label-md font-semibold">Ajouter</button>
        </form>
        <div id="lexora-payment-list" class="divide-y divide-surface-container"></div>
      </div>
    </div>
  </div>
</div>`;

const html = withShell(mainContent, 'Honoraires & Règlements');

const money = (value: number) =>
  new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value) + ' TND';

export default function Financial() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const setup = (root: HTMLElement) => {
    const opts = { navigate, pathname, signOut };
    applyShell(root, opts);
    void hydrateChrome(root, user);
    root.onclick = (event) => shellClick(event, root, opts);

    const casesBox = root.querySelector<HTMLElement>('#lexora-fin-cases')!;
    const paymentsBox = root.querySelector<HTMLElement>('#lexora-payment-list')!;
    const title = root.querySelector<HTMLElement>('#lexora-fin-title')!;
    const feeEl = root.querySelector<HTMLElement>('#lexora-fin-fee')!;
    const paidEl = root.querySelector<HTMLElement>('#lexora-fin-paid')!;
    const balanceEl = root.querySelector<HTMLElement>('#lexora-fin-balance')!;
    const feeForm = root.querySelector<HTMLFormElement>('#lexora-fee-form')!;
    const paymentForm = root.querySelector<HTMLFormElement>('#lexora-payment-form')!;
    let orgId: string | null = null;
    let selected: string | null = null;

    const loadDetails = async () => {
      if (!orgId || !selected) return;
      const [fees, payments] = await Promise.all([getFees(orgId, selected), listPayments(orgId, selected)]);
      const fee = Number(fees?.agreed_amount ?? 0);
      const paid = payments.reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
      feeEl.textContent = money(fee);
      paidEl.textContent = money(paid);
      balanceEl.textContent = money(Math.max(0, fee - paid));
      paymentsBox.innerHTML = payments.length
        ? payments.map((p: any) => `<div class="flex items-center justify-between py-space-sm"><div class="flex flex-col"><span class="font-body-md text-body-md text-on-surface">${esc(p.method || 'Règlement')}</span><span class="font-label-sm text-label-sm text-on-surface-variant">${esc(p.payment_date || '')}</span></div><span class="font-tabular-mono font-semibold text-on-surface">${money(Number(p.amount ?? 0))}</span></div>`).join('')
        : '<p class="py-space-md text-body-sm text-on-surface-variant">Aucun règlement.</p>';
    };

    const load = async () => {
      if (!user) return;
      orgId = await getOrCreateOrg(user.id);
      if (!orgId) return;
      const { data } = await listCases(orgId);
      const cases = data ?? [];
      casesBox.innerHTML = cases.length
        ? cases.map((c: any) => `<button data-fin-case="${esc(c.id)}" class="text-left p-space-sm rounded-lg hover:bg-surface-container-low transition-colors ${selected === c.id ? 'bg-secondary-container/40' : ''}"><span class="block font-body-sm text-body-sm font-semibold text-on-surface truncate">${esc(c.title)}</span><span class="font-label-sm text-label-sm text-on-surface-variant">${esc(c.reference || '')}</span></button>`).join('')
        : '<p class="text-body-sm text-on-surface-variant">Aucun dossier.</p>';
      if (!selected && cases[0]) {
        selected = cases[0].id;
        title.textContent = cases[0].title;
        await loadDetails();
      }
    };

    casesBox.onclick = async (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLElement>('[data-fin-case]');
      if (!button) return;
      selected = button.dataset.finCase!;
      const cases = await listCases(orgId!);
      const current = cases.data?.find((c: any) => c.id === selected);
      if (current) title.textContent = current.title;
      await load();
      await loadDetails();
    };

    feeForm.onsubmit = async (event) => {
      event.preventDefault();
      if (!orgId || !selected) return;
      const data = new FormData(feeForm);
      await setFee(orgId, selected, Number(data.get('amount')));
      feeForm.reset();
      await loadDetails();
    };

    paymentForm.onsubmit = async (event) => {
      event.preventDefault();
      if (!orgId || !selected) return;
      const data = new FormData(paymentForm);
      await addPayment(orgId, selected, Number(data.get('amount')), String(data.get('method') || 'Espèces'));
      paymentForm.reset();
      await loadDetails();
    };

    void load();
  };

  return <StitchPage html={html} setup={setup} />;
}

import { useNavigate } from 'react-router-dom';
import raw from '../stitch/login.html?raw';
import StitchPage from '../components/StitchPage';
import { useAuth } from '../lib/auth';
import { useI18n, wireLangChips } from '../lib/i18n';

// Keep the Stitch markup, only point the help link at a real route and add
// a register link for new practices.
const html = raw
  .replace('href="#">Mot de passe oublié ?', 'href="/recover">Mot de passe oublié ?')
  .replace(
    '</form>',
    '</form><p class="text-center text-body-sm text-body-sm text-secondary pt-space-sm">Pas encore de cabinet ? ' +
      '<a class="text-on-surface font-semibold underline hover:text-primary" href="/register">Créer un compte</a></p>',
  );

export default function Login() {
  const { signIn } = useAuth();
  const { setLang } = useI18n();
  const navigate = useNavigate();

  const setup = (root: HTMLElement) => {
    const form = root.querySelector<HTMLFormElement>('#lexora-login-form');
    const email = root.querySelector<HTMLInputElement>('#user-email');
    const password = root.querySelector<HTMLInputElement>('#user-password');
    const button = root.querySelector<HTMLButtonElement>('#login-btn');
    const buttonText = root.querySelector<HTMLElement>('#btn-text');
    const buttonIcon = root.querySelector<HTMLElement>('#btn-icon');

    const error = document.createElement('p');
    error.className = 'hidden text-body-sm text-error bg-error-container/40 rounded-lg px-space-md py-space-sm';
    form?.after(error);

    if (form) {
      form.onsubmit = async (event) => {
        event.preventDefault();
        error.classList.add('hidden');
        if (button) button.disabled = true;
        if (buttonText) buttonText.textContent = 'Vérification des identifiants...';
        if (buttonIcon) {
          buttonIcon.textContent = 'sync';
          buttonIcon.classList.add('animate-spin');
        }
        const { error: message } = await signIn(email?.value ?? '', password?.value ?? '');
        if (button) button.disabled = false;
        if (buttonIcon) buttonIcon.classList.remove('animate-spin');
        if (message) {
          error.textContent = message;
          error.classList.remove('hidden');
          if (buttonText) buttonText.textContent = 'Se connecter à mon cabinet';
          if (buttonIcon) buttonIcon.textContent = 'key';
        } else {
          if (buttonText) buttonText.textContent = 'Accès autorisé';
          if (buttonIcon) buttonIcon.textContent = 'check_circle';
          navigate('/');
        }
      };
    }

    const toggle = root.querySelector<HTMLButtonElement>('#toggle-pwd-btn');
    const icon = root.querySelector<HTMLElement>('#pwd-icon');
    if (toggle && password && icon) {
      toggle.onclick = () => {
        const reveal = password.type === 'password';
        password.type = reveal ? 'text' : 'password';
        password.classList.toggle('tracking-widest', !reveal);
        icon.textContent = reveal ? 'visibility_off' : 'visibility';
      };
    }

    wireLangChips(root, setLang);
  };

  return <StitchPage html={html} setup={setup} />;
}

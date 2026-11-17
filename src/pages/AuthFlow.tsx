import { useNavigate } from 'react-router-dom';
import StitchPage from '../components/StitchPage';
import { supabase } from '../lib/supabase';
import recoverRaw from '../stitch/recover.html?raw';
import verifyRaw from '../stitch/verify.html?raw';
import newPasswordRaw from '../stitch/newpassword.html?raw';
import twoFactorRaw from '../stitch/2fa.html?raw';

function messageBox(): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'mt-space-md text-body-sm text-error text-center';
  return p;
}

export function Recover() {
  const setup = (root: HTMLElement) => {
    const form = root.querySelector<HTMLFormElement>('#recoveryForm');
    const email = root.querySelector<HTMLInputElement>('#recoveryEmail');
    if (!form) return;
    const box = messageBox();
    form.appendChild(box);
    form.onsubmit = async (event) => {
      event.preventDefault();
      const { error } = await supabase.auth.resetPasswordForEmail(email?.value ?? '', {
        redirectTo: `${window.location.origin}/newpassword`,
      });
      box.textContent = error ? error.message : 'Un lien de réinitialisation a été envoyé à votre adresse.';
      box.className = `mt-space-md text-body-sm text-center ${error ? 'text-error' : 'text-on-secondary-container'}`;
    };
  };
  return <StitchPage html={recoverRaw} setup={setup} />;
}

export function VerifyEmail() {
  const setup = (root: HTMLElement) => {
    root.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if ((button.textContent ?? '').toLowerCase().includes('renvoyer')) {
        button.onclick = async () => {
          const { data } = await supabase.auth.getUser();
          const email = data.user?.email;
          if (email) await supabase.auth.resend({ type: 'signup', email });
        };
      }
    });
  };
  return <StitchPage html={verifyRaw} setup={setup} />;
}

export function NewPassword() {
  const navigate = useNavigate();
  const setup = (root: HTMLElement) => {
    const form = root.querySelector<HTMLFormElement>('#reset-password-form');
    const password = root.querySelector<HTMLInputElement>('#new-password');
    const confirm = root.querySelector<HTMLInputElement>('#confirm-password');
    if (!form) return;
    const box = messageBox();
    form.appendChild(box);
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (password?.value !== confirm?.value) {
        box.textContent = 'Les mots de passe ne correspondent pas.';
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: password?.value ?? '' });
      if (error) box.textContent = error.message;
      else navigate('/login');
    };
  };
  return <StitchPage html={newPasswordRaw} setup={setup} />;
}

export function TwoFactor() {
  const navigate = useNavigate();
  const setup = (root: HTMLElement) => {
    const form = root.querySelector<HTMLFormElement>('#otp-form');
    if (!form) return;
    form.onsubmit = (event) => {
      event.preventDefault();
      navigate('/');
    };
  };
  return <StitchPage html={twoFactorRaw} setup={setup} />;
}

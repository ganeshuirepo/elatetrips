'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { closeAuth } from '@/store/slices/uiSlice';
import { setSession, type Session } from '@/store/slices/accountSlice';
import {
  useLoginMutation,
  useSignupMutation,
  useVerifyAccountMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} from '@/store/elateApi';
import Icon from '@/components/ui/Icon';

type Step = 'login' | 'signup' | 'verify' | 'forgot' | 'reset';

const errMsg = (err: unknown): string =>
  (err as { data?: { error?: { message?: string } } })?.data?.error?.message ??
  'Something went wrong. Please try again.';

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="text-muted flex flex-col gap-1 text-[12px] font-semibold">
      {label}
      {children}
    </label>
  );
}

const inputCls =
  'text-ink rounded-[10px] border border-[color:var(--line)] px-3 py-2 text-[14px] outline-none';

/** Global auth modal: login, signup (+ verify), and forgot/reset password. */
export default function AuthDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.authOpen);
  const mode = useAppSelector((s) => s.ui.authMode);

  const [step, setStep] = useState<Step>('login');
  const [form, setForm] = useState({
    identifier: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    gender: 'male',
    age: '',
    verifyVia: 'mobile' as 'mobile' | 'email',
    otp: '',
  });
  const [pending, setPending] = useState<{ identifier: string; channel: string } | null>(null);
  const [hint, setHint] = useState<string>('');
  const [error, setError] = useState<string>('');

  const [login, loginState] = useLoginMutation();
  const [signup, signupState] = useSignupMutation();
  const [verifyAccount, verifyState] = useVerifyAccountMutation();
  const [forgot, forgotState] = useForgotPasswordMutation();
  const [reset, resetState] = useResetPasswordMutation();
  const busy =
    loginState.isLoading ||
    signupState.isLoading ||
    verifyState.isLoading ||
    forgotState.isLoading ||
    resetState.isLoading;

  // Sync the step to the requested mode each time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep(mode);
      setError('');
      setHint('');
      setPending(null);
    }
  }, [open, mode]);

  if (!open) return null;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => dispatch(closeAuth());

  const succeed = (session: Session) => {
    dispatch(setSession(session));
    close();
  };

  const onLogin = async () => {
    setError('');
    try {
      succeed(await login({ identifier: form.identifier.trim(), password: form.password }).unwrap());
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onSignup = async () => {
    setError('');
    try {
      const res = await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        gender: form.gender as never,
        age: Number(form.age),
        password: form.password,
        verifyVia: form.verifyVia,
      }).unwrap();
      setPending({ identifier: res.identifier, channel: res.channel });
      setHint(res.devOtp ? `Demo OTP: ${res.devOtp}` : '');
      setStep('verify');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onVerify = async () => {
    if (!pending) return;
    setError('');
    try {
      succeed(await verifyAccount({ identifier: pending.identifier, otp: form.otp }).unwrap());
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onForgot = async () => {
    setError('');
    try {
      const res = await forgot({ identifier: form.identifier.trim() }).unwrap();
      setPending({ identifier: form.identifier.trim(), channel: res.channel });
      setHint(res.devOtp ? `Demo OTP: ${res.devOtp}` : 'If the account exists, an OTP was sent.');
      setStep('reset');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onReset = async () => {
    if (!pending) return;
    setError('');
    try {
      succeed(
        await reset({
          identifier: pending.identifier,
          otp: form.otp,
          password: form.password,
        }).unwrap(),
      );
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const titles: Record<Step, string> = {
    login: 'Sign in',
    signup: 'Create your account',
    verify: 'Verify your account',
    forgot: 'Forgot password',
    reset: 'Reset password',
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[420px] flex-col gap-4 overflow-y-auto rounded-[18px] bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-primary m-0 font-serif text-xl font-bold">{titles[step]}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="text-muted cursor-pointer border-none bg-transparent text-[18px]"
          >
            <Icon name="x" />
          </button>
        </div>

        {error && (
          <div className="rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[12.5px] font-semibold text-[#C0392B]">
            {error}
          </div>
        )}
        {hint && !error && (
          <div className="bg-sand text-primary rounded-[10px] px-3 py-2 text-[12.5px] font-semibold">
            {hint}
          </div>
        )}

        {step === 'login' && (
          <>
            <Field label="Mobile number or email">
              <input
                className={inputCls}
                value={form.identifier}
                onChange={(e) => set('identifier', e.target.value)}
                placeholder="9876543210 or you@email.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                className={inputCls}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
            </Field>
            <Button variant="contained" color="primary" disabled={busy} onClick={onLogin}>
              Sign in
            </Button>
            <div className="flex items-center justify-between text-[12.5px]">
              <button
                type="button"
                onClick={() => setStep('forgot')}
                className="text-primary cursor-pointer border-none bg-transparent font-semibold"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => setStep('signup')}
                className="text-primary cursor-pointer border-none bg-transparent font-semibold"
              >
                New here? Sign up
              </button>
            </div>
          </>
        )}

        {step === 'signup' && (
          <>
            <Field label="Full name">
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Mobile number">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10 digits"
                />
              </Field>
              <Field label="Age">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={form.age}
                  onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
              </Field>
            </div>
            <Field label="Email">
              <input className={inputCls} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Gender">
                <select className={inputCls} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  className={inputCls}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Min 6 characters"
                />
              </Field>
            </div>
            <Field label="Verify via">
              <select
                className={inputCls}
                value={form.verifyVia}
                onChange={(e) => set('verifyVia', e.target.value)}
              >
                <option value="mobile">Mobile number (OTP)</option>
                <option value="email">Email (OTP)</option>
              </select>
            </Field>
            <Button variant="contained" color="primary" disabled={busy} onClick={onSignup}>
              Create account
            </Button>
            <button
              type="button"
              onClick={() => setStep('login')}
              className="text-primary cursor-pointer border-none bg-transparent text-[12.5px] font-semibold"
            >
              Already have an account? Sign in
            </button>
          </>
        )}

        {step === 'verify' && (
          <>
            <p className="text-muted text-[12.5px]">
              Enter the 4-digit code sent to your {pending?.channel} (<span className="font-semibold">{pending?.identifier}</span>).
            </p>
            <Field label="OTP">
              <input
                className={`${inputCls} tracking-[0.3em]`}
                inputMode="numeric"
                value={form.otp}
                onChange={(e) => set('otp', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit OTP"
              />
            </Field>
            <Button variant="contained" color="primary" disabled={busy || form.otp.length !== 4} onClick={onVerify}>
              Verify &amp; continue
            </Button>
          </>
        )}

        {step === 'forgot' && (
          <>
            <p className="text-muted text-[12.5px]">
              Enter your mobile number or email and we&apos;ll send a reset code.
            </p>
            <Field label="Mobile number or email">
              <input
                className={inputCls}
                value={form.identifier}
                onChange={(e) => set('identifier', e.target.value)}
              />
            </Field>
            <Button variant="contained" color="primary" disabled={busy} onClick={onForgot}>
              Send reset code
            </Button>
            <button
              type="button"
              onClick={() => setStep('login')}
              className="text-primary cursor-pointer border-none bg-transparent text-[12.5px] font-semibold"
            >
              Back to sign in
            </button>
          </>
        )}

        {step === 'reset' && (
          <>
            <p className="text-muted text-[12.5px]">
              Enter the code sent to <span className="font-semibold">{pending?.identifier}</span> and your new password.
            </p>
            <Field label="OTP">
              <input
                className={`${inputCls} tracking-[0.3em]`}
                inputMode="numeric"
                value={form.otp}
                onChange={(e) => set('otp', e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                className={inputCls}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Min 6 characters"
              />
            </Field>
            <Button variant="contained" color="primary" disabled={busy} onClick={onReset}>
              Reset password
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

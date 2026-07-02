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
  useRequestOtpMutation,
  useResendOtpMutation,
  useVerifyOtpMutation,
} from '@/store/elateApi';
import { PASSWORD_RULES, isStrongPassword } from '@/domain/password';
import Icon from '@/components/ui/Icon';

type Step = 'login' | 'signup' | 'verify' | 'forgot' | 'reset' | 'otp-login';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 30;

const errMsg = (err: unknown): string =>
  (err as { data?: { error?: { message?: string } } })?.data?.error?.message ??
  'Something went wrong. Please try again.';

const emailOk = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const identifierOk = (v: string) => /^\d{10}$/.test(v) || emailOk(v);

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

/** Live checklist of password rules, shown while the user types. */
function PasswordChecklist({ password }: { password: string }) {
  if (!password) return null;
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1 p-0">
      {PASSWORD_RULES.map((rule) => {
        const pass = rule.test(password);
        return (
          <li
            key={rule.id}
            className="flex items-center gap-1.5 text-[11.5px] font-semibold"
            style={{ color: pass ? '#1E7A3A' : 'var(--muted)' }}
          >
            <Icon name={pass ? 'circle-check' : 'circle'} size={13} />
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

/** Global auth modal: password/OTP login, signup (+ verify), forgot/reset. */
export default function AuthDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.authOpen);
  const mode = useAppSelector((s) => s.ui.authMode);

  const [step, setStep] = useState<Step>('login');
  const [form, setForm] = useState({
    identifier: '',
    password: '',
    confirmPassword: '',
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
  const [cooldown, setCooldown] = useState(0);

  const [login, loginState] = useLoginMutation();
  const [signup, signupState] = useSignupMutation();
  const [verifyAccount, verifyState] = useVerifyAccountMutation();
  const [forgot, forgotState] = useForgotPasswordMutation();
  const [reset, resetState] = useResetPasswordMutation();
  const [requestOtp, requestOtpState] = useRequestOtpMutation();
  const [resendOtp, resendOtpState] = useResendOtpMutation();
  const [verifyOtp, verifyOtpState] = useVerifyOtpMutation();
  const busy =
    loginState.isLoading ||
    signupState.isLoading ||
    verifyState.isLoading ||
    forgotState.isLoading ||
    resetState.isLoading ||
    requestOtpState.isLoading ||
    resendOtpState.isLoading ||
    verifyOtpState.isLoading;

  // Sync the step to the requested mode each time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep(mode);
      setError('');
      setHint('');
      setPending(null);
      setCooldown(0);
      setForm((f) => ({ ...f, otp: '', password: '', confirmPassword: '' }));
    }
  }, [open, mode]);

  // Tick the resend cooldown down once a second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  if (!open) return null;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => dispatch(closeAuth());

  const succeed = (session: Session) => {
    dispatch(setSession(session));
    close();
  };

  const startOtpWait = (identifier: string, channel: string, devOtp?: string) => {
    setPending({ identifier, channel });
    setHint(devOtp ? `Demo OTP (no provider configured): ${devOtp}` : '');
    setCooldown(RESEND_COOLDOWN_S);
    set('otp', '');
  };

  const onLogin = async () => {
    setError('');
    try {
      succeed(await login({ identifier: form.identifier.trim(), password: form.password }).unwrap());
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onRequestLoginOtp = async () => {
    setError('');
    try {
      const res = await requestOtp({ identifier: form.identifier.trim() }).unwrap();
      startOtpWait(res.identifier, res.channel, res.devOtp);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onVerifyLoginOtp = async () => {
    if (!pending) return;
    setError('');
    try {
      succeed(await verifyOtp({ identifier: pending.identifier, otp: form.otp }).unwrap());
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const signupProblem = (): string => {
    if (form.name.trim().length < 2) return 'Please enter your full name.';
    if (!/^\d{10}$/.test(form.phone)) return 'Mobile number must be 10 digits.';
    if (!emailOk(form.email.trim())) return 'Please enter a valid email.';
    if (!form.age || Number(form.age) < 1) return 'Please enter your age.';
    if (!isStrongPassword(form.password)) return 'Password does not meet all the rules below.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    return '';
  };

  const onSignup = async () => {
    const problem = signupProblem();
    if (problem) {
      setError(problem);
      return;
    }
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
      startOtpWait(res.identifier, res.channel, res.devOtp);
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

  const onResend = async () => {
    if (!pending || cooldown > 0) return;
    setError('');
    try {
      const res = await resendOtp({ identifier: pending.identifier }).unwrap();
      startOtpWait(res.identifier, res.channel, res.devOtp);
      setHint(res.devOtp ? `Demo OTP (no provider configured): ${res.devOtp}` : 'A new OTP is on its way.');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onForgot = async () => {
    setError('');
    try {
      const res = await forgot({ identifier: form.identifier.trim() }).unwrap();
      startOtpWait(form.identifier.trim(), res.channel, res.devOtp);
      if (!res.devOtp) setHint('If the account exists, an OTP was sent.');
      setStep('reset');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onReset = async () => {
    if (!pending) return;
    if (!isStrongPassword(form.password)) {
      setError('Password does not meet all the rules below.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
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
    'otp-login': 'Sign in with OTP',
    signup: 'Create your account',
    verify: 'Verify your account',
    forgot: 'Forgot password',
    reset: 'Reset password',
  };

  const otpField = (
    <Field label={`${OTP_LENGTH}-digit OTP`}>
      <input
        className={`${inputCls} tracking-[0.3em]`}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={form.otp}
        onChange={(e) => set('otp', e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        placeholder={`${OTP_LENGTH}-digit OTP`}
      />
    </Field>
  );

  const resendButton = pending && (
    <button
      type="button"
      disabled={cooldown > 0 || busy}
      onClick={onResend}
      className="text-primary cursor-pointer border-none bg-transparent text-[12.5px] font-semibold disabled:cursor-default disabled:opacity-50"
    >
      {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
    </button>
  );

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
            <Button
              variant="outlined"
              color="primary"
              disabled={busy}
              onClick={() => {
                setError('');
                setStep('otp-login');
              }}
            >
              Sign in with OTP instead
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

        {step === 'otp-login' && (
          <>
            <p className="text-muted text-[12.5px]">
              We&apos;ll send a one-time code to your registered mobile number (SMS) or email.
            </p>
            <Field label="Mobile number or email">
              <input
                className={inputCls}
                value={form.identifier}
                onChange={(e) => set('identifier', e.target.value)}
                placeholder="9876543210 or you@email.com"
                disabled={!!pending}
              />
            </Field>
            {!pending ? (
              <Button
                variant="contained"
                color="primary"
                disabled={busy || !identifierOk(form.identifier.trim())}
                onClick={onRequestLoginOtp}
              >
                Send OTP
              </Button>
            ) : (
              <>
                {otpField}
                <Button
                  variant="contained"
                  color="primary"
                  disabled={busy || form.otp.length !== OTP_LENGTH}
                  onClick={onVerifyLoginOtp}
                >
                  Verify &amp; sign in
                </Button>
                <div className="flex items-center justify-between">
                  {resendButton}
                  <button
                    type="button"
                    onClick={() => {
                      setPending(null);
                      setHint('');
                      set('otp', '');
                    }}
                    className="text-primary cursor-pointer border-none bg-transparent text-[12.5px] font-semibold"
                  >
                    Change mobile/email
                  </button>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setHint('');
                setStep('login');
              }}
              className="text-primary cursor-pointer border-none bg-transparent text-[12.5px] font-semibold"
            >
              Back to password sign in
            </button>
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
            <Field label="Gender">
              <select className={inputCls} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Password">
                <input
                  type="password"
                  className={inputCls}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm password">
                <input
                  type="password"
                  className={inputCls}
                  value={form.confirmPassword}
                  onChange={(e) => set('confirmPassword', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <PasswordChecklist password={form.password} />
            {form.confirmPassword && form.password !== form.confirmPassword && (
              <span className="text-[11.5px] font-semibold text-[#C0392B]">
                Passwords do not match.
              </span>
            )}
            <Field label="Verify via">
              <select
                className={inputCls}
                value={form.verifyVia}
                onChange={(e) => set('verifyVia', e.target.value)}
              >
                <option value="mobile">Mobile number (SMS OTP)</option>
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
              Enter the {OTP_LENGTH}-digit code sent to your {pending?.channel} (
              <span className="font-semibold">{pending?.identifier}</span>).
            </p>
            {otpField}
            <Button
              variant="contained"
              color="primary"
              disabled={busy || form.otp.length !== OTP_LENGTH}
              onClick={onVerify}
            >
              Verify &amp; continue
            </Button>
            {resendButton}
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
            <Button
              variant="contained"
              color="primary"
              disabled={busy || !identifierOk(form.identifier.trim())}
              onClick={onForgot}
            >
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
              Enter the code sent to <span className="font-semibold">{pending?.identifier}</span>{' '}
              and your new password.
            </p>
            {otpField}
            <div className="grid grid-cols-2 gap-2">
              <Field label="New password">
                <input
                  type="password"
                  className={inputCls}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm password">
                <input
                  type="password"
                  className={inputCls}
                  value={form.confirmPassword}
                  onChange={(e) => set('confirmPassword', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <PasswordChecklist password={form.password} />
            <Button variant="contained" color="primary" disabled={busy} onClick={onReset}>
              Reset password
            </Button>
            {resendButton}
          </>
        )}
      </div>
    </div>
  );
}

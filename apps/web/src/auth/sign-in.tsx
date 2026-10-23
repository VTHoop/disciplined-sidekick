import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";
import { requestCode, verifyCode } from "./otp-client";

const OFFLINE = "You're offline. Connect to the internet and try again.";
const INVALID_CODE = "That code is incorrect or has expired.";

export function SignInScreen() {
  const { auth } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const shownStep = useRef(step);

  // Move focus to the field for the new step, but not on first render.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    (step === "code" ? codeRef : emailRef).current?.focus();
  }, [step]);

  async function run(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function send(message: string) {
    const result = await requestCode(auth, email.trim());
    if (result.status === "sent") {
      setCode("");
      setNotice(message);
      setStep("code");
    } else {
      setError(result.status === "offline" ? OFFLINE : result.message);
    }
  }

  const onSendCode = (e: FormEvent) => {
    e.preventDefault();
    void run(() => send(`Enter the 6-digit code we sent to ${email.trim()}.`));
  };

  const onResend = () =>
    run(() => send(`We sent a new code to ${email.trim()}.`));

  const onVerify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await verifyCode(auth, email.trim(), code);
      if (result.status === "verified") return; // the auth listener routes to Today
      if (result.status === "invalid") setError(INVALID_CODE);
      else setError(result.status === "offline" ? OFFLINE : result.message);
    });
  };

  return (
    <main>
      <h1>Sign in</h1>
      {step === "email" ? (
        <form onSubmit={onSendCode}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify}>
          <p role="status">{notice}</p>
          <label htmlFor="code">6-digit code</label>
          <input
            id="code"
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button type="submit" disabled={busy}>
            Verify
          </button>
          <button type="button" disabled={busy} onClick={onResend}>
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("email");
            }}
          >
            Use a different email
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

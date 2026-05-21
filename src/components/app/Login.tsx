import { useState, type FormEvent } from "react";
import {
  UtensilsCrossed,
  LogIn,
  Loader2,
  User as UserIcon,
  Lock,
  Eye,
  EyeOff,
  BadgeCheck,
} from "lucide-react";
import { useSession } from "@/lib/session";

export function Login() {
  const { login } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 lg:p-10 bg-background text-foreground overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/15 blur-[150px] z-0" />
      <div className="pointer-events-none absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/10 blur-[150px] z-0" />
      {/* Subtle dot grid */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.08]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Main card */}
      <main className="relative z-10 w-full max-w-[1100px] flex flex-col rounded-[28px] border border-primary/30 bg-card/80 backdrop-blur-2xl shadow-[0_0_30px_oklch(0.55_0.18_250/0.15)] overflow-hidden">
        <div className="flex flex-col lg:flex-row w-full">
          {/* Left: Branding */}
          <section className="hidden md:flex w-full lg:w-5/12 p-12 flex-col items-center justify-center relative border-r border-border/60 bg-gradient-to-br from-primary/15 to-transparent min-h-[600px]">
            <div className="flex flex-col items-center text-center z-10 mb-12">
              <div className="size-20 rounded-full grid place-items-center mb-6 bg-primary shadow-[0_0_20px_oklch(0.55_0.18_250/0.45)] border-t border-white/20">
                <UtensilsCrossed className="size-10 text-primary-foreground" />
              </div>
              <h1 className="font-display text-5xl font-bold tracking-tight mb-1">MyMeals</h1>
              <p className="text-base text-muted-foreground">Smart operations. Better meals.</p>
            </div>

            <div className="flex-grow flex items-center justify-center w-full max-w-[280px] z-10">
              <div className="relative w-full">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl" />
                <img
                  src="/login-logo.png"
                  alt="MyMeal — premium dark serving cloche and bowl illustration"
                  className="relative w-full h-auto object-contain drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)]"
                />
              </div>
            </div>

            <div className="mt-12 z-10 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary bg-card/60 px-4 py-2 rounded-full border border-primary/30">
              <BadgeCheck className="size-4" />
              <span>Secure. Reliable. Always.</span>
            </div>
          </section>

          {/* Right: Form */}
          <section className="w-full lg:w-7/12 p-6 lg:p-16 flex flex-col justify-center">
            <div className="mb-10">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-1">
                Welcome back
              </h2>
              <p className="text-base text-muted-foreground">Sign in to continue to MyMeals</p>
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-5">
              {/* Username */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="username"
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Username
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                  <input
                    id="username"
                    type="text"
                    autoFocus
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-secondary/60 border border-border rounded-xl py-3 pl-11 pr-4 text-base placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-secondary/60 border border-border rounded-xl py-3 pl-11 pr-11 text-base placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="size-4 rounded border-border bg-secondary text-primary focus:ring-ring focus:ring-offset-background cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    Remember me
                  </span>
                </label>
                <a
                  href="#"
                  className="text-sm font-medium text-primary hover:opacity-80 transition-opacity"
                >
                  Forgot password?
                </a>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {/* Sign in */}
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold border-t border-white/20 shadow-[0_0_15px_oklch(0.55_0.18_250/0.25)] hover:shadow-[0_0_25px_oklch(0.55_0.18_250/0.45)] hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300"
              >
                {submitting ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <LogIn className="size-5" />
                )}
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-8 flex flex-col md:flex-row items-center justify-center gap-4 text-center w-full max-w-[1100px]">
        <span className="text-xs text-muted-foreground opacity-70">
          © 2025 MyMeals. All rights reserved.
        </span>
        <div className="flex items-center gap-1 text-muted-foreground opacity-70">
          <Lock className="size-3.5" />
          <span className="text-xs">Your data is protected</span>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { Sparkles, MessageSquare, Zap, Shield, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-accent" />
            <span className="text-lg font-bold">BookAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-sm text-accent">
            <Sparkles className="h-4 w-4" />
            AI-powered scheduling
          </div>

          <h1 className="mt-6 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Run your business
            <br />
            <span className="text-accent">by talking to AI</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            The scheduling platform where AI is the interface, not an add-on.
            Your clients book via text, email, or WhatsApp. No app downloads. No
            friction. Just seamless appointments.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Start Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#features"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              See How It Works
            </Link>
          </div>
        </section>

        <section id="features" className="border-t border-border bg-muted/50 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold text-foreground">
              Why businesses switch to BookAI
            </h2>

            <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-8">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <Sparkles className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">AI runs your schedule</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Say &quot;block off Tuesday&quot; or &quot;who&apos;s coming tomorrow?&quot; Your AI
                  assistant handles it instantly. Zero learning curve.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-8">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <MessageSquare className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  Clients just reply
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  No app downloads. Clients book and manage appointments by
                  replying to emails, texts, or WhatsApp. AI handles everything.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-8">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <Zap className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  Free to start, fair pricing
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Start free forever with revenue share, or subscribe from $9/mo.
                  No hidden fees. SMS and WhatsApp at cost.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>BookAI &mdash; AI-powered scheduling for modern businesses</p>
      </footer>
    </div>
  );
}

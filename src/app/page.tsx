import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-8 py-6">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          Opes Wealth
        </span>
        <Button asChild variant="outline">
          <Link href="/login">Sign In</Link>
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Private Wealth, Clearly Seen
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            One view of everything you own.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Opes Wealth brings your real estate, holdings, and cash together
            in a single, private dashboard — built for individuals who
            expect precision.
          </p>
          <div className="mt-10">
            <Button asChild size="lg">
              <Link href="/login">Sign In to Your Dashboard</Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="px-8 py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Opes Wealth
      </footer>
    </div>
  );
}

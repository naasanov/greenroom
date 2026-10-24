import { Disc3 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Logo mark above the app name. */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
        <Disc3 className="size-6" />
      </span>
      <span className="text-xl font-semibold tracking-tight">Greenroom</span>
    </div>
  );
}

/** Centered single-column page used by sign-in, welcome, invite, and start screens. */
export function AuthLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className={cn("flex w-full max-w-md flex-col gap-6", className)}>
        {children}
      </div>
    </main>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type NextLinkProps = ComponentProps<typeof Link>;

export type CtaLinkVariant = "primary" | "secondary" | "dark-primary" | "dark-secondary";

interface CtaLinkProps extends Omit<NextLinkProps, "children" | "className"> {
  children: ReactNode;
  className?: string;
  variant?: CtaLinkVariant;
}

const ctaLinkClassByVariant = {
  primary:
    "rounded-full bg-gray-1000 px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90",
  secondary:
    "rounded-full border bg-background px-5 py-2.5 font-medium text-gray-1000 text-sm transition-colors hover:bg-background-100",
  "dark-primary":
    "rounded-full bg-background px-5 py-2.5 font-medium text-gray-1000 text-sm transition-opacity hover:opacity-90",
  "dark-secondary":
    "rounded-full border border-background/30 px-5 py-2.5 font-medium text-background text-sm transition-colors hover:bg-background/10",
} satisfies Record<CtaLinkVariant, string>;

export function CtaLink({ children, className, variant = "primary", ...props }: CtaLinkProps) {
  return (
    <Link className={cn(ctaLinkClassByVariant[variant], className)} {...props}>
      {children}
    </Link>
  );
}

export type EyebrowTone = "blue" | "neutral";

interface EyebrowProps {
  children: ReactNode;
  className?: string;
  tone?: EyebrowTone;
}

const eyebrowToneClassByTone = {
  blue: "text-blue-700",
  neutral: "text-gray-800",
} satisfies Record<EyebrowTone, string>;

export function Eyebrow({ children, className, tone = "neutral" }: EyebrowProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-full border bg-background px-3 py-1 font-medium text-xs uppercase tracking-[0.18em]",
        eyebrowToneClassByTone[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

export type MarketingHeroSidePanelWidth = "default" | "narrow";

const marketingHeroSidePanelWidthClass = {
  default: "lg:grid-cols-[1fr_440px]",
  narrow: "lg:grid-cols-[1fr_420px]",
} satisfies Record<MarketingHeroSidePanelWidth, string>;

interface MarketingHeroProps {
  ctas: ReactNode;
  description: ReactNode;
  eyebrow: ReactNode;
  eyebrowTone?: EyebrowTone;
  sidePanel: ReactNode;
  sidePanelWidth?: MarketingHeroSidePanelWidth;
  title: ReactNode;
}

export function MarketingHero({
  ctas,
  description,
  eyebrow,
  eyebrowTone,
  sidePanel,
  sidePanelWidth = "default",
  title,
}: MarketingHeroProps) {
  return (
    <section
      className={cn(
        "mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-10 px-6 py-16 lg:items-center lg:py-24",
        marketingHeroSidePanelWidthClass[sidePanelWidth],
      )}
    >
      <div className="space-y-8">
        <Eyebrow {...(eyebrowTone === undefined ? {} : { tone: eyebrowTone })}>{eyebrow}</Eyebrow>
        <div className="max-w-3xl space-y-5">
          <h1 className="text-balance font-semibold text-5xl text-gray-1000 tracking-[-0.04em] md:text-7xl">
            {title}
          </h1>
          <p className="text-balance text-gray-800 text-xl leading-8">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3">{ctas}</div>
      </div>

      {sidePanel}
    </section>
  );
}

interface PreviewPanelProps {
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow: ReactNode;
  title: ReactNode;
}

export function PreviewPanel({ badge, children, className, eyebrow, title }: PreviewPanelProps) {
  return (
    <aside className={cn("rounded-[2rem] border bg-background p-3 shadow-sm", className)}>
      <div className="rounded-[1.5rem] border bg-gray-1000 p-5 text-background">
        <div className="flex items-center justify-between border-background/15 border-b pb-4">
          <div>
            <p className="font-mono text-background/60 text-xs">{eyebrow}</p>
            <p className="mt-1 font-semibold text-xl">{title}</p>
          </div>
          {badge ? (
            <span className="rounded-full border border-background/20 px-2 py-1 font-mono text-background/70 text-xs">
              {badge}
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </aside>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return <article className={cn("rounded-2xl border bg-background p-5", className)}>{children}</article>;
}

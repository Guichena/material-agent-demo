"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        green: "border-emerald-200 bg-emerald-50 text-emerald-700",
        blue: "border-sky-200 bg-sky-50 text-sky-700",
        yellow: "border-amber-200 bg-amber-50 text-amber-700",
        red: "border-red-200 bg-red-50 text-red-700",
        purple: "border-violet-200 bg-violet-50 text-violet-700",
        gray: "border-slate-200 bg-slate-100 text-slate-600"
      }
    },
    defaultVariants: {
      tone: "gray"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}

export { Badge, badgeVariants };

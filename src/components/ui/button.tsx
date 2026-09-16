import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Botón OS-CAR — Tablero del taller.
 * cta: amarillo competición (acción principal). alert: rojo paro.
 * Los nombres de variantes shadcn se mantienen (default→cta, destructive→alert)
 * para no romper los componentes Radix existentes.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold tracking-wide transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 select-none active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-oscar-yellow text-carbon-950 border border-oscar-yellow/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.25)] hover:bg-oscar-yellow-hover hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.25),0_0_20px_rgba(255,230,0,0.25)] font-display font-bold uppercase",
        primary:
          "bg-oscar-yellow text-carbon-950 border border-oscar-yellow/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.25)] hover:bg-oscar-yellow-hover hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_0_rgba(0,0,0,0.25),0_0_20px_rgba(255,230,0,0.25)] font-display font-bold uppercase",
        destructive:
          "bg-oscar-red text-white border border-oscar-red/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.3)] hover:bg-oscar-red-hover font-display font-bold uppercase",
        danger:
          "bg-oscar-red text-white border border-oscar-red/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.3)] hover:bg-oscar-red-hover font-display font-bold uppercase",
        carbon:
          "bg-carbon-800 text-titanium border border-carbon-700 shadow-[inset_0_1px_0_rgba(248,250,252,0.05),0_2px_8px_rgba(0,0,0,0.4)] hover:bg-carbon-700 hover:border-steel/30",
        outline:
          "border border-carbon-700 bg-transparent text-steel hover:text-oscar-yellow hover:border-oscar-yellow/60 hover:bg-oscar-yellow/5",
        secondary:
          "bg-carbon-800 text-titanium border border-carbon-700 hover:bg-carbon-700",
        ghost:
          "text-steel hover:bg-carbon-800 hover:text-oscar-yellow",
        link: "text-oscar-yellow underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm",
        sm: "h-9 rounded-sm gap-1.5 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
        touch: "min-h-11 px-5 text-sm",
        icon: "size-10",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    loadingLabel,
    disabled,
    children,
    ...props
  },
  ref
) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
})

export { Button, buttonVariants }

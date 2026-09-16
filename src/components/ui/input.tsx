import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<"input"> {
  label?: string
  errorMessage?: string
  error?: string
  hint?: string
  mono?: boolean
  containerClassName?: string
}

/**
 * Input OS-CAR — Terminal industrial.
 * Soporta uso directo como <input> (para shadcn/Radix forms)
 * y con label/error accesibles integrados (WCAG 1.3.1).
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    type,
    label,
    errorMessage,
    error,
    hint,
    mono,
    containerClassName,
    id,
    ...props
  },
  ref
) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const err = errorMessage ?? error
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const describedBy = err ? errorId : hint ? hintId : undefined

  const inputElement = (
    <input
      type={type}
      ref={ref}
      id={inputId}
      data-slot="input"
      aria-invalid={err ? true : props["aria-invalid"]}
      aria-describedby={describedBy ?? props["aria-describedby"]}
      className={cn(
        "file:text-foreground placeholder:text-lead selection:bg-oscar-yellow selection:text-carbon-950 bg-carbon-950/70 border-carbon-800 flex h-11 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)] transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "hover:border-carbon-700 focus-visible:border-oscar-yellow/70 focus-visible:shadow-[inset_0_2px_4px_rgba(0,0,0,0.45),0_0_0_3px_rgba(255,230,0,0.15)]",
        mono && "font-mono uppercase tracking-wider",
        err && "border-oscar-red/70 focus-visible:border-oscar-red/70",
        className
      )}
      {...props}
    />
  )

  if (!label && !err && !hint) {
    return inputElement
  }

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-titanium">
          {label}
        </label>
      )}
      {inputElement}
      {err ? (
        <p id={errorId} role="alert" className="text-sm text-oscar-red">
          {err}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-steel">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export { Input }


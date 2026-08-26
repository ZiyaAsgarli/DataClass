import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4',
  {
    variants: {
      variant: {
        default: 'border border-primary/90 bg-primary text-primary-foreground shadow-[0_4px_14px_rgba(47,104,70,0.16)] hover:-translate-y-0.5 hover:bg-[var(--primary-hover)] hover:shadow-[0_7px_18px_rgba(47,104,70,0.2)]',
        outline: 'border border-[var(--strong-border)] bg-card text-foreground shadow-sm hover:-translate-y-0.5 hover:border-primary/35 hover:bg-accent/35',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      },
      size: { default: 'h-11 px-5', sm: 'h-9 px-3.5 text-xs', icon: 'size-10 p-0' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

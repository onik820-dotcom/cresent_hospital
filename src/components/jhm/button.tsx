import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const button = cva(
  'tap-target inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium ' +
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--color-accent)] text-white hover:brightness-110',
        glass: 'glass glass-lift',
        ghost: 'hover:bg-[var(--color-accent-soft)]',
        danger: 'bg-[var(--color-breach)] text-white hover:brightness-110',
        // shadcn/ui aliases used by vendored ui/ components
        default: 'bg-[var(--color-accent)] text-white hover:brightness-110',
        destructive: 'bg-[var(--color-breach)] text-white hover:brightness-110',
        outline: 'glass glass-lift',
        secondary: 'glass glass-lift',
        link: 'underline-offset-4 hover:underline',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2.5',
        lg: 'px-6 py-3 text-base',
        forecourt: 'forecourt-button w-full flex-col px-6 py-6 text-left',
        default: 'px-4 py-2.5',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, ref, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />;
}

// shadcn/ui compatibility aliases — some vendored ui/ components import these.
export const buttonVariants = button;

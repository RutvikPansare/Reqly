import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-ghost text-red-400 hover:text-red-300 hover:bg-red-500/10',
};

const sizeClass: Record<Size, string> = {
  sm: 'text-xs px-2 py-1 gap-1',
  md: '',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, children, className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

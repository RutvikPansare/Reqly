import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`input ${className}`} {...props} />
  )
);
Input.displayName = 'Input';

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className = '', ...props }, ref) => (
    <textarea ref={ref} className={`input resize-none ${className}`} {...props} />
  )
);
TextArea.displayName = 'TextArea';

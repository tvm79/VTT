import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes } from 'react';

export type PanelProps = PropsWithChildren<{
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  style?: CSSProperties;
}> & HTMLAttributes<HTMLElement>;

export function Panel({ className = '', header, footer, style, children, ...props }: PanelProps) {
  return (
    <section className={`ui-panel ${className}`.trim()} style={style} {...props}>
      {header ? <header className="ui-panel__header">{header}</header> : null}
      <div className="ui-panel__content">{children}</div>
      {footer ? <footer className="ui-panel__footer">{footer}</footer> : null}
    </section>
  );
}

import { forwardRef } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className = '', variant = 'secondary', size = 'md', type = 'button', ...props }, ref) => {
  return <button ref={ref} type={type} className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()} {...props} />;
});
Button.displayName = 'Button';

export function IconButton({ className = '', children, ...props }: ButtonProps) {
  return (
    <Button className={`ui-icon-button ${className}`.trim()} size="icon" {...props}>
      {children}
    </Button>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  containerClassName?: string;
};

export function Input({ label, helperText, containerClassName = '', className = '', ...props }: InputProps) {
  return (
    <label className={`ui-field ${containerClassName}`.trim()}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <input className={`ui-input ${className}`.trim()} {...props} />
      {helperText ? <span className="ui-field__helper">{helperText}</span> : null}
    </label>
  );
}

export type DropdownProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  containerClassName?: string;
};

export function Dropdown({ label, helperText, containerClassName = '', className = '', children, ...props }: DropdownProps) {
  return (
    <label className={`ui-field ${containerClassName}`.trim()}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <select className={`ui-input ui-select ${className}`.trim()} {...props}>
        {children}
      </select>
      {helperText ? <span className="ui-field__helper">{helperText}</span> : null}
    </label>
  );
}

export type SliderProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  containerClassName?: string;
};

export function Slider({ label, helperText, containerClassName = '', className = '', type = 'range', ...props }: SliderProps) {
  return (
    <label className={`ui-field ${containerClassName}`.trim()}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <input type={type} className={`ui-slider ${className}`.trim()} {...props} />
      {helperText ? <span className="ui-field__helper">{helperText}</span> : null}
    </label>
  );
}

export type ToolbarProps = HTMLAttributes<HTMLDivElement>;

export function UIToolbar({ className = '', ...props }: ToolbarProps) {
  return <div className={`ui-toolbar ${className}`.trim()} {...props} />;
}

export type ContextMenuProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function ContextMenu({ className = '', children, ...props }: ContextMenuProps) {
  return (
    <div className={`ui-context-menu ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export type ListRowProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  selected?: boolean;
};

export function ListRow({ className = '', selected = false, children, ...props }: ListRowProps) {
  return (
    <div className={`ui-list-row ${selected ? 'is-selected' : ''} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

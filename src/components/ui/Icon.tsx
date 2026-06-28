import type { CSSProperties } from 'react';

/**
 * Renders a Tabler webfont icon from its kebab id (e.g. "ti-cake").
 * The whole data layer references icons by these string ids, so a single
 * font-backed component keeps usage uniform and tree-shake-free.
 */
export interface IconProps {
  /** Tabler icon id, with or without the leading "ti-". */
  name: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
  title?: string;
}

export default function Icon({ name, size, className = '', style, title, ...rest }: IconProps) {
  const id = name.startsWith('ti-') ? name : `ti-${name}`;
  return (
    <i
      className={`ti ${id} ${className}`.trim()}
      style={{ fontSize: size, lineHeight: 1, ...style }}
      aria-hidden={title ? undefined : true}
      title={title}
      {...rest}
    />
  );
}

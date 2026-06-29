import type { ReactNode } from 'react';

/** White rounded panel used throughout the planner. */
export default function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[20px] border border-[#EBE1CF] bg-[#FAF7F2] p-[22px] ${className}`}
      style={{ boxShadow: '0 34px 64px -34px rgba(3,18,19,.55)' }}
    >
      {children}
    </div>
  );
}

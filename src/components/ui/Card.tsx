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
      className={`rounded-[20px] border border-[#ECE7DC] bg-white p-[22px] ${className}`}
      style={{ boxShadow: '0 20px 50px -26px rgba(28,60,143,.35)' }}
    >
      {children}
    </div>
  );
}

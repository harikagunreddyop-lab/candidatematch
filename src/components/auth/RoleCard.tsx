'use client';

import { motion } from 'framer-motion';

type RoleCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
};

export function RoleCard({ icon, title, description, selected, onClick }: RoleCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-start gap-4 ${
        selected
          ? 'border-brand-400 bg-brand-400/10 shadow-lg shadow-lime'
          : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
      }`}
    >
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
          selected ? 'bg-brand-400/30 text-brand-400' : 'bg-surface-700 text-surface-400'
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-surface-400 mt-0.5">{description}</p>
      </div>
    </motion.button>
  );
}

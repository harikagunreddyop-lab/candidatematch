'use client';

import { motion } from 'framer-motion';

export function FloatingOrbs() {
  return (
    <>
      <motion.div
        className="absolute w-72 h-72 rounded-full bg-violet-500/20 blur-3xl"
        animate={{
          x: [0, 30, 0],
          y: [0, -20, 0],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ top: '20%', left: '10%' }}
      />
      <motion.div
        className="absolute w-96 h-96 rounded-full bg-purple-600/10 blur-3xl"
        animate={{
          x: [0, -20, 0],
          y: [0, 30, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        style={{ bottom: '10%', right: '0%' }}
      />
    </>
  );
}

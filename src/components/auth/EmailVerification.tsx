'use client';

import { motion } from 'framer-motion';
import { Mail } from 'lucide-react';

export function EmailVerification({ email }: { email: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="text-center py-4"
    >
      <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Mail className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
      <p className="text-surface-400 mb-2">
        We&apos;ve sent a confirmation link to <strong className="text-white">{email}</strong>
      </p>
      <p className="text-sm text-surface-500">
        Click the link in the email to activate your account, then sign in.
      </p>
    </motion.div>
  );
}

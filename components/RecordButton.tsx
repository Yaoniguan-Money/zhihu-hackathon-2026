'use client';

import { motion, AnimatePresence } from 'motion/react';

interface RecordButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
}

export default function RecordButton({ isRecording, onStart, onStop }: RecordButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      onClick={isRecording ? onStop : onStart}
      className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
        isRecording
          ? 'bg-red-500 text-white'
          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
      }`}
    >
      <AnimatePresence mode="wait">
        {isRecording ? (
          <motion.div
            key="stop"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="w-4 h-4 bg-white rounded-sm"
          />
        ) : (
          <motion.div
            key="mic"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="text-lg"
          >
            🎤
          </motion.div>
        )}
      </AnimatePresence>

      {isRecording && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-red-400"
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
}

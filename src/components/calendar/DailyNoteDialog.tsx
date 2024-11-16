import React from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import type { DailyNote } from '../../types/dailyNote';

interface DailyNoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  note?: DailyNote;
}

export function DailyNoteDialog({ isOpen, onClose, date, note }: DailyNoteDialogProps) {
  const { user } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      content: note?.content || '',
    },
  });

  const onSubmit = async (data: { content: string }) => {
    if (!user) return;

    try {
      const noteData = {
        content: data.content,
        date: format(date, 'yyyy-MM-dd'),
        userId: user.uid,
        updatedAt: new Date().toISOString(),
      };

      if (note?.id) {
        await updateDoc(doc(db, 'dailyNotes', note.id), noteData);
        toast.success('Note mise à jour !');
      } else {
        noteData.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'dailyNotes'), noteData);
        toast.success('Note ajoutée !');
      }

      onClose();
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Une erreur est survenue');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-xl font-bold">
              {format(date, 'EEEE d MMMM yyyy', { locale: fr })}
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Note du jour
                </label>
                <textarea
                  {...register('content')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                    transition-colors placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:placeholder:text-slate-400
                    min-h-[150px] resize-none"
                  placeholder="Écrivez votre note..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {note ? 'Mettre à jour' : 'Ajouter'}
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
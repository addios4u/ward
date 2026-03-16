import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface DeleteConfirmModalProps {
  title: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function DeleteConfirmModal({ title, description, onConfirm, onCancel, loading }: DeleteConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-gray-500">{description}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {t('deleteModal.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? t('deleteModal.deleting') : t('deleteModal.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}

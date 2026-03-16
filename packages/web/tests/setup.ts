import '@testing-library/jest-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from '../src/i18n/locales/ko.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
    },
    lng: 'ko',
    fallbackLng: 'ko',
    interpolation: { escapeValue: false },
  });

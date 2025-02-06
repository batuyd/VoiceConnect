import { createContext, useContext, useState, ReactNode } from 'react';
import { Language, translations } from '@/lib/languages';

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en'] | string) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const savedLang = localStorage.getItem('language');
      return (savedLang as Language) || 'en';
    } catch {
      return 'en';
    }
  });

  const t = (path: string) => {
    try {
      const keys = path.split('.');
      let current: any = translations[language];

      for (const key of keys) {
        if (current[key] === undefined) {
          console.warn(`Translation missing for key: ${path} in language: ${language}`);
          // Fallback to English if translation is missing
          current = translations['en'];
          for (const fallbackKey of keys) {
            if (current[fallbackKey] === undefined) {
              return path; // Return the key itself if no translation found
            }
            current = current[fallbackKey];
          }
          break;
        }
        current = current[key];
      }

      return current;
    } catch (error) {
      console.error(`Translation error for key: ${path}`, error);
      return path;
    }
  };

  return (
    <LanguageContext.Provider 
      value={{ 
        language, 
        setLanguage: (lang: Language) => {
          setLanguage(lang);
          try {
            localStorage.setItem('language', lang);
          } catch (error) {
            console.error('Failed to save language preference:', error);
          }
        }, 
        t 
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
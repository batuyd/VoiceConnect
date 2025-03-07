import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Language, translations } from '@/lib/languages';
import { useToast } from '@/hooks/use-toast';

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

const getFallbackTranslation = (key: string, language: Language) => {
  const keys = key.split('.');
  let current: any = translations['en'];

  for (const k of keys) {
    if (current[k] === undefined) {
      console.warn(`Translation missing for key: ${key} in language: ${language}`);
      return key;
    }
    current = current[k];
  }

  return current;
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const savedLang = localStorage.getItem('language');
      return (savedLang as Language) || 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = useCallback((lang: Language) => {
    try {
      setLanguageState(lang);
      localStorage.setItem('language', lang);
    } catch (error) {
      console.error('Failed to save language preference:', error);
      toast({
        variant: 'destructive',
        title: translations[language]?.auth?.errors?.registrationFailed || 'Error',
        description: translations['en']?.auth?.errors?.registrationFailed || 'Failed to save language preference',
      });
    }
  }, [language, toast]);

  const t = useCallback((path: string, params?: Record<string, string | number>): string => {
    try {
      const keys = path.split('.');
      let current: any = translations[language];

      for (const key of keys) {
        if (current[key] === undefined) {
          // Fallback to English if translation is missing
          return getFallbackTranslation(path, language);
        }
        current = current[key];
      }

      if (typeof current !== 'string') {
        console.warn(`Translation key ${path} does not resolve to a string`);
        return path;
      }

      // Replace parameters in the translation string
      if (params) {
        return Object.entries(params).reduce(
          (str, [key, value]) => str.replace(`{${key}}`, String(value)),
          current
        );
      }

      return current;
    } catch (error) {
      console.error(`Translation error for key: ${path}`, error);
      return path;
    }
  }, [language]);

  return (
    <LanguageContext.Provider 
      value={{ 
        language, 
        setLanguage,
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
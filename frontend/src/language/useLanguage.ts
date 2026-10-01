import { computed, ref } from 'vue'
import { dict, type Lang, type TranslationKey } from './translations'

const STORAGE_KEY = 'app_lang'

function getInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'th' || stored === 'en' || stored === 'ja') return stored
  return 'th'
}

const lang = ref<Lang>(getInitialLang())
document.documentElement.lang = lang.value

function setLang(next: Lang) {
  lang.value = next
  localStorage.setItem(STORAGE_KEY, next)
  document.documentElement.lang = next
}

function langs(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = dict[lang.value][key] ?? dict.th[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}

export function useLanguage() {
  return { lang: computed(() => lang.value), setLang, langs }
}

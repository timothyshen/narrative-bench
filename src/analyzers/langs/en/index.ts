/**
 * @input  English text content
 * @output Complete English LanguageModule
 * @pos    lib/analyzers/langs/en — English language module entry
 */

import type { LanguageModule } from "../types"
import { enCharacter } from "./character"
import { enStyle } from "./style"
import { enPlot } from "./plot"
import { enI18n } from "./i18n"

export const en: LanguageModule = {
  locale: "en",
  detect(text) {
    if (!text || text.length === 0) return false
    // English: primarily ASCII letters, low CJK ratio
    const ascii = text.match(/[a-zA-Z]/g)
    return ascii ? ascii.length / text.length > 0.4 : false
  },
  character: enCharacter,
  style: enStyle,
  plot: enPlot,
  i18n: enI18n,
}

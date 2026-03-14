/**
 * @input  Chinese text content
 * @output Complete Chinese LanguageModule
 * @pos    lib/analyzers/langs/zh — Chinese language module entry
 */

import type { LanguageModule } from "../types"
import { zhCharacter } from "./character"
import { zhStyle } from "./style"
import { zhPlot } from "./plot"
import { zhI18n } from "./i18n"

export const zh: LanguageModule = {
  locale: "zh",
  detect(text) {
    if (!text || text.length === 0) return false
    const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
    return cjk ? cjk.length / text.length > 0.3 : false
  },
  character: zhCharacter,
  style: zhStyle,
  plot: zhPlot,
  i18n: zhI18n,
}

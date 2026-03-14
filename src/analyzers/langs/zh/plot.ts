/**
 * @input  Chinese text patterns for plot analysis
 * @output Setup patterns for Chekov tracking, contradiction pairs for conflict detection
 * @pos    lib/analyzers/langs/zh — Chinese plot analysis rules
 */

import type { PlotLanguageRules } from "../types"

export const zhPlot: PlotLanguageRules = {
  // Setup patterns for Chekhov tracking (from hook-techniques.md)
  // Covers: observation, mention, mystery, promises/threats, disappearances, objects
  setupPatterns: [
    // Observation hooks (突然揭示)
    /(?:注意到|看到|发现|发觉|瞥见|察觉)\s*([^。！？…]{3,30})/g,
    // Mention hooks (言外之意)
    /(?:提到|说起|谈到|提及|暗示|透露)\s*([^。！？…]{3,30})/g,
    // Mystery hooks (神秘物品/离奇消失)
    /(?:神秘|奇怪|异常|诡异|古怪|可疑)的?\s*([^。！？…]{2,20})/g,
    // Promise/threat hooks (承诺/威胁)
    /(?:发誓|承诺|保证|威胁|警告)\s*([^。！？…]{3,30})/g,
    // Disappearance hooks (离奇消失)
    /([^。！？…]{2,15})(?:消失|不见|失踪|无影无踪)/g,
    // Object introduction (神秘物品)
    /(?:留下|遗留|藏着|掏出|递过来)\s*(?:一[把个件块])\s*([^。！？…]{2,15})/g,
  ],

  contradictionPairs: [
    // Eye color
    [/蓝.*眼/, /棕.*眼/, "眼睛颜色不一致（蓝 vs 棕）"],
    [/蓝.*眼/, /绿.*眼/, "眼睛颜色不一致（蓝 vs 绿）"],
    [/棕.*眼/, /绿.*眼/, "眼睛颜色不一致（棕 vs 绿）"],
    // Hair color
    [/黑.*发|黑发/, /金.*发|金发/, "头发颜色不一致（黑 vs 金）"],
    [/黑.*发|黑发/, /红.*发|红发/, "头发颜色不一致（黑 vs 红）"],
    [/白.*发|白发/, /黑.*发|黑发/, "头发颜色不一致（白 vs 黑）"],
    // Build
    [/高大|身材高|魁梧/, /矮小|身材矮|瘦小/, "身高描述不一致（高 vs 矮）"],
    [/健壮|壮实|魁梧/, /纤瘦|瘦弱|瘦小/, "体型描述不一致（壮 vs 瘦）"],
    // Age
    [/年轻|年少|少年/, /年迈|年老|苍老|花甲/, "年龄描述不一致（年轻 vs 年老）"],
    // Personality
    [/沉默寡言|不善言辞/, /能说会道|口若悬河|健谈/, "性格描述不一致（沉默 vs 健谈）"],
    [/善良|心地善良/, /残忍|心狠手辣/, "性格描述不一致（善良 vs 残忍）"],
    // Handedness (from character-building.md: physical consistency)
    [/左手.*握|左撇子/, /右手.*握|惯用右手/, "惯用手不一致（左 vs 右）"],
  ],
}

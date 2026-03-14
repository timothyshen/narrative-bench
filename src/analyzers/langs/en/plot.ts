/**
 * @input  English text patterns for plot analysis
 * @output Setup patterns for Chekov tracking, contradiction pairs for conflict detection
 * @pos    lib/analyzers/langs/en — English plot analysis rules
 */

import type { PlotLanguageRules } from "../types"

export const enPlot: PlotLanguageRules = {
  setupPatterns: [
    /(?:noticed|saw|found|discovered)\s+(?:a|an|the)\s+([^.!?]+)/gi,
    /(?:mentioned|spoke of|referred to)\s+([^.!?]+)/gi,
    /(?:mysterious|strange|unusual|peculiar)\s+([^.!?]+)/gi,
  ],

  contradictionPairs: [
    [/blue\s+eyes?/i, /brown\s+eyes?/i, "Eye color differs (blue vs brown)"],
    [/blue\s+eyes?/i, /green\s+eyes?/i, "Eye color differs (blue vs green)"],
    [/brown\s+eyes?/i, /green\s+eyes?/i, "Eye color differs (brown vs green)"],
    [/dark\s+eyes?/i, /light\s+eyes?/i, "Eye color differs (dark vs light)"],
    [/blonde?\s+hair/i, /dark\s+hair/i, "Hair color differs (blonde vs dark)"],
    [/black\s+hair/i, /blonde?\s+hair/i, "Hair color differs (black vs blonde)"],
    [/red\s+hair/i, /black\s+hair/i, "Hair color differs (red vs black)"],
    [/\btall\b/i, /\bshort\b/i, "Height differs (tall vs short)"],
    [/\byoung\b/i, /\bold\b/i, "Age differs (young vs old)"],
    [/\byouthful\b/i, /\belderly\b/i, "Age differs (youthful vs elderly)"],
  ],
}

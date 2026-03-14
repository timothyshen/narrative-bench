/**
 * Plot Analyzer Types
 */

/** Inlined from vector-helpers — semantic search result */
interface SemanticMatch {
  id: string
  title: string
  content: string
  similarity: number
  type: string
  chapterId?: string
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  chapterId?: string;
  timestamp?: number;
  type: string;
  characters: string[];
  locations: string[];
}

export interface PlotHole {
  type: "unresolved" | "contradiction" | "missing_setup" | "timeline_conflict";
  severity: "low" | "medium" | "high";
  description: string;
  affectedChapters: string[];
  suggestion?: string;
}

export interface ChekovGun {
  element: string;
  introduced: {
    chapterId: string;
    chapterTitle: string;
    context: string;
  };
  payoff?: {
    chapterId: string;
    chapterTitle: string;
    context: string;
  };
  status: "pending" | "resolved" | "abandoned";
}

export interface Subplot {
  id: string;
  title: string;
  description: string;
  chapters: string[];
  status: "active" | "resolved" | "abandoned";
  characters: string[];
  resolution?: string;
}

/**
 * Vector-enhanced plot hole result
 */
export interface VectorPlotHole extends PlotHole {
  /** Semantic evidence supporting this plot hole */
  semanticEvidence?: SemanticMatch[];
  /** Confidence level based on semantic analysis */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Vector-enhanced Chekhov's gun
 */
export interface VectorChekovGun extends ChekovGun {
  /** Semantic matches for potential payoffs */
  semanticPayoffs?: SemanticMatch[];
  /** Confidence that this is a real setup */
  setupConfidence: 'high' | 'medium' | 'low';
}

// ── Act Structure ──

export type ActType = "setup" | "confrontation" | "resolution"

export interface ActBoundary {
  /** Chapter index (0-based) where this act begins */
  startIndex: number
  /** Chapter ID */
  startChapterId: string
  /** Detected act type */
  actType: ActType
  /** Confidence 0-1 */
  confidence: number
}

export interface ActStructure {
  /** Detected act boundaries */
  acts: ActBoundary[]
  /** Whether the story follows a recognizable 3-act structure */
  hasThreeActStructure: boolean
  /** Overall structural assessment */
  assessment: "strong" | "weak" | "unclear"
}

// ── Foreshadowing ──

export interface ForeshadowingEcho {
  /** The element that was introduced */
  element: string
  /** Chapter where it first appeared */
  introChapterId: string
  introChapterTitle: string
  /** Chapters where it's echoed/referenced again */
  echoes: Array<{
    chapterId: string
    chapterTitle: string
    context: string
  }>
  /** Whether it has a payoff (final meaningful use) */
  hasPayoff: boolean
  /** Gap between intro and last echo (in chapter count) */
  gapSize: number
}

// ── Setup-Payoff Gap (extends ChekovGun) ──

export interface SetupPayoffGap {
  /** The Chekov gun element */
  element: string
  /** Chapter index where introduced */
  introIndex: number
  /** Current chapter index (or payoff index) */
  currentIndex: number
  /** Total chapters in book */
  totalChapters: number
  /** Gap as percentage of book length */
  gapPercentage: number
  /** Whether gap is problematic (>40%) */
  isProblematic: boolean
  /** Suggestion */
  suggestion: string
}

// ── Promise Tracking ──

export interface StoryPromise {
  /** The promise text */
  promise: string
  /** Character who made it */
  character: string
  /** Chapter where promise was made */
  madeInChapterId: string
  madeInChapterTitle: string
  /** Chapter where fulfilled (if any) */
  fulfilledInChapterId?: string
  fulfilledInChapterTitle?: string
  /** Status */
  status: "fulfilled" | "broken" | "pending"
}

// ── Inciting Incident ──

export interface IncitingIncident {
  /** Chapter where the incident likely occurs */
  chapterId: string
  chapterTitle: string
  /** Chapter index */
  chapterIndex: number
  /** Likelihood this is the true inciting incident (0-1) */
  likelihood: number
  /** Detected signals */
  signals: string[]
}

// ── Midpoint ──

export interface Midpoint {
  /** Chapter at or near the midpoint */
  chapterId: string
  chapterTitle: string
  chapterIndex: number
  /** Type of midpoint event detected */
  eventType: "revelation" | "betrayal" | "goal_reset" | "escalation" | "unknown"
  /** Confidence 0-1 */
  confidence: number
  /** Detected signals */
  signals: string[]
}

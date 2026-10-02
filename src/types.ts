export type POSCategory =
  | "NOUN"
  | "PROPN"
  | "ADJ"
  | "VERB"
  | "ADV"
  | "PRON"
  | "DET"
  | "ADP"
  | "CONJ"
  | "PUNCT"
  | "NUM"
  | "X";

export type SentimentLabel = "Positive" | "Negative" | "Neutral";

export type CanonicalCategory =
  | "Battery & Power"
  | "Audio & Sound"
  | "Display & Visuals"
  | "Camera & Imaging"
  | "Performance & Software"
  | "Build Quality & Design"
  | "Comfort & Ergonomics"
  | "Customer Service & Value"
  | "General & Other";

export interface Token {
  index: number;
  text: string;
  lower: string;
  lemma: string;
  pos: POSCategory;
  tag: string;
  dep: string;
  headIndex: number;
}

export interface Review {
  review_id: number | string;
  product: string;
  category: string;
  rating?: number | null;
  review_text: string;
  product_id?: string;
  verified_purchase?: boolean | string;
}

export interface AspectOpinionPair {
  aspect: string;
  opinion: string;
  rawSentence?: string;
}

export interface AspectSentimentResult {
  aspect: string;
  opinion: string;
  sentiment: SentimentLabel;
  score: number;
  method: string;
}

export interface CategorizedAspectResult extends AspectSentimentResult {
  category: CanonicalCategory;
  confidence: number;
}

export interface ReviewAnalysis {
  review_id: number | string;
  product: string;
  category: string;
  rating?: number | null;
  review_text: string;
  aspects: CategorizedAspectResult[];
}

export interface AspectCount {
  Positive: number;
  Negative: number;
  Neutral: number;
}

export interface CategorySummary {
  category: CanonicalCategory;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  nss: number; // Net Sentiment Score: (Pos - Neg) / Total * 100
  status: string;
  aspects: Record<string, AspectCount>;
}

export type ProductAspectMatrix = Record<string, Record<string, AspectCount>>;

export type HierarchicalProductMatrix = Record<string, Record<CanonicalCategory, CategorySummary>>;

export interface ProductComparisonMetric {
  category: CanonicalCategory;
  productA: {
    name: string;
    totalMentions: number;
    nss: number;
    positiveRate: number;
  };
  productB: {
    name: string;
    totalMentions: number;
    nss: number;
    positiveRate: number;
  };
  winner: string;
  verdictNote: string;
}

export interface ProductComparisonReport {
  productA: string;
  productB: string;
  metrics: ProductComparisonMetric[];
  overallWinner: string;
}

export interface TextStatistics {
  avg_words: number;
  min_words: number;
  max_words: number;
  median_words: number;
  avg_chars: number;
}

export interface EDAReport {
  total_reviews: number;
  unique_products: number;
  unique_categories: number;
  categories_breakdown: Record<string, number>;
  top_products: Record<string, number>;
  text_stats: TextStatistics;
  multi_aspect_reviews_est: number;
  multi_aspect_pct: number;
  rating_distribution?: Record<string, number>;
  average_rating?: number | null;
}

export interface PipelineOptions {
  dataset: "sample" | "kaggle" | string;
  sampleSize?: number;
  category?: string;
  product?: string;
  showEDA?: boolean;
  exportResults?: boolean;
  outputDir?: string;
  compare?: [string, string];
}

export interface CompareUrlsRequest {
  urlA?: string;
  urlB?: string;
  reviewsA?: string;
  reviewsB?: string;
}

export interface AspectMetricSummary {
  aspect: string;
  category: CanonicalCategory;
  positive: number;
  negative: number;
  neutral: number;
  mentionCount: number;
  nss: number; // Net Sentiment Score (-100 to 100)
}

export interface ProductAspectProfile {
  productName: string;
  url?: string;
  platform: string;
  reviewCount: number;
  averageRating: number | null;
  aspects: AspectMetricSummary[];
  categories: Record<string, CategorySummary>;
}

export type WinnerType = "A" | "B" | "tie" | "insufficient";

export interface AspectHeadToHeadMetric {
  aspect: string;
  category: CanonicalCategory;
  productA: {
    nss: number;
    mentionCount: number;
    positive: number;
    negative: number;
  };
  productB: {
    nss: number;
    mentionCount: number;
    positive: number;
    negative: number;
  };
  scoreGap: number;
  winner: WinnerType;
  winnerName: string;
  reason: string;
}

export interface UrlComparisonResult {
  productA: ProductAspectProfile;
  productB: ProductAspectProfile;
  categoryMetrics: ProductComparisonMetric[];
  aspectMetrics: AspectHeadToHeadMetric[];
  overallWinner: string;
  winnerProduct: "A" | "B" | "Tie" | "Inconclusive";
  verdictSummary: string;
  generatedAt: string;
}

export type JobStatus = "running" | "done" | "error";
export type JobProgressStage =
  | "Validating"
  | "Scraping A"
  | "Scraping B"
  | "Analyzing"
  | "Comparing"
  | "Complete"
  | "Failed";

export interface JobState {
  jobId: string;
  status: JobStatus;
  progress: JobProgressStage;
  percent: number;
  error?: string;
  failedProduct?: "A" | "B" | "both";
  result?: UrlComparisonResult;
  createdAt: number;
  updatedAt: number;
}


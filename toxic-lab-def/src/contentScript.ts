/**
 * Content Script for Toxic Lab
 * MVP version:
 * - Auto scans the feed repeatedly
 * - Re-analyzes tweets if text changes
 * - Flags controversial / war / violent / toxic tweets better
 * - Stores per-tweet analysis
 * - Exposes flagged tweets + emotion + reasons to popup
 * - Uses more dramatic pH logic
 * - Neutral tweets do NOT affect the pH meter
 */

type EmotionName = 'anger' | 'sadness' | 'fear' | 'anxiety' | 'joy';
type DominantEmotion = EmotionName | 'neutral';

type TweetAnalysis = {
  key: string;
  text: string;
  toxicScore: number;
  ph: number;
  dominantEmotion: DominantEmotion;
  matchedCategories: string[];
  reasons: string[];
  highlighted: boolean;
};

type GlobalStats = {
  totalTweets: number;
  emotions: {
    sadness: number;
    anxiety: number;
    anger: number;
    fear: number;
    joy: number;
    neutral: number;
  };
  avgPh: number;
};

const analyzedTweets = new Map<string, TweetAnalysis>();

let analyzedData: GlobalStats = {
  totalTweets: 0,
  emotions: { sadness: 0, anxiety: 0, anger: 0, fear: 0, joy: 0, neutral: 0 },
  avgPh: 7.0
};

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTweetKey(text: string) {
  return normalizeText(text);
}

function resetGlobalStats() {
  analyzedData = {
    totalTweets: 0,
    emotions: { sadness: 0, anxiety: 0, anger: 0, fear: 0, joy: 0, neutral: 0 },
    avgPh: 7.0
  };
}

function rebuildGlobalStats() {
  resetGlobalStats();

  const tweets = [...analyzedTweets.values()];
  analyzedData.totalTweets = tweets.length;

  if (tweets.length === 0) {
    analyzedData.avgPh = 7.0;
    return;
  }

  let weightedShiftSum = 0;
  let effectiveWeightSum = 0;

  for (const tweet of tweets) {
    const emotion = tweet.dominantEmotion;

    if (emotion === 'sadness') analyzedData.emotions.sadness += 1;
    if (emotion === 'anxiety') analyzedData.emotions.anxiety += 1;
    if (emotion === 'anger') analyzedData.emotions.anger += 1;
    if (emotion === 'fear') analyzedData.emotions.fear += 1;
    if (emotion === 'joy') analyzedData.emotions.joy += 1;
    if (emotion === 'neutral') analyzedData.emotions.neutral += 1;

    // Neutral should NOT move the pH meter.
    if (emotion === 'neutral') {
      continue;
    }

    let baseShift = 0;

    if (emotion === 'anger') baseShift = 4.8;
    else if (emotion === 'fear') baseShift = 4.4;
    else if (emotion === 'anxiety') baseShift = 2.9;
    else if (emotion === 'joy') baseShift = -0.2;
    else if (emotion === 'sadness') baseShift = -0.9;

    // Stronger contribution from more intense tweets
    const intensityBonus = Math.max(0, tweet.toxicScore * 0.32);

    // Highlighted tweets should influence the meter more
    const weight = tweet.highlighted ? 1.65 : 0.9;

    weightedShiftSum += (baseShift + intensityBonus) * weight;
    effectiveWeightSum += weight;
  }

  // If everything was neutral, keep the meter centered
  if (effectiveWeightSum === 0) {
    analyzedData.avgPh = 7.0;
    return;
  }

  const averageShift = weightedShiftSum / effectiveWeightSum;
  analyzedData.avgPh = Math.max(0, Math.min(14, 7 + averageShift));
}

function analyzeSentiment(text: string) {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ");

  const words = normalized.split(/\s+/).filter(Boolean);
  const fullText = ` ${normalized} `;

  const keywords: Record<EmotionName, string[]> = {
    anger: [
      'odio', 'muere', 'basura', 'estupido', 'idiota', 'asco', 'maldito',
      'mierda', 'puto', 'pendejo', 'zorra', 'malparido', 'rabia', 'harto',
      'hate', 'stupid', 'idiot', 'trash', 'kill', 'die', 'disgusting',
      'traitor', 'scum', 'garbage', 'loser', 'moron'
    ],
    sadness: [
      'triste', 'llorar', 'deprimido', 'solo', 'pena', 'dolor', 'perdido',
      'vacio', 'desamor', 'melancolia', 'sad', 'cry', 'depressed', 'lonely',
      'grief', 'hopeless'
    ],
    fear: [
      'miedo', 'terror', 'panico', 'peligro', 'amenaza', 'horror', 'temor',
      'fear', 'terror', 'panic', 'danger', 'threat', 'bomb', 'attack',
      'missile', 'war', 'bombing', 'explosion', 'nuclear'
    ],
    anxiety: [
      'ansiedad', 'nervios', 'estres', 'presion', 'tenso', 'angustia', 'crisis',
      'anxiety', 'stress', 'tense', 'crisis', 'overwhelmed', 'worried', 'chaos'
    ],
    joy: [
      'feliz', 'alegre', 'amor', 'genial', 'increible', 'bueno', 'risa',
      'exito', 'fiesta', 'paz', 'contento', 'divertido',
      'happy', 'great', 'amazing', 'love', 'fun', 'success', 'awesome'
    ]
  };

  const categories: Record<string, string[]> = {
    violence: [
      'kill', 'murder', 'bomb', 'bombing', 'attack', 'war', 'missile', 'shoot',
      'explosion', 'bomba', 'guerra', 'ataque', 'asesinar', 'matar', 'violence',
      'violent', 'dead', 'death', 'destroy'
    ],
    politics: [
      'trump', 'charlie kirk', 'biden', 'election', 'president', 'presidente',
      'republican', 'democrat', 'government', 'gobierno', 'politics', 'politica'
    ],
    geopolitics: [
      'iran', 'israel', 'ukraine', 'russia', 'gaza', 'middle east', 'teheran', 'tehran'
    ],
    harassment: [
      'idiot', 'stupid', 'trash', 'basura', 'pendejo', 'estupido', 'idiota',
      'zorra', 'moron', 'scum', 'garbage'
    ],
    catastrophe: [
      'dead', 'death', 'fatal', 'collapse', 'disaster', 'muerto', 'muerte',
      'desastre', 'tragedy', 'catastrophe'
    ],
    controversy: [
      'scam', 'fraud', 'corrupt', 'controversial', 'estafa', 'fraude', 'corrupto',
      'manipulation', 'manipulacion', 'propaganda', 'lie', 'lies'
    ],
    public_figures: [
      'mrbeast', 'elon', 'musk', 'trump', 'charlie kirk'
    ]
  };

  const scores: Record<EmotionName, number> = {
    anger: 0,
    sadness: 0,
    fear: 0,
    anxiety: 0,
    joy: 0
  };

  const matchedCategories = new Set<string>();
  const reasons: string[] = [];

  for (const word of words) {
    if (word.length < 3) continue;

    for (const [emotion, list] of Object.entries(keywords)) {
      if (list.some((k) => word.includes(k))) {
        scores[emotion as EmotionName] += 1;
      }
    }
  }

  for (const [category, list] of Object.entries(categories)) {
    for (const keyword of list) {
      if (fullText.includes(` ${keyword} `)) {
        matchedCategories.add(category);
        reasons.push(`matched:${category}:${keyword}`);
      }
    }
  }

  let toxicScore = 0;

  toxicScore += scores.anger * 2.8;
  toxicScore += scores.fear * 1.8;
  toxicScore += scores.anxiety * 1.4;
  toxicScore += scores.sadness * 0.6;
  toxicScore -= scores.joy * 1.6;

  if (matchedCategories.has('violence')) toxicScore += 3.2;
  if (matchedCategories.has('harassment')) toxicScore += 2.6;
  if (matchedCategories.has('catastrophe')) toxicScore += 2.0;
  if (matchedCategories.has('controversy')) toxicScore += 1.6;
  if (matchedCategories.has('geopolitics')) toxicScore += 1.6;

  if (matchedCategories.has('politics') && matchedCategories.has('violence')) {
    toxicScore += 2.4;
    reasons.push('context:politics+violence');
  }

  if (matchedCategories.has('geopolitics') && matchedCategories.has('violence')) {
    toxicScore += 2.6;
    reasons.push('context:geopolitics+violence');
  }

  if (matchedCategories.has('public_figures') && matchedCategories.has('controversy')) {
    toxicScore += 1.5;
    reasons.push('context:public_figure+controversy');
  }

  const capsCount = (text.match(/[A-Z]/g) || []).length;
  if (text.length > 12 && capsCount > text.length * 0.45) {
    toxicScore += 1.2;
    reasons.push('style:excessive_caps');
    scores.anger += 0.5;
  }

  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount >= 3) {
    toxicScore += 0.6;
    reasons.push('style:many_exclamations');
  }

  const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const dominantEmotion =
    sortedScores[0] && sortedScores[0][1] > 0
      ? (sortedScores[0][0] as DominantEmotion)
      : 'neutral';

  return {
    scores,
    toxicScore,
    matchedCategories: [...matchedCategories],
    reasons,
    dominantEmotion
  };
}

function getTweetTextElement(tweetElement: HTMLElement) {
  return tweetElement.querySelector('div[data-testid="tweetText"]') as HTMLElement | null;
}

function getSafeAnchor(tweetElement: HTMLElement) {
  const textElement = getTweetTextElement(tweetElement);
  return textElement?.parentElement || tweetElement;
}

function ensureBadge(tweetElement: HTMLElement) {
  let badge = tweetElement.querySelector('.toxic-lab-badge') as HTMLElement | null;

  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'toxic-lab-badge';
    badge.style.marginTop = '8px';
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '6px';
    badge.style.padding = '4px 8px';
    badge.style.borderRadius = '999px';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '700';
    badge.style.lineHeight = '1';
    badge.style.background = 'rgba(255,78,0,0.12)';
    badge.style.border = '1px solid rgba(255,78,0,0.28)';
    badge.style.color = '#ffb089';
    badge.style.maxWidth = '100%';
    badge.style.whiteSpace = 'nowrap';

    getSafeAnchor(tweetElement).appendChild(badge);
  }

  return badge;
}

function ensureDetails(tweetElement: HTMLElement) {
  let details = tweetElement.querySelector('.toxic-lab-details') as HTMLElement | null;

  if (!details) {
    details = document.createElement('div');
    details.className = 'toxic-lab-details';
    details.style.marginTop = '6px';
    details.style.fontSize = '11px';
    details.style.lineHeight = '1.4';
    details.style.color = '#cfcfcf';
    details.style.opacity = '0.92';
    details.style.wordBreak = 'break-word';

    getSafeAnchor(tweetElement).appendChild(details);
  }

  return details;
}

function clearDecorations(tweetElement: HTMLElement) {
  tweetElement.style.border = "";
  tweetElement.style.boxShadow = "";
  tweetElement.style.borderRadius = "";
  tweetElement.style.margin = "";
  tweetElement.style.transform = "";
  tweetElement.style.transition = "all 0.35s ease";

  const badge = tweetElement.querySelector('.toxic-lab-badge');
  if (badge) badge.remove();

  const details = tweetElement.querySelector('.toxic-lab-details');
  if (details) details.remove();
}

function decorateTweet(
  tweetElement: HTMLElement,
  dominantEmotion: DominantEmotion,
  ph: number,
  categories: string[],
  reasons: string[],
  shouldHighlight: boolean
) {
  clearDecorations(tweetElement);

  tweetElement.style.transition = "all 0.35s ease";

  if (!shouldHighlight) return;

  tweetElement.style.border = "2px solid #ff4e00";
  tweetElement.style.boxShadow = "0 0 28px rgba(255, 78, 0, 0.36)";
  tweetElement.style.borderRadius = "16px";
  tweetElement.style.margin = "12px 0";
  tweetElement.style.transform = "scale(1.012)";

  const badge = ensureBadge(tweetElement);
  badge.textContent = `${String(dominantEmotion).toUpperCase()} · pH ${ph.toFixed(1)}`;

  const details = ensureDetails(tweetElement);
  const visibleReasons = reasons
    .slice(0, 3)
    .map((r) => r.replace(/^matched:/, '').replace(/^context:/, 'context: '));

  details.textContent = `Sensitive because: ${categories.join(', ') || 'high toxicity'}${visibleReasons.length ? ` • ${visibleReasons.join(' • ')}` : ''}`;
}

function processTweet(tweetElement: HTMLElement) {
  const textElement = getTweetTextElement(tweetElement);
  if (!textElement) return;

  const text = textElement.textContent || "";
  const key = buildTweetKey(text);

  if (!key) return;

  if (tweetElement.dataset.toxicFingerprint === key) {
    return;
  }

  tweetElement.dataset.toxicFingerprint = key;

  const result = analyzeSentiment(text);
  const currentPh = Math.max(0, Math.min(14, 7 + (result.toxicScore * 1.35)));

  const shouldHighlight =
    result.toxicScore >= 2.8 ||
    result.matchedCategories.includes('violence') ||
    (result.matchedCategories.includes('politics') && result.matchedCategories.includes('violence')) ||
    (result.matchedCategories.includes('geopolitics') && result.matchedCategories.includes('violence')) ||
    (result.matchedCategories.includes('public_figures') && result.matchedCategories.includes('controversy')) ||
    (result.dominantEmotion === 'anger' && result.toxicScore >= 2.2) ||
    (result.dominantEmotion === 'fear' && result.toxicScore >= 2.2) ||
    (result.dominantEmotion === 'anxiety' && result.toxicScore >= 2.6);

  decorateTweet(
    tweetElement,
    result.dominantEmotion,
    currentPh,
    result.matchedCategories,
    result.reasons,
    shouldHighlight
  );

  analyzedTweets.set(key, {
    key,
    text,
    toxicScore: result.toxicScore,
    ph: currentPh,
    dominantEmotion: result.dominantEmotion,
    matchedCategories: result.matchedCategories,
    reasons: result.reasons,
    highlighted: shouldHighlight
  });

  rebuildGlobalStats();

  console.log(
    `Toxic Lab: analyzed tweet | score=${result.toxicScore.toFixed(2)} | ph=${currentPh.toFixed(2)} | emotion=${result.dominantEmotion} | highlighted=${shouldHighlight}`
  );
}

function scanFeed() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tweet => processTweet(tweet as HTMLElement));
}

const observer = new MutationObserver((mutations) => {
  let foundNew = false;

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;

      if (node.matches?.('article[data-testid="tweet"]')) {
        foundNew = true;
        processTweet(node);
      }

      const nestedTweets = node.querySelectorAll?.('article[data-testid="tweet"]');
      if (nestedTweets && nestedTweets.length > 0) {
        foundNew = true;
        nestedTweets.forEach(tweet => processTweet(tweet as HTMLElement));
      }
    });
  });

  if (foundNew) {
    console.log(`Toxic Lab: new tweets detected. Total analyzed: ${analyzedData.totalTweets}`);
  }
});

let autoScanInterval: number | null = null;

function startAutoScan() {
  if (autoScanInterval !== null) return;

  autoScanInterval = window.setInterval(() => {
    scanFeed();
  }, 3000);
}

function stopAutoScan() {
  if (autoScanInterval !== null) {
    clearInterval(autoScanInterval);
    autoScanInterval = null;
  }
}

function isTwitterPage() {
  return location.hostname.includes('x.com') || location.hostname.includes('twitter.com');
}

if (isTwitterPage()) {
  observer.observe(document.body, { childList: true, subtree: true });
  scanFeed();
  startAutoScan();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAutoScan();
  } else if (isTwitterPage()) {
    scanFeed();
    startAutoScan();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_STATS") {
    sendResponse({
      ...analyzedData,
      tweets: [...analyzedTweets.values()]
        .filter((tweet) => tweet.highlighted)
        .sort((a, b) => b.toxicScore - a.toxicScore)
        .slice(0, 8)
    });
    return;
  }

  if (request.action === "GET_TWEETS") {
    sendResponse({
      stats: analyzedData,
      tweets: [...analyzedTweets.values()]
    });
    return;
  }

  if (request.action === "FORCE_SCAN") {
    console.log("Toxic Lab: force scan requested");
    scanFeed();

    sendResponse({
      ...analyzedData,
      tweets: [...analyzedTweets.values()]
        .filter((tweet) => tweet.highlighted)
        .sort((a, b) => b.toxicScore - a.toxicScore)
        .slice(0, 8)
    });
    return;
  }
});

console.log("Toxic Lab: Content Script Loaded & Observing");

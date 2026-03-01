/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { Zap, RefreshCw, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import skull from './assets/skull.png';
import dna from './assets/dna.png';
import radioactive from './assets/radioactive.png';
import toxic_lab from './assets/toxic.png';
import dreieck from './assets/dreieck.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const EMOTION_COLORS: Record<string, string> = {
  Sadness: '#1E7B8E',
  Anxiety: '#9DD4CF',
  Anger: '#E5D4B5',
  Fear: '#F5A623',
  Joy: '#C84B31',
};

const INITIAL_EMOTIONS = [
  { name: 'Sadness', value: 0 },
  { name: 'Anxiety', value: 0 },
  { name: 'Anger', value: 0 },
  { name: 'Fear', value: 0 },
  { name: 'Joy', value: 0 },
];

type FlaggedTweet = {
  key: string;
  text: string;
  toxicScore: number;
  ph: number;
  dominantEmotion: string;
  matchedCategories: string[];
  reasons: string[];
  highlighted: boolean;
};

export default function App() {
  const [emotions, setEmotions] = useState(INITIAL_EMOTIONS);
  const [phLevel, setPhLevel] = useState(7.0);
  const [totalTweets, setTotalTweets] = useState(0);
  const [flaggedTweets, setFlaggedTweets] = useState<FlaggedTweet[]>([]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExtensionMode, setIsExtensionMode] = useState(false);
  const [isTwitterTab, setIsTwitterTab] = useState(false);

  const fetchStatsFromExtension = useCallback(async (force = false) => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    setIsAnalyzing(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url || '';
      const onTwitter = url.includes('x.com') || url.includes('twitter.com');

      setIsTwitterTab(onTwitter);

      if (!onTwitter || !tab?.id) {
        setPhLevel(7.0);
        setTotalTweets(0);
        setEmotions(INITIAL_EMOTIONS);
        setFlaggedTweets([]);
        return;
      }

      const action = force ? 'FORCE_SCAN' : 'GET_STATS';
      const response = await chrome.tabs.sendMessage(tab.id, { action });

      if (!response) return;

      setPhLevel(typeof response.avgPh === 'number' ? response.avgPh : 7.0);
      setTotalTweets(typeof response.totalTweets === 'number' ? response.totalTweets : 0);
      setFlaggedTweets(Array.isArray(response.tweets) ? response.tweets : []);

      const rawEmotions = response.emotions || {};
      const total =
        (Number(rawEmotions.sadness || 0) +
          Number(rawEmotions.anxiety || 0) +
          Number(rawEmotions.anger || 0) +
          Number(rawEmotions.fear || 0) +
          Number(rawEmotions.joy || 0)) || 0;

      if (total === 0) {
        setEmotions(INITIAL_EMOTIONS);
      } else {
        setEmotions([
          { name: 'Sadness', value: Math.round((Number(rawEmotions.sadness || 0) / total) * 100) },
          { name: 'Anxiety', value: Math.round((Number(rawEmotions.anxiety || 0) / total) * 100) },
          { name: 'Anger', value: Math.round((Number(rawEmotions.anger || 0) / total) * 100) },
          { name: 'Fear', value: Math.round((Number(rawEmotions.fear || 0) / total) * 100) },
          { name: 'Joy', value: Math.round((Number(rawEmotions.joy || 0) / total) * 100) },
        ]);
      }
    } catch (err) {
      console.error('Extension communication error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      setIsExtensionMode(true);
      document.documentElement.classList.add('is-extension');
      fetchStatsFromExtension(false);
    }
  }, [fetchStatsFromExtension]);

  useEffect(() => {
    if (!isExtensionMode) return;

    const id = window.setInterval(() => {
      fetchStatsFromExtension(false);
    }, 10000);

    return () => window.clearInterval(id);
  }, [isExtensionMode, fetchStatsFromExtension]);

  const phPercent = Math.max(0, Math.min(100, (phLevel / 14) * 100));

  const dramaticToximeterLevel = Math.max(
    0,
    Math.min(100, Math.pow(phLevel / 14, 0.72) * 100)
  );

  const toxicityLevels = [
    { color: '#1E7B8E', height: 20 },
    { color: '#9DD4CF', height: 40 },
    { color: '#E5D4B5', height: 60 },
    { color: '#F5A623', height: 80 },
    { color: '#C84B31', height: 100 },
  ];

  const PopupUI = () => (
    <div className="w-[360px] bg-[#0a0a0a] p-3 text-white font-sans">
      <div className="space-y-3">
        <div className="bg-[#2a2a2a] rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={toxic_lab}
              alt="logo"
              className="w-32 object-contain"
            />
          </div>

          <div className="flex items-center gap-2">
            {isAnalyzing && (
              <div className="flex items-center gap-1 text-[10px] text-[#9DD4CF]">
                <Activity className="w-3 h-3 animate-pulse" />
                LIVE
              </div>
            )}
            <span className="text-[10px] text-gray-400 font-mono">
              {totalTweets} TWEETS
            </span>
          </div>
        </div>

        {!isTwitterTab && (
          <div className="bg-[#2a2a2a] rounded-2xl px-4 py-3">
            <p className="text-xs text-gray-400">
              Toxic Lab is resting. Open X/Twitter to start automatic feed analysis.
            </p>
          </div>
        )}

        <div className="bg-[#2a2a2a] rounded-2xl px-4 py-4 pb-8">
          <div className="flex items-center gap-2 mb-4">
            <img src={skull} alt="Skull" className="w-6 h-6 object-contain" />
            <h2 className="text-lg font-medium text-white">User pH – {phLevel.toFixed(1)}</h2>
          </div>

          <div className="relative">
            <div className="h-8 rounded-full overflow-hidden flex">
              <div className="flex-1 bg-[#005f73] flex items-center justify-start pl-2">
                <span className="text-white font-small text-[10px]">Boring</span>
              </div>
              <div className="flex-1 bg-[#0a9396]" />
              <div className="flex-1 bg-[#94d2bd]" />
              <div className="flex-1 bg-[#e9d8a6]" />
              <div className="flex-1 bg-[#ee9b00]" />
              <div className="flex-1 bg-[#ca6702]" />
              <div className="flex-1 bg-[#bb3e03]" />
              <div className="flex-1 bg-[#ae2012]" />
              <div className="flex-1 bg-[#9b2226] flex items-center justify-end pr-2">
                <span className="text-white font-small text-[10px]">Toxic</span>
              </div>
            </div>

            <motion.div
              animate={{ left: `calc(${phPercent}% - 10px)` }}
              transition={{ type: 'spring', stiffness: 70, damping: 16 }}
              className="absolute -bottom-5"
            >
              <img src={dreieck} alt="Picker" className="w-5 h-5 object-contain" />
            </motion.div>
          </div>

          {/*<div className="flex justify-between items-center mt-7 text-[10px] font-mono text-gray-400">
            <span>pH 0.0</span>
            <span className="text-white">CURRENT: {phLevel.toFixed(1)}</span>
            <span>pH 14.0</span>
          </div>*/}
        </div>

        <div className="bg-[#2a2a2a] rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2 mb-4">
            <img src={dna} alt="DNA" className="w-6 h-6 object-contain" />
            <h2 className="text-lg font-medium text-white">Feed DNA</h2>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2 min-w-[120px]">
              {emotions.map((emotion) => (
                <div key={emotion.name} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-sm"
                    style={{ backgroundColor: EMOTION_COLORS[emotion.name] }}
                  />
                  <span className="text-white text-sm font-light">
                    {emotion.name}
                  </span>
                  <span className="text-gray-400 text-xs font-mono ml-auto">
                    {emotion.value}%
                  </span>
                </div>
              ))}
            </div>

            <div className="w-[150px] h-[150px] shrink-0">
              {totalTweets === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={emotions}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={68}
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                    >
                      {emotions.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={EMOTION_COLORS[entry.name]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="bg-[#2a2a2a] rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2 mb-4">
            <img
              src={radioactive}
              alt="Radioactive"
              className="w-6 h-6 object-contain"
            />
            <h2 className="text-lg font-medium text-white">Toximeter</h2>
          </div>

          {totalTweets === 0 ? (
            <div className="text-sm text-gray-500">
              {isTwitterTab ? 'Waiting for feed data...' : 'Open X/Twitter to begin.'}
            </div>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-end gap-1 h-10">
                {toxicityLevels.map((level, index) => (
                  <motion.div
                    key={index}
                    className="w-3 rounded-t-md transition-all duration-300"
                    animate={{
                      opacity: dramaticToximeterLevel >= ((index + 1) / toxicityLevels.length) * 100 ? 1 : 0.18,
                      scaleY: dramaticToximeterLevel >= ((index + 1) / toxicityLevels.length) * 100 ? 1.08 : 1,
                    }}
                    style={{
                      backgroundColor: level.color,
                      height: `${level.height}%`,
                      transformOrigin: 'bottom'
                    }}
                  />
                ))}
              </div>

              <div className="ml-8 self-stretch flex items-center flex-1 text-left">
                <span className="text-white text-sm font-light whitespace-nowrap">
                  {phLevel > 10
                    ? 'Radioactive Zone'
                    : phLevel > 7
                      ? 'Warning Area'
                      : 'Safe Environment'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#2a2a2a] rounded-2xl px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white">Flagged tweets</h2>
            <span className="text-[10px] font-mono text-gray-400">
              {flaggedTweets.length} visible
            </span>
          </div>

          {flaggedTweets.length === 0 ? (
            <p className="text-xs text-gray-500">No highlighted tweets detected yet.</p>
          ) : (
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {flaggedTweets.map((tweet, index) => (
                <div
                  key={`${tweet.key}-${index}`}
                  className="rounded-xl border border-white/5 bg-black/20 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wide text-[#F5A623]">
                      {tweet.dominantEmotion}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      pH {tweet.ph.toFixed(1)}
                    </span>
                  </div>

                  <p className="text-[11px] leading-4 text-gray-200 line-clamp-4">
                    {tweet.text}
                  </p>

                  <div className="flex flex-wrap gap-1">
                    {tweet.matchedCategories.map((category) => (
                      <span
                        key={category}
                        className="text-[9px] uppercase tracking-wide px-2 py-1 rounded-full bg-[#1E7B8E]/15 border border-[#1E7B8E]/25 text-[#9DD4CF]"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={() => fetchStatsFromExtension(true)}
            className="w-full bg-[#1E7B8E]/20 hover:bg-[#1E7B8E]/35 text-[#9DD4CF] text-[11px] font-medium py-2.5 rounded-xl border border-[#1E7B8E]/30 transition-all flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            FORCE FEED SCAN
          </button>

          <button
            onClick={() => fetchStatsFromExtension(false)}
            className="w-full bg-transparent hover:bg-white/5 text-gray-400 text-[11px] font-medium py-2 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isAnalyzing && 'animate-spin')} />
            Sync Laboratory
          </button>
        </div>
      </div>
    </div>
  );

  if (isExtensionMode) {
    return (
      <div className="bg-[#0a0a0a] min-h-fit">
        <PopupUI />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] p-6 gap-8 font-sans">
      {!isExtensionMode && (
        <div className="w-full max-w-md bg-[#2a2a2a] rounded-3xl p-6 border border-gray-800 text-white space-y-4">
          <div className="flex items-center gap-2 text-[#F5A623]">
            <Zap className="w-5 h-5" />
            <h2 className="font-bold uppercase tracking-widest text-sm">Simulation Mode</h2>
          </div>
          <p className="text-xs text-gray-400">
            To see real analysis, install the extension and use it on Twitter/X.
          </p>
          <div className="p-4 bg-black/30 rounded-xl border border-white/5 text-[10px] font-mono text-green-400">
            <p className="text-white mb-2 font-bold underline">Toxic Lab Instructions:</p>
            <p>1. npm install && npm run build</p>
            <p>2. Load the dist folder in chrome://extensions</p>
            <p>3. Open X/Twitter and scroll</p>
          </div>
        </div>
      )}
      <PopupUI />
    </div>
  );
}

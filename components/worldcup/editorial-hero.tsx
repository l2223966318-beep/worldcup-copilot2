"use client";

import type { MouseEvent } from "react";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import styles from "./editorial-hero.module.css";

export function EditorialWorldCupHero() {
  const [videoActive, setVideoActive] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoError, setVideoError] = useState("");

  function navigateToSection(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(event.currentTarget.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
  }

  function toggleVideo() {
    setVideoError("");
    setVideoActive(active => !active);
  }

  return (
    <section className={styles.hero} aria-labelledby="worldcup-hero-title">
      <picture className={styles.artwork}>
        <source media="(max-width: 700px)" srcSet="/images/worldcup-hero-editorial-mobile-v2.webp" />
        {/* The hero is the first meaningful image; do not wait for lazy loading. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/worldcup-hero-editorial-v2.webp" alt="" width={1774} height={887} fetchPriority="high" loading="eager" decoding="async" />
      </picture>
      {videoActive ? (
        <video className={styles.video} autoPlay loop muted={videoMuted} playsInline preload="none" aria-hidden="true"
          onError={() => { setVideoActive(false); setVideoError("视频暂不可用，已切回主视觉。"); }}>
          <source src="/videos/worldcup-hero.mp4" type="video/mp4" />
        </video>
      ) : null}
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h1 id="worldcup-hero-title" className={styles.title} aria-label="WorldCup Copilot">
            <span>WorldCup</span>
            <span>Copilot</span>
          </h1>
          <p className={styles.statement}>
            把每一场比赛，<br />
            变成<strong>高光时刻。</strong>
          </p>
          <p className={styles.description}>从实时赛况到内容灵感，让每个值得讲述的瞬间被看见。</p>
          <div className={styles.actions}>
            <a href="#opportunity-pool" onClick={navigateToSection} className={styles.primary}>
              进入赛事中心 <ArrowRight size={19} aria-hidden="true" />
            </a>
            <a href="#hot-moments" onClick={navigateToSection} className={styles.secondary}>
              查看热点时刻 <ArrowUpRight size={19} aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className={styles.footer}>
          <div className={styles.rule} aria-hidden="true" />
          <div className={styles.mediaControls} aria-label="背景视频控制">
            {videoActive ? (
              <button type="button" className={styles.control} onClick={() => setVideoMuted(muted => !muted)}
                aria-label={videoMuted ? "打开声音" : "静音"} title={videoMuted ? "打开声音" : "静音"}>
                {videoMuted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
              </button>
            ) : null}
            <button type="button" className={styles.control} onClick={toggleVideo} aria-pressed={videoActive}
              aria-label={videoActive ? "暂停背景视频" : "播放背景视频"} title={videoActive ? "暂停背景视频" : "播放背景视频"}>
              {videoActive ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {videoError ? <p className={styles.mediaError} role="status">{videoError}</p> : null}
      </div>
    </section>
  );
}
